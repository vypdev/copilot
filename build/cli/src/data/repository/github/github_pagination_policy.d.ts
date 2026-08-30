/**
 * Validates the runtime shape of a paginated GitHub response before callers
 * iterate over it. SDK types describe the happy path, but malformed adapter
 * responses must fail with an actionable boundary error rather than an
 * opaque `.filter`/`.map` TypeError.
 */
export declare function requireArrayPage<T>(data: unknown, operation: string): T[];
