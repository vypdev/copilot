/**
 * Validates the runtime shape of a paginated GitHub response before callers
 * iterate over it. SDK types describe the happy path, but malformed adapter
 * responses must fail with an actionable boundary error rather than an
 * opaque `.filter`/`.map` TypeError.
 */
export function requireArrayPage<T>(data: unknown, operation: string): T[] {
    if (!Array.isArray(data)) {
        throw new Error(`GitHub ${operation} response did not contain an array page.`);
    }
    return data as T[];
}
