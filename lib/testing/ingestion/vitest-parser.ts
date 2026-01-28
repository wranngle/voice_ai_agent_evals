/**
 * Vitest Test Parser
 *
 * Parses Vitest test files and extracts test cases for ingestion
 * into the testing framework.
 */

export interface ParsedTest {
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
}

export interface ParseResult {
  success: boolean;
  tests: ParsedTest[];
  webhookUrl?: string;
  constants: Record<string, string>;
  errors: string[];
}

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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Detect describe block
    const describeMatch = line.match(/describe\s*\(\s*["']([^"']+)["']/);
    if (describeMatch) {
      currentSuite = describeMatch[1];
      continue;
    }

    // Detect it() or test() block start
    const itMatch = line.match(/(?:it|test)\s*\(\s*["']([^"']+)["']/);
    if (itMatch && !inItBlock) {
      inItBlock = true;
      itStartLine = lineNum;
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
  constants: Record<string, string>
): ParsedTest | null {
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
  if (constants['WEBHOOK_URL']) {
    test.webhookUrl = constants['WEBHOOK_URL'];
  }

  // Extract payload from webhook helper function or fetch() call
  // Matches: sendWebhook({...}), callWebhook({...}), fetch(URL, { body: JSON.stringify({...}) })
  const payloadMatch = content.match(/(?:sendWebhook|callWebhook|postWebhook|webhookCall)\s*\(\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s);
  if (payloadMatch) {
    test.payload = parseObjectLiteral(payloadMatch[1], constants);
  }

  // Extract status assertion: expect(status).toBe(200)
  const statusMatch = content.match(/expect\s*\(\s*(?:response\.)?status\s*\)\s*\.toBe\s*\(\s*(\d+)\s*\)/);
  if (statusMatch) {
    test.expectedStatus = parseInt(statusMatch[1], 10);
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
function parseObjectLiteral(str: string, constants: Record<string, string>): Record<string, unknown> {
  const obj: Record<string, unknown> = {};

  // Simple key-value pairs: key: value or key: "string"
  const kvRegex = /(\w+)\s*:\s*(?:([A-Z_]+)|["']([^"']+)["']|(\d+)|(\[[^\]]*\])|(\{[^}]*\})|(true|false))/g;
  let match;

  while ((match = kvRegex.exec(str)) !== null) {
    const key = match[1];
    if (match[2]) {
      // Constant reference
      obj[key] = constants[match[2]] || match[2];
    } else if (match[3]) {
      // String literal
      obj[key] = match[3];
    } else if (match[4]) {
      // Number
      obj[key] = parseInt(match[4], 10);
    } else if (match[5]) {
      // Array
      try {
        obj[key] = JSON.parse(match[5].replace(/'/g, '"'));
      } catch {
        obj[key] = match[5];
      }
    } else if (match[6]) {
      // Nested object - simplified parsing
      obj[key] = parseObjectLiteral(match[6].slice(1, -1), constants);
    } else if (match[7]) {
      // Boolean
      obj[key] = match[7] === 'true';
    }
  }

  return obj;
}

/**
 * Parse a value string into its typed value
 */
function parseValue(str: string, constants: Record<string, string>): unknown {
  // String literal
  if (str.startsWith('"') || str.startsWith("'")) {
    return str.slice(1, -1);
  }
  // Number
  if (/^\d+$/.test(str)) {
    return parseInt(str, 10);
  }
  // Boolean
  if (str === 'true') return true;
  if (str === 'false') return false;
  // Constant reference
  if (constants[str]) {
    return constants[str];
  }
  return str;
}
