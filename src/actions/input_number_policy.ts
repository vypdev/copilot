export function parseIntegerInput(value: unknown, fallback: number): number {
    const parsed = parseStrictInteger(value);
    return parsed ?? fallback;
}

export function parseNonNegativeIntegerInput(value: unknown, fallback: number): number {
    const parsed = parseStrictInteger(value);
    return parsed !== undefined && parsed >= 0 ? parsed : fallback;
}

export function parseBoundedPositiveIntegerInput(value: unknown, fallback: number, maximum: number): number {
    const parsed = parseStrictInteger(value);
    if (parsed === undefined || parsed < 1) {
        return fallback;
    }
    return Math.min(parsed, maximum);
}

function parseStrictInteger(value: unknown): number | undefined {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) ? value : undefined;
    }
    if (typeof value !== 'string' || !/^[+-]?\d+$/u.test(value.trim())) {
        return undefined;
    }

    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) ? parsed : undefined;
}
