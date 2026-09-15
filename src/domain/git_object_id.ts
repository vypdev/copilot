const GIT_OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

/** Canonicalizes a real SHA-1/SHA-256 object ID and rejects webhook null sentinels. */
export function canonicalGitObjectId(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim().toLowerCase();
    if (!GIT_OBJECT_ID_PATTERN.test(normalized) || /^0+$/u.test(normalized)) return undefined;
    return normalized;
}
