import { MAX_CENTER_RESPONSE_BYTES } from './center_limits.ts';
import { deepFreeze, jsonBytesWithin, keys, record } from './value.ts';

export function exactHistoryFields(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
    return record(value) && keys(value, fields) && Object.keys(value).length === fields.length;
}
/** Validate a bounded detached JSON value, never a mutable provider object or accessor-backed reference. */
export function decodeHistoryValue<T>(value: unknown, valid: (value: unknown) => value is T): T | null {
    try {
        if (!jsonBytesWithin(value, MAX_CENTER_RESPONSE_BYTES)) return null;
        const copied: unknown = JSON.parse(JSON.stringify(value));
        return valid(copied) ? deepFreeze(copied) : null;
    } catch { return null; }
}
