/** Dynamic strictness inference — Task 1.4 */

import type {ExtractionField, StrictnessLevel} from './types.js';

const LOW_FIELD_PATTERNS = /summary|notes|description|comments|remarks/i;

export function inferStrictness(field: ExtractionField): StrictnessLevel {
	if (field.strictness) return field.strictness;

	if (field.type === 'boolean' || field.type === 'phone' || field.type === 'email') return 'high';
	if (field.validation?.pattern) return 'high';
	if (field.type === 'enum' && field.values && field.values.length <= 5) return 'high';

	if (field.type === 'enum') return 'medium';
	if (field.type === 'string' && field.required) return 'medium';

	if (LOW_FIELD_PATTERNS.test(field.field_id)) return 'low';
	if (field.type === 'string' && !field.required) return 'low';

	return 'medium';
}
