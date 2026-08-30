/**
 * Parses an identifier received from an external boundary.
 *
 * GitHub identifiers are positive safe integers. Keeping this policy in the
 * domain makes models and application policies share the same invariant
 * without depending on an adapter or runtime-specific input helper.
 */
export function parsePositiveSafeInteger(value: unknown): number | undefined {
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) && value > 0 ? value : undefined;
    }

    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    if (!/^\+?\d+$/u.test(normalized)) return undefined;

    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
