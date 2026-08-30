/**
 * Stable, provider-independent identity for a Bugbot finding. The model may
 * choose a display id, but it must not control reconciliation identity.
 *
 * The identity deliberately excludes the finding's prose and suggestion.
 * Providers often rephrase those fields between runs even when the underlying
 * issue is unchanged. Including them would turn harmless wording changes into
 * duplicate comments and would make resolution reconciliation unreliable.
 */

export interface FindingIdentityInput {
    readonly file?: unknown;
    readonly line?: unknown;
    readonly title?: unknown;
    readonly description?: unknown;
    readonly suggestion?: unknown;
}

export function buildFindingFingerprint(finding: FindingIdentityInput): string {
    const canonical = [
        normalizePath(finding.file),
        normalizeText(finding.title),
        normalizeLine(finding.line),
    ].join('|');
    return `fp-${fnv1a(canonical)}`;
}

function normalizePath(value: unknown): string {
    return typeof value === 'string'
        ? value.trim().replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase()
        : '';
}

function normalizeText(value: unknown): string {
    return typeof value === 'string'
        ? value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
        : '';
}

function normalizeLine(value: unknown): string {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return '';
    // A small line bucket keeps identity stable when a nearby edit shifts code.
    return String(Math.floor(value / 5));
}

function fnv1a(value: string): string {
    let hash = 0x811c9dc5;
    for (const character of value) {
        hash ^= character.codePointAt(0) ?? 0;
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}
