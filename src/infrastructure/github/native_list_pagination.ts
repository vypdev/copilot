/** Reconcile bounded complete native metadata pages before using any record. */
export const nativePageSize = 100;
const nativePageLimit = 10;

export async function readCompleteNativeList<T extends { readonly id: number }>(
    read: (page: number) => Promise<{ total: number; items: readonly T[] }>,
): Promise<readonly T[] | undefined> {
    const items = new Map<number, T>();
    let expected: number | undefined;
    for (let page = 1; page <= nativePageLimit; page++) {
        const result = await read(page);
        if (!result || !Array.isArray(result.items)) return undefined;
        expected ??= result.total;
        if (result.total !== expected || !Number.isSafeInteger(expected) || expected < 0
            || expected > nativePageLimit * nativePageSize || result.items.length > nativePageSize) return undefined;
        for (const item of result.items) {
            if (!item || !Number.isSafeInteger(item.id) || item.id < 1 || items.has(item.id)) return undefined;
            items.set(item.id, item);
        }
        if (items.size === expected) return [...items.values()];
        if (items.size > expected || result.items.length !== nativePageSize) return undefined;
    }
    return undefined;
}
