/**
 * 6 default extraction categories — Task 1.3
 *
 * Supersession sources:
 * - archived v2: transcript-field-extractor-v2.json (22 fields, 4 sections: requestor/contact/request/routing)
 * - parent workflow: [DEV] Post-Call Bulletproof v2 (BANT from ElevenLabs data_collection_results, CRM qualification logic)
 *
 * Field micro-prompts ported from archived v2 Component D where applicable.
 */

import type {ExtractionCategory} from './types.js';

export const defaultCategories: ExtractionCategory[] = [
  {
    category_id: 'sales',
    description: 'Sales qualification fields (BANT) — supersedes parent workflow ElevenLabs data_collection_results extraction and CRM qualification logic',
    context_rules: {default_strictness: 'medium', require_rationale: true, null_behavior: 'return_null_with_rationale'},
    fields: [
      {
        field_id: 'deal_stage', type: 'enum', values: ['discovery', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost'], prompt: 'What stage of the sales process is this call at? Consider: Did the caller express a specific need? Did they mention budget or timeline? Are they evaluating options?', strictness: 'high', required: true, default_value: 'discovery',
      },
      {
        field_id: 'budget_mentioned', type: 'string', prompt: 'Extract any budget, price range, or financial constraints mentioned. Include exact figures if stated.', strictness: 'medium', required: false,
      },
      {
        field_id: 'decision_authority', type: 'enum', values: ['caller', 'other', 'unknown'], prompt: 'Does the caller have decision-making authority, or do they reference someone else who decides?', strictness: 'medium', required: true, default_value: 'unknown',
      },
      {
        field_id: 'timeline', type: 'string', prompt: 'Extract any timeline, deadline, or urgency mentioned for making a decision or starting service.', strictness: 'medium', required: false,
      },
      {
        field_id: 'next_steps', type: 'string', prompt: 'What next steps were discussed or agreed upon? Include callbacks, follow-ups, or actions.', strictness: 'low', required: false,
      },
      {
        field_id: 'qualification_status', type: 'enum', values: ['qualified', 'not_qualified', 'needs_review'], prompt: 'Based on the full conversation, is this caller a qualified lead? Qualified = expressed need + budget or timeline. Not qualified = no interest, wrong number, spam. Needs review = ambiguous or incomplete information.', strictness: 'medium', required: true, default_value: 'needs_review',
      },
      {
        field_id: 'transcript_summary', type: 'string', prompt: 'Generate a concise 2-3 sentence summary of the entire conversation. Include: who called, what they wanted, and the outcome.', strictness: 'low', required: true, default_value: 'No summary available',
      },
    ],
  },
  {
    category_id: 'support',
    description: 'Customer support, issue tracking, and service request fields — absorbs archived v2 "request" section',
    context_rules: {default_strictness: 'medium', require_rationale: true, null_behavior: 'return_null_with_rationale'},
    fields: [
      {
        field_id: 'issue_type', type: 'string', prompt: 'What type of issue or request is the caller reporting? Categorize briefly.', strictness: 'medium', required: true,
      },
      {
        field_id: 'urgency', type: 'enum', values: ['emergency', 'soon', 'routine', 'estimate'], prompt: 'How urgent is the caller\'s issue? emergency = safety/critical system down. soon = needs quick attention. routine = standard request. estimate = quote/information only.', strictness: 'high', required: true, default_value: 'routine',
      },
      {
        field_id: 'resolution_status', type: 'enum', values: ['resolved', 'unresolved', 'escalated'], prompt: 'Was the issue resolved during the call, left unresolved, or escalated?', strictness: 'high', required: true, default_value: 'unresolved',
      },
      {
        field_id: 'escalation_needed', type: 'boolean', prompt: 'Does this call require escalation to a human agent or specialist?', strictness: 'high', required: true, default_value: false,
      },
      // Absorbed from archived v2 "request" section
      {
        field_id: 'existing_request', type: 'boolean', prompt: 'Is this regarding an existing request/ticket? Detection: reference to case/ticket numbers, "following up on", "checking status of". Default FALSE when unclear.', strictness: 'high', required: true, default_value: false,
      },
      {
        field_id: 'request_affected_asset', type: 'string', prompt: 'Extract specific equipment, device, software, or system involved. Include model numbers, asset IDs if stated. Return null when no specific asset mentioned.', strictness: 'medium', required: false,
      },
      {
        field_id: 'request_deadline', type: 'string', prompt: 'Extract requestor-specified date or timeframe. Examples: "need this fixed by Friday", "within 48 hours". Return null when none mentioned.', strictness: 'medium', required: false,
      },
      {
        field_id: 'request_description', type: 'string', prompt: 'Generate single factual paragraph (80-120 words) using ONLY explicitly stated information. Inverted-pyramid format. Plain language, active voice. No future commitments.', strictness: 'low', required: false,
      },
      {
        field_id: 'request_summary', type: 'string', prompt: 'Generate precise ticket title (<80 chars). Format: "[Equipment/Issue] - [Location]". Avoid generic terms like "issue", "problem". Include equipment ID if provided.', strictness: 'medium', required: false,
      },
    ],
  },
  {
    category_id: 'external_contacts',
    description: 'Contact information for external parties — absorbs archived v2 "requestor" + "contact" sections with detailed micro-prompts',
    context_rules: {default_strictness: 'high', require_rationale: false, null_behavior: 'return_null_with_rationale'},
    fields: [
      // Absorbed from archived v2 "requestor" section
      {
        field_id: 'requestor_first_name', type: 'string', prompt: 'Extract first name of person calling from self-introduction. Target phrases: "This is [name]", "My name is [name]". Extract ONLY first name component. Return null if no first name provided.', strictness: 'high', required: false,
      },
      {
        field_id: 'requestor_last_name', type: 'string', prompt: 'Extract ONLY last name of person calling. Exclude first names, titles/honorifics. Capture compound surnames completely (e.g., "De La Vega"). Return null when no last name provided.', strictness: 'high', required: false,
      },
      {
        field_id: 'requestor_company_name', type: 'string', prompt: 'Extract requestor\'s employer/company name from self-identification phrases. Valid triggers: "I\'m with...", "calling from...", "I work for...". Critical exclusions: (a) Never extract service provider name from agent greeting, (b) Ignore company being called. Return null when no company affiliation stated.', strictness: 'medium', required: false,
      },
      // Absorbed from archived v2 "contact" section
      {
        field_id: 'contact_phone', type: 'phone', prompt: 'Extract final confirmed callback phone number in E.164 format (+1XXXXXXXXXX). If user corrected a number, use correction only. Convert number words to digits. Return null if count < 10 digits or no number found.', strictness: 'high', required: false,
      },
      {
        field_id: 'contact_email', type: 'email', prompt: 'Extract any email address the caller provides.', strictness: 'high', required: false,
      },
      {
        field_id: 'contact_preferred_followup_channel', type: 'enum', values: ['phone', 'sms', 'email'], prompt: 'Valid values: phone, sms, email. Detection triggers: "call me", "text me", "send me an email". Default to "phone" when unclear.', strictness: 'medium', required: false, default_value: 'phone',
      },
      {
        field_id: 'contact_preferred_followup_time', type: 'string', prompt: 'Extract follow-up timing preferences. Examples: "tomorrow afternoon", "after 6 PM only", "weekdays before noon". Return null when none mentioned.', strictness: 'medium', required: false,
      },
      {
        field_id: 'requested_service_address', type: 'string', prompt: 'Extract physical location WHERE WORK HAPPENS (dispatch destination). NOT the branch being contacted. Return null if no dispatch required or requestor coming to company location.', strictness: 'medium', required: false,
      },
      {
        field_id: 'requestor_is_contact', type: 'boolean', prompt: 'Is requestor the designated contact for follow-up? Default: TRUE. Set FALSE only when requestor makes explicit statement designating alternate contact.', strictness: 'high', required: true, default_value: true,
      },
    ],
  },
  {
    category_id: 'internal_contacts',
    description: 'Internal staff or departments referenced — absorbs archived v2 "routing" section transfer fields',
    context_rules: {default_strictness: 'medium', require_rationale: false, null_behavior: 'return_null_with_rationale'},
    fields: [
      {
        field_id: 'requested_person', type: 'string', prompt: 'Name of specific person requestor asks to speak with. Return null if no specific person requested by name.', strictness: 'high', required: false,
      },
      {
        field_id: 'department', type: 'enum', values: ['Service', 'Field Service', 'Sales', 'Marketing', 'Purchasing', 'Fulfillment', 'Shipping', 'Billing', 'Finance', 'Accounting', 'HR', 'Payroll', 'IT', 'IT Support', 'Operations', 'Contracts', 'Administration', 'General'], prompt: 'EXACTLY one from allowed values. Default "General" when unclear.', strictness: 'high', required: true, default_value: 'General',
      },
      {
        field_id: 'transfer_reason', type: 'string', prompt: 'Short summary (<=120 chars) explaining WHY transferred. Return null if no transfer.', strictness: 'low', required: false,
      },
      // Absorbed from archived v2 "routing" section
      {
        field_id: 'conversation_transferred', type: 'boolean', prompt: 'Was conversation transferred to live person? Set TRUE only when actual transfer mechanism invoked. Default FALSE.', strictness: 'high', required: true, default_value: false,
      },
      {
        field_id: 'transfer_destination', type: 'string', prompt: 'If transferred, capture destination label. Examples: "Main operator", "Billing department". Return null if no transfer.', strictness: 'medium', required: false,
      },
    ],
  },
  {
    category_id: 'external_company',
    description: 'Information about the caller\'s company or organization',
    context_rules: {default_strictness: 'medium', require_rationale: false, null_behavior: 'return_null_with_rationale'},
    fields: [
      {
        field_id: 'company_industry', type: 'string', prompt: 'What industry does the caller\'s company operate in?', strictness: 'medium', required: false,
      },
      {
        field_id: 'company_size', type: 'string', prompt: 'Extract any mention of company size (employees, revenue, locations).', strictness: 'medium', required: false,
      },
      {
        field_id: 'company_location', type: 'string', prompt: 'Extract the caller\'s company location (city, state, region).', strictness: 'medium', required: false,
      },
    ],
  },
  {
    category_id: 'internal_company',
    description: 'Information about the business receiving the call — absorbs archived v2 routing site/urgency fields',
    context_rules: {default_strictness: 'medium', require_rationale: false, null_behavior: 'return_null_with_rationale'},
    fields: [
      {
        field_id: 'site_location', type: 'string', prompt: 'Site or branch location for internal routing. Return null if none mentioned.', strictness: 'medium', required: false,
      },
      {
        field_id: 'service_area', type: 'string', prompt: 'What service area or product line does this call relate to?', strictness: 'medium', required: false,
      },
      {
        field_id: 'account_status', type: 'enum', values: ['active', 'inactive', 'prospect', 'churned'], prompt: 'What is the caller\'s account status? Are they an existing customer, prospect, or former customer?', strictness: 'high', required: true, default_value: 'prospect',
      },
    ],
  },
];
