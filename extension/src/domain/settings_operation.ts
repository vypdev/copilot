import { validSettings, type Settings } from './settings.ts';
import { deepFreeze, record } from './value.ts';

export const settingsOperationId = (value: unknown): value is string => typeof value === 'string'
    && /^[a-f0-9]{32}$(?![\s\S])/u.test(value);

/** Freeze a complete admission-time copy, never a mutable caller-owned reference. */
export function settingsSnapshot(value: unknown): Settings | null {
    try {
        if (!validSettings(value)) return null;
        const copied: unknown = JSON.parse(JSON.stringify(value));
        return validSettings(copied) ? deepFreeze(copied) : null;
    } catch { return null; }
}

/** Object key order is not an authored preference; array order is retained. */
export function sameSettingsContent(first: unknown, second: unknown): boolean {
    if (!validSettings(first) || !validSettings(second)) return false;
    const ordered = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(ordered);
        if (record(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]));
        return value;
    };
    return JSON.stringify(ordered(first)) === JSON.stringify(ordered(second));
}
