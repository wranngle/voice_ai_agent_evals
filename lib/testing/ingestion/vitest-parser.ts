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
  errors: string[];
};

/**
 * Parse a Vitest test file and extract webhook test cases
 */
export function parseVitestFile(content: string, filePath: string): ParseResult {
  const result: ParseResult = {
    success: true,
    tests: [],
    constants: {},
    errors: [],
  };

  const lines = content.split('\n');

  // Extract constants (const X = "value" or const X = process.env.Y || "value")
  const constRegex = /const\s+(\w+)\s*=\s*(?:process\.env\.\w+\s*\|\|\s*)?["']([^"']+)["']/g;
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
    const describeMatch = /describe\s*\(\s*["']([^"']+)["']/.exec(line);
    if (describeMatch) {
      currentSuite = describeMatch[1];
      continue;
    }

    // Detect it() or test() block start
    const itMatch = /(?:it|test)\s*\(\s*["']([^"']+)["']/.exec(line);
    if (itMatch && !inItBlock) {
      inItBlock = true;
      itStartLine = lineNumber;
      itName = itMatch[1];
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
        const parsed = parseItBlock(itContent, itName, currentSuite, filePath, itStartLine, result.constants);
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

/**
 * Parse a single it() block
 */
function parseItBlock(
  content: string,
  name: string,
  suite: string,
  sourceFile: string,
  lineNumber: number,
  constants: Record<string, string>,
): ParsedTest | undefined {
  const test: ParsedTest = {
    name,
    suite,
    sourceFile,
    lineNumber,
    method: 'POST',
    payload: {},
    expectedResponse: {},
    truthyFields: [],
    falsyFields: [],
    definedFields: [],
  };

  // Extract webhook URL from constants
  if (constants.WEBHOOK_URL) {
    test.webhookUrl = constants.WEBHOOK_URL;
  }

  // Extract payload from webhook helper function or fetch() call
  // Matches: sendWebhook({...}), callWebhook({...}), fetch(URL, { body: JSON.stringify({...}) })
  const payloadMatch = /(?:sendWebhook|callWebhook|postWebhook|webhookCall)\s*\(\s*{([^}]+(?:{[^}]*}[^}]*)*)}/s.exec(content);
  if (payloadMatch) {
    test.payload = parseObjectLiteral(payloadMatch[1], constants);
  }

  // Extract status assertion: expect(status).toBe(200)
  const statusMatch = /expect\s*\(\s*(?:response\.)?status\s*\)\s*\.toBe\s*\(\s*(\d+)\s*\)/.exec(content);
  if (statusMatch) {
    test.expectedStatus = Number.parseInt(statusMatch[1], 10);
  }

  // Extract body assertions: expect(body.field).toBe(value)
  const bodyAssertions = content.matchAll(/expect\s*\(\s*(?:response\.)?body\.(\w+)\s*\)\s*\.toBe\s*\(\s*([^)]+)\s*\)/g);
  for (const m of bodyAssertions) {
    const field = m[1];
    const value = parseValue(m[2].trim(), constants);
    test.expectedResponse[field] = value;
  }

  // Extract toBeTruthy assertions
  const truthyAssertions = content.matchAll(/expect\s*\(\s*(?:response\.)?body\.(\w+)\s*\)\s*\.toBeTruthy\s*\(\s*\)/g);
  for (const m of truthyAssertions) {
    test.truthyFields.push(m[1]);
  }

  // Extract toBeFalsy assertions
  const falsyAssertions = content.matchAll(/expect\s*\(\s*(?:response\.)?body\.(\w+)\s*\)\s*\.toBeFalsy\s*\(\s*\)/g);
  for (const m of falsyAssertions) {
    test.falsyFields.push(m[1]);
  }

  // Extract toBeDefined assertions
  const definedAssertions = content.matchAll(/expect\s*\(\s*(?:response\.)?body\.(\w+)\s*\)\s*\.toBeDefined\s*\(\s*\)/g);
  for (const m of definedAssertions) {
    test.definedFields.push(m[1]);
  }

  return test;
}

/**
 * Parse an object literal string into an object
 */
function parseObjectLiteral(string_: string, constants: Record<string, string>): Record<string, unknown> {
  const object: Record<string, unknown> = {};

  // Simple key-value pairs: key: value or key: "string"
  const kvRegex = /(\w+)\s*:\s*(?:([A-Z_]+)|["']([^"']+)["']|(\d+)|(\[[^\]]*])|({[^}]*})|(true|false))/g;
  let match;

  while ((match = kvRegex.exec(string_)) !== null) {
    const key = match[1];
    if (match[2]) {
      // Constant reference
      object[key] = constants[match[2]] || match[2];
    } else if (match[3]) {
      // String literal
      object[key] = match[3];
    } else if (match[4]) {
      // Number
      object[key] = Number.parseInt(match[4], 10);
    } else if (match[5]) {
      // Array
      try {
        object[key] = JSON.parse(match[5].replaceAll('\'', '"'));
      } catch {
        object[key] = match[5];
      }
    } else if (match[6]) {
      // Nested object - simplified parsing
      object[key] = parseObjectLiteral(match[6].slice(1, -1), constants);
    } else if (match[7]) {
      // Boolean
      object[key] = match[7] === 'true';
    }
  }

  return object;
}

/**
 * Parse a value string into its typed value
 */
function parseValue(string_: string, constants: Record<string, string>): unknown {
  // String literal
  if (string_.startsWith('"') || string_.startsWith('\'')) {
    return string_.slice(1, -1);
  }

  // Number
  if (/^\d+$/.test(string_)) {
    return Number.parseInt(string_, 10);
  }

  // Boolean
  if (string_ === 'true') {
    return true;
  }

  if (string_ === 'false') {
    return false;
  }

  // Constant reference
  if (constants[string_]) {
    return constants[string_];
  }

  return string_;
}
