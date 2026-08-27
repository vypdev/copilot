import { logError } from "../../../utils/logger";

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
export async function* paginateCursor<T>(
    fetchPage: (cursor: string | null) => Promise<CursorPage<T>>,
    options: CursorPaginationOptions = {},
): AsyncGenerator<CursorPage<T>, void, undefined> {
    const maxPages = options.maxPages ?? 100;
    const description = options.description ?? "cursor pagination";
    let cursor: string | null = null;

    for (let page = 1; page <= maxPages; page += 1) {
        const result = await fetchPage(cursor);
        yield result;

        if (!result.pageInfo.hasNextPage) {
            return;
        }

        if (!result.pageInfo.endCursor) {
            const message = `${description}: hasNextPage is true but endCursor is null (page ${page}).`;
            logError(message);
            throw new Error(message);
        }

        cursor = result.pageInfo.endCursor;
    }

    const message = `${description}: stopped after ${maxPages} pages.`;
    logError(message);
    throw new Error(message);
}
