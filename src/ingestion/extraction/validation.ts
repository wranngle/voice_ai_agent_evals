/** Field-level validation and repair — Tasks 3.1–3.2 */

import type {ExtractionField} from './types.js';

const E164_PATTERN = /^\+[1-9]\d{1,14}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function repairValue(field: ExtractionField, raw: unknown): unknown {
  if (raw === null || raw === undefined) {
    return null;
  }

  if (field.type === 'boolean') {
    if (typeof raw === 'boolean') {
      return raw;
    }

    if (typeof raw === 'string') {
      if (raw.toLowerCase() === 'true') {
        return true;
      }

      if (raw.toLowerCase() === 'false') {
        return false;
      }
    }

    return null;
  }

  if (field.type === 'enum' && field.values) {
    // Only stringify primitives — String(rawObject) yields "[object Object]",
    // which would falsely propagate into the enum-not-found return below.
    if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') {
      return null;
    }

    const string_ = String(raw).trim();
    const exact = field.values.find(v => v === string_);
    if (exact) {
      return exact;
    }

    const caseMatch = field.values.find(v => v.toLowerCase() === string_.toLowerCase());
    if (caseMatch) {
      return caseMatch;
    }

    return string_;
  }

  if (typeof raw === 'string') {
    return raw.trim();
  }

  return raw;
}

export function validateValue(field: ExtractionField, value: unknown): boolean {
  if (value === null || value === undefined) {
    return !field.required;
  }

  switch (field.type) {
    case 'boolean': {return typeof value === 'boolean';
    }

    case 'phone': {return typeof value === 'string' && E164_PATTERN.test(value);
    }

    case 'email': {return typeof value === 'string' && EMAIL_PATTERN.test(value);
    }

    case 'enum': {return typeof value === 'string' && (field.values?.includes(value) ?? true);
    }

    case 'number': {return typeof value === 'number' && !Number.isNaN(value);
    }

    case 'string': {return typeof value === 'string' && value.length > 0;
    }
  }

  return true;
}
