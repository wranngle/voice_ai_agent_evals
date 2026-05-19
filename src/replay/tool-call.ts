/**
 * Schema-validated tool-call replay.
 *
 * Records of real tool calls captured from the ElevenLabs post-call webhook
 * (same upstream source as the round-1 latency-waterfall capture) are stored
 * as JSONL. Each record carries `tool_name` plus `arguments`. The replay
 * loader resolves a JSON Schema file per tool from `schemas/tool-calls/` and
 * validates the arguments against it; mismatches are surfaced so an eval run
 * can fail loudly the moment a deployed agent drifts from its declared tool
 * contract.
 *
 * No runtime dependency on ajv or similar — the validator covers the
 * constructs we actually use in `schemas/tool-calls/*.schema.json` (type,
 * required, properties, additionalProperties, enum, pattern, format=uri,
 * min/max length, min/max value, integer). Keep it that way; if a new
 * schema feature is needed, extend `validateValue` rather than pulling in
 * a full validator.
 */

import {readFileSync, readdirSync} from 'node:fs';
import {basename, join} from 'node:path';

export type ToolCallRecord = {
  conversation_id: string;
  turn_index: number;
  tool_name: string;
  arguments: Record<string, unknown>;
};

export type JsonSchema = {
  $id?: string;
  $schema?: string;
  title?: string;
  description?: string;
  type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'null';
  required?: string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: boolean | JsonSchema;
  enum?: unknown[];
  pattern?: string;
  format?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  items?: JsonSchema;
};

export type SchemaRegistry = Record<string, JsonSchema>;

export type ValidationError = {
  path: string;
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationError[];
  /** The schema title (or tool_name fallback) the record was checked against. */
  toolName: string;
};

export type ReplaySummary = {
  total: number;
  passed: number;
  failed: number;
  results: Array<ValidationResult & {record: ToolCallRecord}>;
};

const URI_REGEX = /^[a-z][a-z\d+\-.]*:\S+$/i;

export function loadSchemaRegistry(schemaDir: string): SchemaRegistry {
  const registry: SchemaRegistry = {};
  const entries = readdirSync(schemaDir).filter(name => name.endsWith('.schema.json'));
  for (const file of entries) {
    const toolName = basename(file, '.schema.json');
    const raw = readFileSync(join(schemaDir, file), 'utf8');
    const schema = JSON.parse(raw) as JsonSchema;
    registry[toolName] = schema;
  }

  return registry;
}

export function validateToolCall(
  record: ToolCallRecord,
  registry: SchemaRegistry,
): ValidationResult {
  const schema = registry[record.tool_name];
  if (!schema) {
    return {
      valid: false,
      toolName: record.tool_name,
      errors: [{
        path: 'tool_name',
        message: `no schema registered for tool '${record.tool_name}'`,
      }],
    };
  }

  const errors = validateValue(record.arguments, schema, 'arguments');
  return {valid: errors.length === 0, errors, toolName: record.tool_name};
}

export function parseJsonl(text: string): ToolCallRecord[] {
  const records: ToolCallRecord[] = [];
  const lines = text.split('\n');
  for (const [index, line_] of lines.entries()) {
    const line = line_.trim();
    if (line.length === 0) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(`fixtures: failed to parse line ${index + 1}: ${(error as Error).message}`);
    }

    if (!isToolCallShape(parsed)) {
      throw new TypeError(`fixtures: line ${index + 1} missing required envelope fields (tool_name, arguments)`);
    }

    records.push(parsed);
  }

  return records;
}

export function replayJsonl(fixturePath: string, registry: SchemaRegistry): ReplaySummary {
  const text = readFileSync(fixturePath, 'utf8');
  const records = parseJsonl(text);
  const results = records.map(record => ({
    record,
    ...validateToolCall(record, registry),
  }));
  return {
    total: results.length,
    passed: results.filter(r => r.valid).length,
    failed: results.filter(r => !r.valid).length,
    results,
  };
}

function isToolCallShape(value: unknown): value is ToolCallRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.tool_name === 'string'
    && typeof record.arguments === 'object'
    && record.arguments !== null
  );
}

function validateValue(value: unknown, schema: JsonSchema, path: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({path, message: `value not in enum [${schema.enum.map(v => JSON.stringify(v)).join(', ')}]`});
    return errors;
  }

  if (schema.type) {
    const typeError = checkType(value, schema.type, path);
    if (typeError) {
      errors.push(typeError);
      return errors;
    }
  }

  if (schema.type === 'object' && typeof value === 'object' && value !== null) {
    errors.push(...validateObject(value as Record<string, unknown>, schema, path));
  }

  if (schema.type === 'string' && typeof value === 'string') {
    errors.push(...validateString(value, schema, path));
  }

  if ((schema.type === 'number' || schema.type === 'integer') && typeof value === 'number') {
    errors.push(...validateNumber(value, schema, path));
  }

  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    for (const [index, item] of value.entries()) {
      errors.push(...validateValue(item, schema.items, `${path}[${index}]`));
    }
  }

  return errors;
}

function checkType(value: unknown, expected: NonNullable<JsonSchema['type']>, path: string): ValidationError | undefined {
  const ok = (() => {
    switch (expected) {
      case 'object': {return typeof value === 'object' && value !== null && !Array.isArray(value);
      }

      case 'array': {return Array.isArray(value);
      }

      case 'string': {return typeof value === 'string';
      }

      case 'integer': {return typeof value === 'number' && Number.isInteger(value);
      }

      case 'number': {return typeof value === 'number';
      }

      case 'boolean': {return typeof value === 'boolean';
      }

      case 'null': {return value === null;
      }
    }
  })();
  if (ok) {
    return undefined;
  }

  return {path, message: `expected ${expected}, got ${describe(value)}`};
}

function validateObject(value: Record<string, unknown>, schema: JsonSchema, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (schema.required) {
    for (const key of schema.required) {
      if (!(key in value)) {
        errors.push({path: `${path}.${key}`, message: 'missing required property'});
      }
    }
  }

  const properties = schema.properties ?? {};
  for (const [key, subValue] of Object.entries(value)) {
    if (key in properties) {
      errors.push(...validateValue(subValue, properties[key], `${path}.${key}`));
      continue;
    }

    if (schema.additionalProperties === false) {
      errors.push({path: `${path}.${key}`, message: 'unexpected property (additionalProperties: false)'});
    } else if (typeof schema.additionalProperties === 'object') {
      errors.push(...validateValue(subValue, schema.additionalProperties, `${path}.${key}`));
    }
  }

  return errors;
}

function validateString(value: string, schema: JsonSchema, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
    errors.push({path, message: `string shorter than minLength ${schema.minLength} (got ${value.length})`});
  }

  if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
    errors.push({path, message: `string longer than maxLength ${schema.maxLength} (got ${value.length})`});
  }

  if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value)) {
    errors.push({path, message: `string does not match pattern ${schema.pattern}`});
  }

  if (schema.format === 'uri' && !URI_REGEX.test(value)) {
    errors.push({path, message: 'string does not match format=uri'});
  }

  return errors;
}

function validateNumber(value: number, schema: JsonSchema, path: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (typeof schema.minimum === 'number' && value < schema.minimum) {
    errors.push({path, message: `value < minimum ${schema.minimum}`});
  }

  if (typeof schema.maximum === 'number' && value > schema.maximum) {
    errors.push({path, message: `value > maximum ${schema.maximum}`});
  }

  return errors;
}

function describe(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  return typeof value;
}
