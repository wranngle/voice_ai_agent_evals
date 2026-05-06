/**
 * Vitest Test Parser
 *
 * Parses Vitest test files and extracts test cases for ingestion
 * into the testing framework.
 */

export type ParsedTest = {
  /** Test name from it() */
  name: string;
  /** Parent describe block */
  suite: string;
  /** Original file path */
  sourceFile: string;
  /** Line number in source */
  lineNumber: number;
  /** Webhook URL if detected */
  webhookUrl?: string;
  /** HTTP method */
  method: string;
  /** Request payload */
  payload: Record<string, unknown>;
  /** Expected HTTP status */
  expectedStatus?: number;
  /** Expected response fields */
  expectedResponse: Record<string, unknown>;
  /** Expected array members keyed by response body path */
  arrayContains: Record<string, unknown[]>;
  /** Truthy assertions (toBeTruthy) */
  truthyFields: string[];
  /** Falsy assertions (toBeFalsy) */
  falsyFields: string[];
  /** Defined assertions (toBeDefined) */
  definedFields: string[];
};

export type ParseResult = {
  success: boolean;
  tests: ParsedTest[];
  webhookUrl?: string;
  constants: Record<string, string>;
  objectConstants: Record<string, Record<string, unknown>>;
  errors: string[];
};

type ItBlockParseContext = {
  content: string;
  name: string;
  suite: string;
  sourceFile: string;
  lineNumber: number;
  webhookUrl?: string;
  constants: Record<string, string>;
  globalObjectConstants: Record<string, Record<string, unknown>>;
};

type ExtractedWebhookCall = {
  webhookUrl?: string;
  payload: Record<string, unknown>;
};

const VITEST_CALL_MODIFIER_PATTERN = String.raw`(?:\.(?:skip|only|todo|concurrent|fails|skipIf|runIf)(?:\([^)]*\))?)*`;

/**
 * Parse a Vitest test file and extract webhook test cases
 */
export function parseVitestFile(content: string, filePath: string): ParseResult {
  const result: ParseResult = {
    success: true,
    tests: [],
    constants: {},
    objectConstants: {},
    errors: [],
  };

  const lines = content.split('\n');
  const globalContent = removeTestBlocks(content);

  // Extract constants (const X = "value", process.env.Y || "...", or process.env.Y ?? "...")
  const constRegex = /const\s+(\w+)\s*=\s*(?:process\.env\.\w+\s*(?:\|\||\?\?)\s*)?["']([^"']+)["']/g;
  let match;
  while ((match = constRegex.exec(content)) !== null) {
    result.constants[match[1]] = match[2];
  }

  // Find webhook URL (try multiple common variable names)
  const urlVarNames = ['WEBHOOK_URL', 'N8N_WEBHOOK_URL', 'API_URL', 'ENDPOINT_URL'];
  for (const varName of urlVarNames) {
    if (result.constants[varName]) {
      result.webhookUrl = result.constants[varName];
      break;
    }
  }

  result.objectConstants = extractObjectConstants(globalContent, result.constants);

  // Parse describe blocks and it() tests
  let currentSuite = '';
  let inItBlock = false;
  let itStartLine = 0;
  let itName = '';
  let itContent = '';
  let braceCount = 0;

  for (const [i, line] of lines.entries()) {
    const lineNumber = i + 1;

    // Detect describe block
    const describeMatch = vitestBlockNameMatch(line, 'describe');
    if (describeMatch) {
      currentSuite = describeMatch;
      continue;
    }

    // Detect it() or test() block start
    const itNameMatch = vitestBlockNameMatch(line, '(?:it|test)');
    if (itNameMatch && !inItBlock) {
      inItBlock = true;
      itStartLine = lineNumber;
      itName = itNameMatch;
      itContent = line;
      braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      continue;
    }

    // Accumulate it() block content
    if (inItBlock) {
      itContent += '\n' + line;
      braceCount += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;

      // End of it() block
      if (braceCount <= 0) {
        const parsed = parseItBlock({
          content: itContent,
          name: itName,
          suite: currentSuite,
          sourceFile: filePath,
          lineNumber: itStartLine,
          webhookUrl: result.webhookUrl,
          constants: result.constants,
          globalObjectConstants: result.objectConstants,
        });
        if (parsed) {
          result.tests.push(parsed);
        }

        inItBlock = false;
        itContent = '';
        itName = '';
      }
    }
  }

  return result;
}

function vitestBlockNameMatch(line: string, calleePattern: string): string | undefined {
  const matcher = new RegExp(String.raw`\b${calleePattern}${VITEST_CALL_MODIFIER_PATTERN}\s*\(\s*["']([^"']+)["']`);
  return matcher.exec(line)?.[1];
}

/**
 * Parse a single it() block
 */
function parseItBlock(context: ItBlockParseContext): ParsedTest | undefined {
  const {
    content,
    name,
    suite,
    sourceFile,
    lineNumber,
    webhookUrl,
    constants,
    globalObjectConstants,
  } = context;
  const test: ParsedTest = {
    name,
    suite,
    sourceFile,
    lineNumber,
    method: 'POST',
    payload: {},
    expectedResponse: {},
    arrayContains: {},
    truthyFields: [],
    falsyFields: [],
    definedFields: [],
  };

  const objectConstants = {
    ...globalObjectConstants,
    ...extractObjectConstants(content, constants, globalObjectConstants),
  };
  const webhookCall = extractWebhookCall(content, constants, objectConstants);

  if (!webhookCall) {
    return undefined;
  }

  // Extract webhook URL from constants
  if (webhookUrl) {
    test.webhookUrl = webhookUrl;
  } else if (constants.WEBHOOK_URL) {
    test.webhookUrl = constants.WEBHOOK_URL;
  }

  test.payload = webhookCall.payload;
  if (webhookCall.webhookUrl) {
    test.webhookUrl = webhookCall.webhookUrl;
  }

  // Extract status assertion: expect(status).toBe(200)
  const statusMatch = /expect\s*\(\s*(?:response\.)?status\s*\)\s*\.toBe\s*\(\s*(\d+)\s*\)/.exec(content);
  if (statusMatch) {
    test.expectedStatus = Number.parseInt(statusMatch[1], 10);
  }

  // Extract body assertions: expect(body.field).toBe(value)
  const bodyAssertions = content.matchAll(/expect\s*\(\s*(?:response\.)?body\.([\w$.]+)\s*\)\s*\.toBe\s*\(\s*([^)]+)\s*\)/g);
  for (const m of bodyAssertions) {
    const path = m[1];
    const value = parseValue(m[2].trim(), constants);
    setNestedValue(test.expectedResponse, path, value);
  }

  for (const expectedShape of extractBodyMatchObjectAssertions(content, constants, objectConstants)) {
    mergeRecord(test.expectedResponse, expectedShape);
  }

  for (const assertion of extractBodyArrayContainsAssertions(content, constants, objectConstants)) {
    const existingItems = test.arrayContains[assertion.path] ?? [];
    existingItems.push(assertion.expectedItem);
    test.arrayContains[assertion.path] = existingItems;
  }

  // Extract toBeTruthy assertions
  const truthyAssertions = content.matchAll(/expect\s*\(\s*(?:response\.)?body\.([\w$.]+)\s*\)\s*\.toBeTruthy\s*\(\s*\)/g);
  for (const m of truthyAssertions) {
    test.truthyFields.push(m[1]);
  }

  // Extract toBeFalsy assertions
  const falsyAssertions = content.matchAll(/expect\s*\(\s*(?:response\.)?body\.([\w$.]+)\s*\)\s*\.toBeFalsy\s*\(\s*\)/g);
  for (const m of falsyAssertions) {
    test.falsyFields.push(m[1]);
  }

  // Extract toBeDefined assertions
  const definedAssertions = content.matchAll(/expect\s*\(\s*(?:response\.)?body\.([\w$.]+)\s*\)\s*\.toBeDefined\s*\(\s*\)/g);
  for (const m of definedAssertions) {
    test.definedFields.push(m[1]);
  }

  return test;
}

/**
 * Parse an object literal string into an object
 */
function parseObjectLiteralWithContext(
  string_: string,
  constants: Record<string, string>,
  objectConstants: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  const object: Record<string, unknown> = {};

  for (const pair of splitTopLevel(string_, ',')) {
    const trimmed = pair.trim();
    if (trimmed === '') {
      continue;
    }

    if (trimmed.startsWith('...')) {
      const spread = resolveObjectReference(trimmed.slice(3).trim(), objectConstants);
      if (spread) {
        Object.assign(object, cloneRecord(spread));
      }

      continue;
    }

    const separatorIndex = findTopLevelChar(trimmed, ':');
    if (separatorIndex === -1) {
      continue;
    }

    const key = parseObjectKey(trimmed.slice(0, separatorIndex).trim());
    object[key] = parseValue(trimmed.slice(separatorIndex + 1).trim(), constants, objectConstants);
  }

  return object;
}

/**
 * Parse a value string into its typed value
 */
function parseValue(
  string_: string,
  constants: Record<string, string>,
  objectConstants: Record<string, Record<string, unknown>> = {},
): unknown {
  if (string_ === '') {
    return '';
  }

  // String literal
  if (isQuotedString(string_)) {
    return string_.slice(1, -1);
  }

  // Number
  if (/^-?\d+(?:\.\d+)?$/.test(string_)) {
    return Number(string_);
  }

  // Boolean
  if (string_ === 'true') {
    return true;
  }

  if (string_ === 'false') {
    return false;
  }

  if (string_ === 'null') {
    return null;
  }

  if (string_.startsWith('{') && string_.endsWith('}')) {
    return parseObjectLiteralWithContext(string_.slice(1, -1), constants, objectConstants);
  }

  if (string_.startsWith('[') && string_.endsWith(']')) {
    const body = string_.slice(1, -1).trim();
    if (body === '') {
      return [];
    }

    return splitTopLevel(body, ',')
      .map(item => item.trim())
      .filter(item => item !== '')
      .map(item => parseValue(item, constants, objectConstants));
  }

  // Constant reference
  if (constants[string_] !== undefined) {
    return constants[string_];
  }

  const objectReference = resolveObjectReference(string_, objectConstants);
  if (objectReference) {
    return cloneRecord(objectReference);
  }

  return string_;
}

function extractWebhookCall(
  content: string,
  constants: Record<string, string>,
  objectConstants: Record<string, Record<string, unknown>>,
): ExtractedWebhookCall | undefined {
  const helperCall = /(?:sendWebhook|callWebhook|postWebhook|webhookCall)\s*\(/g;

  for (const match of content.matchAll(helperCall)) {
    const callStart = content.indexOf('(', match.index);
    const callArguments = extractBalancedCallArguments(content, callStart);
    if (!callArguments) {
      continue;
    }

    const webhookUrl = callArguments
      .map(candidate => resolveWebhookUrlArgument(candidate, constants))
      .find((candidate): candidate is string => typeof candidate === 'string');

    for (const argument of callArguments) {
      const payload = resolvePayloadArgument(argument, constants, objectConstants);
      if (payload) {
        return {webhookUrl, payload};
      }
    }
  }

  return undefined;
}

function resolvePayloadArgument(
  argument: string,
  constants: Record<string, string>,
  objectConstants: Record<string, Record<string, unknown>>,
): Record<string, unknown> | undefined {
  const valueStart = findNextNonWhitespace(argument, 0);
  if (valueStart === -1) {
    return undefined;
  }

  if (argument[valueStart] === '{') {
    const payloadBody = extractBalancedObjectBody(argument, valueStart);
    if (payloadBody) {
      return parseObjectLiteralWithContext(payloadBody, constants, objectConstants);
    }

    return undefined;
  }

  const reference = parseObjectReferenceAt(argument, valueStart);
  if (!reference) {
    return undefined;
  }

  const payload = resolveObjectReference(reference, objectConstants);
  return payload ? cloneRecord(payload) : undefined;
}

function resolveWebhookUrlArgument(argument: string, constants: Record<string, string>): string | undefined {
  const value = parseValue(argument.trim(), constants);
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function extractBodyArrayContainsAssertions(
  content: string,
  constants: Record<string, string>,
  objectConstants: Record<string, Record<string, unknown>>,
): Array<{path: string; expectedItem: unknown}> {
  const assertions: Array<{path: string; expectedItem: unknown}> = [];
  const matcher = /expect\s*\(\s*(?:response\.)?body\.([\w$.]+)\s*\)\s*\.(toContain|toContainEqual)\s*\(/g;

  for (const match of content.matchAll(matcher)) {
    const path = match[1];
    const callStart = match.index + match[0].length - 1;
    const argument = extractBalancedCallArgument(content, callStart);
    if (!argument) {
      continue;
    }

    assertions.push({
      path,
      expectedItem: parseValue(argument, constants, objectConstants),
    });
  }

  return assertions;
}

function extractBodyMatchObjectAssertions(
  content: string,
  constants: Record<string, string>,
  objectConstants: Record<string, Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const assertions: Array<Record<string, unknown>> = [];
  const matcher = /expect\s*\(\s*(?:response\.)?body\s*\)\s*\.toMatchObject\s*\(/g;

  for (const match of content.matchAll(matcher)) {
    const callStart = match.index + match[0].length - 1;
    const valueStart = findNextNonWhitespace(content, callStart + 1);
    if (valueStart === -1) {
      continue;
    }

    if (content[valueStart] === '{') {
      const body = extractBalancedObjectBody(content, valueStart);
      if (body) {
        assertions.push(parseObjectLiteralWithContext(body, constants, objectConstants));
      }

      continue;
    }

    const reference = parseObjectReferenceAt(content, valueStart);
    if (!reference) {
      continue;
    }

    const expectedShape = resolveObjectReference(reference, objectConstants);
    if (expectedShape) {
      assertions.push(cloneRecord(expectedShape));
    }
  }

  return assertions;
}

function extractObjectConstants(
  content: string,
  constants: Record<string, string>,
  baseObjectConstants: Record<string, Record<string, unknown>> = {},
): Record<string, Record<string, unknown>> {
  const found: Record<string, Record<string, unknown>> = {};
  const context: Record<string, Record<string, unknown>> = {...baseObjectConstants};
  const objectConst = /const\s+(\w+)(?:\s*:\s*[^=]+)?\s*=\s*{/g;

  for (const match of content.matchAll(objectConst)) {
    const name = match[1];
    const objectStart = content.indexOf('{', match.index);
    const body = extractBalancedObjectBody(content, objectStart);
    if (!body) {
      continue;
    }

    const parsed = parseObjectLiteralWithContext(body, constants, context);
    found[name] = parsed;
    context[name] = parsed;
  }

  return found;
}

function removeTestBlocks(content: string): string {
  const lines = content.split('\n');
  const kept: string[] = [];
  let inTestBlock = false;
  let braceCount = 0;

  for (const line of lines) {
    if (!inTestBlock && vitestBlockNameMatch(line, '(?:it|test)')) {
      inTestBlock = true;
      braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      if (braceCount <= 0) {
        inTestBlock = false;
      }

      continue;
    }

    if (inTestBlock) {
      braceCount += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      if (braceCount <= 0) {
        inTestBlock = false;
      }

      continue;
    }

    kept.push(line);
  }

  return kept.join('\n');
}

function extractBalancedObjectBody(source: string, openIndex: number): string | undefined {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (let index = openIndex; index < source.length; index++) {
    const char = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if ((inSingleQuote || inDoubleQuote) && char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '\'' && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      continue;
    }

    if (char === '{') {
      depth++;
      continue;
    }

    if (char === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(openIndex + 1, index);
      }
    }
  }

  return undefined;
}

function extractBalancedCallArgument(source: string, openIndex: number): string | undefined {
  let depth = 0;
  let objectDepth = 0;
  let arrayDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;
  const argumentStart = openIndex + 1;

  for (let index = openIndex; index < source.length; index++) {
    const char = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if ((inSingleQuote || inDoubleQuote) && char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '\'' && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      continue;
    }

    if (char === '{') {
      objectDepth++;
      continue;
    }

    if (char === '}') {
      objectDepth--;
      continue;
    }

    if (char === '[') {
      arrayDepth++;
      continue;
    }

    if (char === ']') {
      arrayDepth--;
      continue;
    }

    if (char === '(') {
      depth++;
      continue;
    }

    if (char === ')') {
      depth--;
      if (depth === 0 && objectDepth === 0 && arrayDepth === 0) {
        return source.slice(argumentStart, index).trim();
      }
    }
  }

  return undefined;
}

function extractBalancedCallArguments(source: string, openIndex: number): string[] | undefined {
  const argumentBody = extractBalancedCallArgument(source, openIndex);
  if (!argumentBody) {
    return undefined;
  }

  return splitTopLevel(argumentBody, ',')
    .map(argument => argument.trim())
    .filter(argument => argument !== '');
}

function splitTopLevel(source: string, delimiter: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let objectDepth = 0;
  let arrayDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (const [index, char] of [...source].entries()) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if ((inSingleQuote || inDoubleQuote) && char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '\'' && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      continue;
    }

    if (char === '{') {
      objectDepth++;
      continue;
    }

    if (char === '}') {
      objectDepth--;
      continue;
    }

    if (char === '[') {
      arrayDepth++;
      continue;
    }

    if (char === ']') {
      arrayDepth--;
      continue;
    }

    if (char === delimiter && objectDepth === 0 && arrayDepth === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(source.slice(start));
  return parts;
}

function findTopLevelChar(source: string, target: string): number {
  let objectDepth = 0;
  let arrayDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  for (const [index, char] of [...source].entries()) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if ((inSingleQuote || inDoubleQuote) && char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '\'' && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) {
      continue;
    }

    if (char === '{') {
      objectDepth++;
      continue;
    }

    if (char === '}') {
      objectDepth--;
      continue;
    }

    if (char === '[') {
      arrayDepth++;
      continue;
    }

    if (char === ']') {
      arrayDepth--;
      continue;
    }

    if (char === target && objectDepth === 0 && arrayDepth === 0) {
      return index;
    }
  }

  return -1;
}

function findNextNonWhitespace(source: string, start: number): number {
  for (let index = start; index < source.length; index++) {
    if (!/\s/.test(source[index])) {
      return index;
    }
  }

  return -1;
}

function parseObjectReferenceAt(source: string, start: number): string | undefined {
  if (start === -1) {
    return undefined;
  }

  const match = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/.exec(source.slice(start));
  return match?.[0];
}

function resolveObjectReference(
  reference: string,
  objectConstants: Record<string, Record<string, unknown>>,
): Record<string, unknown> | undefined {
  const parts = reference.split('.').map(part => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return undefined;
  }

  let current: unknown = objectConstants[parts[0]];
  for (const part of parts.slice(1)) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[part];
  }

  return isRecord(current) ? current : undefined;
}

function cloneRecord(record: Record<string, unknown>): Record<string, unknown> {
  return cloneValue(record) as Record<string, unknown>;
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => cloneValue(item));
  }

  if (isRecord(value)) {
    const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, item] of Object.entries(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }

      out[key] = cloneValue(item);
    }

    return out;
  }

  return value;
}

function parseObjectKey(raw: string): string {
  return isQuotedString(raw) ? raw.slice(1, -1) : raw;
}

function setNestedValue(object: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = object;

  for (const [index, part] of parts.entries()) {
    if (index === parts.length - 1) {
      current[part] = value;
      return;
    }

    const next = current[part];
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      current[part] = {};
    }

    current = current[part] as Record<string, unknown>;
  }
}

function mergeRecord(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }

    if (isRecord(target[key]) && isRecord(value)) {
      mergeRecord(target[key], value);
      continue;
    }

    Object.defineProperty(target, key, {
      value: cloneValue(value),
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
}

function isQuotedString(value: string): boolean {
  return (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith('\'') && value.endsWith('\''))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
