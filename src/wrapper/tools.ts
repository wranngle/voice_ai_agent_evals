/**
 * @wranngle/voice-evals/wrapper/tools — tool schema cleaning for safe PATCH.
 *
 * `PATCH /v1/convai/agents/{agent_id}` enforces a mutual-exclusion rule on
 * every property in `agent.prompt.tools[*].api_schema.request_body_schema.properties[*]`:
 * each property may have AT MOST ONE of:
 *   - description
 *   - is_system_provided
 *   - dynamic_variable
 *   - constant_value
 *
 * The API rejects requests that violate this with:
 *   `value_error: Can only set one of: description, dynamic_variable,
 *    is_system_provided, or constant_value`
 *
 * Worse, the `enum` field on a property is ALSO rejected alongside
 * `description` — enum values must instead be inlined into the description
 * string (the agent reads them at runtime).
 *
 * This module provides PURE functions that strip every property down to
 * `{ type, description }` before send. Pair with `agents.update()` which
 * applies the cleaning before PATCH.
 *
 * Tests live at tests/wrapper/tools.test.ts.
 */

import type {AgentTool, ToolProperty} from './types';

const CLEANABLE_FIELDS: ReadonlyArray<keyof ToolProperty> = [
  'is_system_provided',
  'dynamic_variable',
  'constant_value',
  'enum',
];

/**
 * Strip a single tool property down to the API-accepted `{ type, description }`
 * shape. Preserves `description` if present; otherwise synthesizes one from
 * the next-most-informative field (enum list, dynamic_variable name, etc.) so
 * we don't lose the property's semantic intent.
 */
export function cleanProperty(property: ToolProperty): Pick<ToolProperty, 'type' | 'description'> {
  const description = property.description ?? synthesizeDescription(property);
  return {type: property.type, description};
}

/**
 * Apply `cleanProperty` across every tool's request_body_schema.properties.
 * Returns a new array; does not mutate the input.
 */
export function cleanTools(tools: AgentTool[]): AgentTool[] {
  return tools.map(tool => cleanTool(tool));
}

function cleanTool(tool: AgentTool): AgentTool {
  const schema = tool.api_schema?.request_body_schema;
  if (!schema?.properties) {
    return tool;
  }

  const cleanedProperties: Record<string, ToolProperty> = {};
  for (const [name, property] of Object.entries(schema.properties)) {
    cleanedProperties[name] = cleanProperty(property);
  }

  return {
    ...tool,
    api_schema: {
      ...tool.api_schema,
      request_body_schema: {
        ...schema,
        properties: cleanedProperties,
      },
    },
  };
}

function synthesizeDescription(property: ToolProperty): string {
  if (Array.isArray(property.enum) && property.enum.length > 0) {
    const values = property.enum
      .map(String)
      .join(', ');
    return `${property.type}. Values: ${values}.`;
  }

  if (property.dynamic_variable) {
    return `${property.type}. Bound to dynamic variable {{${property.dynamic_variable}}}.`;
  }

  if (property.is_system_provided) {
    return `${property.type}. System-provided; the agent does not collect this from the caller.`;
  }

  if (property.constant_value !== undefined) {
    return `${property.type}. Constant value: ${JSON.stringify(property.constant_value)}.`;
  }

  return property.type;
}

/**
 * Returns true iff a property has more than one of the mutually-exclusive
 * fields set. Useful as a guard before sending a non-cleaned PATCH.
 */
export function hasMutualExclusionViolation(property: ToolProperty): boolean {
  let count = 0;
  for (const field of CLEANABLE_FIELDS) {
    if (property[field] !== undefined) {
      count++;
    }
  }

  if (property.description !== undefined) {
    count++;
  }

  return count > 1;
}
