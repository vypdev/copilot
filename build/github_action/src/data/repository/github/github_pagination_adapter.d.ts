export interface CursorPage<T> {
    nodes: T[];
    pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
    };
}
export interface CursorPaginationOptions {
    maxPages?: number;
    description?: string;
}
/**
 * Iterates cursor-based API pages while enforcing a finite boundary and a
 * valid cursor transition. Consumers can `break` early when they find the
 * desired item.
 */
export declare function paginateCursor<T>(fetchPage: (cursor: string | null) => Promise<CursorPage<T>>, options?: CursorPaginationOptions): AsyncGenerator<CursorPage<T>, void, undefined>;
