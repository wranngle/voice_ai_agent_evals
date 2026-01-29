/**
 * LLM Extraction Engine — n8n Eval Tests
 *
 * Tests the [DEV] LLM Extraction Engine subworkflow (ID: 2Z4wykQk0x1Y67Sr)
 * via the n8n workflow execution API.
 */

import {describe, it, expect, beforeEach, vi, afterEach} from 'vitest';
import {N8nEvalRunner} from '../../lib/testing/runners/n8n-eval-runner';
import type {TestCase} from '../../lib/testing/types';
import {defaultCategories} from '../../lib/extraction/categories';

const WORKFLOW_ID = '2Z4wykQk0x1Y67Sr';

const sampleTranscript = `agent: Thank you for calling ExampleCo, this is Sarah. How can I help you today?
user: Hi, my name is John Martinez. I'm calling from Acme Corp, we're looking for a new automation platform.
agent: Great to hear from you, John! What kind of automation are you looking for?
user: We need something to handle our customer support calls. We have about 200 employees and get around 500 calls a day.
agent: That's a great use case. Do you have a budget range in mind?
user: We're looking at somewhere between 50 and 100 thousand dollars annually.
agent: And what's your timeline for implementation?
user: We need something up and running by Q2 this year. I'm the VP of Operations so I can make the decision.
agent: Perfect. Let me schedule a demo for you. What's the best number to reach you?
user: You can call me at 555-867-5309 or email me at john.martinez@acmecorp.com
agent: Got it. I'll have our team reach out to schedule that demo. Anything else I can help with?
user: No, that's all. Thanks Sarah!
agent: Thank you, John! Have a great day.`;

const sampleAgentPrompt = 'You are Sarah, an AI SDR for ExampleCo. You qualify inbound sales leads using BANT methodology.';

function makeTestCase(overrides: Partial<TestCase> & {input: Record<string, unknown>; expected_output: Record<string, unknown>}): TestCase {
	return {
		test_id: 'TC-EXTRACT-000',
		type: 'n8n-eval',
		name: 'Extraction test',
		description: 'LLM Extraction Engine test',
		tags: ['extraction'],
		enabled: true,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		...overrides,
	};
}

function mockSuccessfulExecution(outputJson: Record<string, unknown>) {
	vi.spyOn(global, 'fetch').mockResolvedValueOnce(
		new Response(JSON.stringify({
			id: 'exec_extract_001',
			status: 'success',
			finished: true,
			data: {
				resultData: {
					runData: {
						'Execute Workflow Trigger': [{data: {main: [[{json: {}}]]}}],
						'Validate Inputs': [{data: {main: [[{json: {valid: true}}]]}}],
						'Check Valid': [{data: {main: [[{json: {}}]]}}],
						'Split by Category': [{data: {main: [[{json: {}}]]}}],
						'Prep Category Batch': [{data: {main: [[{json: {}}]]}}],
						'Build 5-Component Prompt': [{data: {main: [[{json: {}}]]}}],
						'Call Gemini 3 Pro': [{data: {main: [[{json: {}}]]}}],
						'Parse and Validate Response': [{data: {main: [[{json: {}}]]}}],
						'Loop Back': [{data: {main: [[{json: {}}]]}}],
						'Aggregate Results': [{data: {main: [[{json: outputJson}]]}}],
					},
					lastNodeExecuted: 'Aggregate Results',
				},
			},
		}), {status: 200}),
	);
}

function mockValidationFailure() {
	vi.spyOn(global, 'fetch').mockResolvedValueOnce(
		new Response(JSON.stringify({
			id: 'exec_extract_002',
			status: 'success',
			finished: true,
			data: {
				resultData: {
					runData: {
						'Execute Workflow Trigger': [{data: {main: [[{json: {}}]]}}],
						'Validate Inputs': [{data: {main: [[{json: {valid: false, errors: ['transcript is required']}}]]}}],
						'Check Valid': [{data: {main: [[{json: {}}]]}}],
						'Error Response': [{data: {main: [[{json: {extraction_id: 'ext_test', timestamp: new Date().toISOString(), model: 'gemini-3-pro', categories_processed: 0, fields: [], errors: [{type: 'validation', message: 'transcript is required'}]}}]]}}],
					},
					lastNodeExecuted: 'Error Response',
				},
			},
		}), {status: 200}),
	);
}

describe('LLM Extraction Engine — n8n Eval', () => {
	let runner: N8nEvalRunner;

	beforeEach(() => {
		runner = new N8nEvalRunner('https://your-n8n-host.example.com/api/v1', 'test-api-key');
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Valid single-category extraction', () => {
		it('executes sales category and returns field envelopes', async () => {
			const salesCategory = defaultCategories.find(c => c.category_id === 'sales')!;

			mockSuccessfulExecution({
				extraction_id: 'ext_test123',
				timestamp: new Date().toISOString(),
				model: 'gemini-3-pro',
				categories_processed: 1,
				fields: [
					{category: 'sales', field_id: 'deal_stage', value: 'qualification', rationale: 'Caller discussed budget and timeline', confidence: 0.9, strictness_applied: 'high', validation_passed: true},
					{category: 'sales', field_id: 'budget_mentioned', value: '50-100k annually', rationale: 'Explicitly stated', confidence: 1.0, strictness_applied: 'medium', validation_passed: true},
					{category: 'sales', field_id: 'decision_authority', value: 'caller', rationale: 'VP of Operations, stated can make decision', confidence: 0.95, strictness_applied: 'medium', validation_passed: true},
					{category: 'sales', field_id: 'timeline', value: 'Q2 this year', rationale: 'Explicitly stated', confidence: 1.0, strictness_applied: 'medium', validation_passed: true},
				],
				errors: [],
			});

			const testCase = makeTestCase({
				test_id: 'TC-EXTRACT-001',
				name: 'Sales category extraction',
				input: {
					workflow_id: WORKFLOW_ID,
					payload: {
						transcript: sampleTranscript,
						agent_system_prompt: sampleAgentPrompt,
						extraction_config: {categories: [salesCategory], global_context: {agent_identity: 'SDR', business_domain: 'sales'}},
					},
				},
				expected_output: {
					execution_status: 'success',
					nodes_executed: ['Validate Inputs', 'Build 5-Component Prompt', 'Call Gemini 3 Pro', 'Parse and Validate Response', 'Aggregate Results'],
					output_contains: {categories_processed: 1},
				},
			});

			const result = await runner.execute(testCase);
			expect(result.status).toBe('passed');
			expect(result.actual_output.output.fields.length).toBeGreaterThan(0);
			expect(result.actual_output.output.errors).toHaveLength(0);
		});
	});

	describe('Multi-category extraction', () => {
		it('processes sales + external_contacts categories', async () => {
			const salesCat = defaultCategories.find(c => c.category_id === 'sales')!;
			const contactsCat = defaultCategories.find(c => c.category_id === 'external_contacts')!;

			mockSuccessfulExecution({
				extraction_id: 'ext_multi_001',
				timestamp: new Date().toISOString(),
				model: 'gemini-3-pro',
				categories_processed: 2,
				fields: [
					{category: 'sales', field_id: 'deal_stage', value: 'qualification', confidence: 0.9, strictness_applied: 'high', validation_passed: true},
					{category: 'external_contacts', field_id: 'requestor_first_name', value: 'John', confidence: 1.0, strictness_applied: 'high', validation_passed: true},
					{category: 'external_contacts', field_id: 'requestor_last_name', value: 'Martinez', confidence: 1.0, strictness_applied: 'high', validation_passed: true},
					{category: 'external_contacts', field_id: 'requestor_company_name', value: 'Acme Corp', confidence: 1.0, strictness_applied: 'medium', validation_passed: true},
					{category: 'external_contacts', field_id: 'contact_phone', value: '+15558675309', confidence: 0.9, strictness_applied: 'high', validation_passed: true},
					{category: 'external_contacts', field_id: 'contact_email', value: 'john.martinez@acmecorp.com', confidence: 1.0, strictness_applied: 'high', validation_passed: true},
				],
				errors: [],
			});

			const testCase = makeTestCase({
				test_id: 'TC-EXTRACT-002',
				name: 'Multi-category extraction',
				input: {
					workflow_id: WORKFLOW_ID,
					payload: {
						transcript: sampleTranscript,
						agent_system_prompt: sampleAgentPrompt,
						extraction_config: {categories: [salesCat, contactsCat]},
					},
				},
				expected_output: {
					execution_status: 'success',
					output_contains: {categories_processed: 2},
				},
			});

			const result = await runner.execute(testCase);
			expect(result.status).toBe('passed');

			const output = result.actual_output.output;
			const categories = new Set(output.fields.map((f: Record<string, unknown>) => f.category));
			expect(categories.has('sales')).toBe(true);
			expect(categories.has('external_contacts')).toBe(true);
		});
	});

	describe('Input validation errors', () => {
		it('returns error envelope for empty transcript', async () => {
			mockValidationFailure();

			const testCase = makeTestCase({
				test_id: 'TC-EXTRACT-003',
				name: 'Empty transcript rejection',
				input: {
					workflow_id: WORKFLOW_ID,
					payload: {
						transcript: '',
						agent_system_prompt: sampleAgentPrompt,
						extraction_config: {categories: [defaultCategories[0]]},
					},
				},
				expected_output: {
					execution_status: 'success',
					nodes_executed: ['Validate Inputs', 'Error Response'],
				},
			});

			const result = await runner.execute(testCase);
			expect(result.status).toBe('passed');
			expect(result.actual_output.last_node_executed).toBe('Error Response');
		});

		it('returns error envelope for missing config', async () => {
			mockValidationFailure();

			const testCase = makeTestCase({
				test_id: 'TC-EXTRACT-004',
				name: 'Missing config rejection',
				input: {
					workflow_id: WORKFLOW_ID,
					payload: {
						transcript: sampleTranscript,
						agent_system_prompt: sampleAgentPrompt,
						extraction_config: {categories: []},
					},
				},
				expected_output: {
					execution_status: 'success',
					nodes_executed: ['Validate Inputs', 'Error Response'],
				},
			});

			const result = await runner.execute(testCase);
			expect(result.status).toBe('passed');
		});
	});

	describe('Gemini failure handling', () => {
		it('continues processing when one category LLM call fails', async () => {
			mockSuccessfulExecution({
				extraction_id: 'ext_partial_001',
				timestamp: new Date().toISOString(),
				model: 'gemini-3-pro',
				categories_processed: 1,
				fields: [
					{category: 'sales', field_id: 'deal_stage', value: 'qualification', confidence: 0.9, strictness_applied: 'high', validation_passed: true},
				],
				errors: [{type: 'parse_error', category: 'external_contacts', message: 'Failed to parse Gemini response: No text in Gemini response'}],
			});

			const testCase = makeTestCase({
				test_id: 'TC-EXTRACT-005',
				name: 'Partial failure resilience',
				input: {
					workflow_id: WORKFLOW_ID,
					payload: {
						transcript: sampleTranscript,
						agent_system_prompt: sampleAgentPrompt,
						extraction_config: {categories: [defaultCategories[0], defaultCategories[2]]},
					},
				},
				expected_output: {
					execution_status: 'success',
				},
			});

			const result = await runner.execute(testCase);
			expect(result.status).toBe('passed');
			expect(result.actual_output.output.errors.length).toBeGreaterThan(0);
			expect(result.actual_output.output.fields.length).toBeGreaterThan(0);
		});
	});

	describe('Supersession coverage', () => {
		it('extraction config covers all archived v2 fields', () => {
			const allFieldIds = new Set(defaultCategories.flatMap(c => c.fields.map(f => f.field_id)));

			// Archived v2 "requestor" section
			expect(allFieldIds.has('requestor_first_name')).toBe(true);
			expect(allFieldIds.has('requestor_last_name')).toBe(true);
			expect(allFieldIds.has('requestor_company_name')).toBe(true);

			// Archived v2 "contact" section
			expect(allFieldIds.has('contact_phone')).toBe(true);
			expect(allFieldIds.has('contact_email')).toBe(true);
			expect(allFieldIds.has('contact_preferred_followup_channel')).toBe(true);
			expect(allFieldIds.has('contact_preferred_followup_time')).toBe(true);
			expect(allFieldIds.has('requested_service_address')).toBe(true);
			expect(allFieldIds.has('requestor_is_contact')).toBe(true);

			// Archived v2 "request" section
			expect(allFieldIds.has('existing_request')).toBe(true);
			expect(allFieldIds.has('request_affected_asset')).toBe(true);
			expect(allFieldIds.has('request_deadline')).toBe(true);
			expect(allFieldIds.has('request_description')).toBe(true);
			expect(allFieldIds.has('request_summary')).toBe(true);

			// Archived v2 "routing" section
			expect(allFieldIds.has('requested_person')).toBe(true);
			expect(allFieldIds.has('department')).toBe(true);
			expect(allFieldIds.has('conversation_transferred')).toBe(true);
			expect(allFieldIds.has('transfer_destination')).toBe(true);
		});

		it('extraction config covers parent workflow BANT + qualification', () => {
			const salesFields = new Set(defaultCategories.find(c => c.category_id === 'sales')!.fields.map(f => f.field_id));
			expect(salesFields.has('budget_mentioned')).toBe(true);
			expect(salesFields.has('timeline')).toBe(true);
			expect(salesFields.has('decision_authority')).toBe(true);
			expect(salesFields.has('deal_stage')).toBe(true);
			expect(salesFields.has('qualification_status')).toBe(true);
			expect(salesFields.has('transcript_summary')).toBe(true);
		});
	});
});
