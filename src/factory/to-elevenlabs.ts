/**
 * @wranngle/voice-evals/factory/to-elevenlabs — convert internal GeneratedTest
 * shape to the ElevenLabs SDK's TestsCreateRequestBody shape.
 *
 * The internal `GeneratedTest` uses snake_case (`chat_history`,
 * `success_condition`, etc.) to match the archive's YAML schema. The SDK
 * uses camelCase (`chatHistory`, `successCondition`). This module is the
 * single seam where that translation happens, so CLI / tests / consumers
 * all see one canonical shape.
 */

import type {TestCreateInput} from '../wrapper/tests';
import type {GeneratedTest} from './types';

/**
 * Map a GeneratedTest -> SDK TestsCreateRequestBody. Defensive on missing
 * fields: if `name` is absent the SDK will reject; we don't synthesize one.
 *
 * For `simulation`-type tests the SDK requires extra fields not present in
 * our YAML template grammar (simulation_specification, etc.). When we
 * encounter `type: 'simulation'`, we cast the payload through `unknown` to
 * the SDK's discriminated-union type; callers must hand-fill the required
 * simulation fields via `extraFields` if needed.
 */
export function generatedToCreatePayload(
  test: GeneratedTest,
  extraFields: Record<string, unknown> = {},
): TestCreateInput {
  const base: Record<string, unknown> = {
    type: test.type,
    name: test.name,
  };

  if (test.chat_history && test.chat_history.length > 0) {
    base.chatHistory = test.chat_history;
  }

  if (test.success_condition !== undefined && test.success_condition !== '') {
    base.successCondition = test.success_condition;
  }

  if (test.success_examples && test.success_examples.length > 0) {
    base.successExamples = test.success_examples;
  }

  if (test.failure_examples && test.failure_examples.length > 0) {
    base.failureExamples = test.failure_examples;
  }

  if (test.dynamic_variables && Object.keys(test.dynamic_variables).length > 0) {
    base.dynamicVariables = test.dynamic_variables;
  }

  return {...base, ...extraFields} as unknown as TestCreateInput;
}

export function generatedTestsToCreatePayloads(
  tests: readonly GeneratedTest[],
  extraFields: Record<string, unknown> = {},
): TestCreateInput[] {
  return tests.map(t => generatedToCreatePayload(t, extraFields));
}
