import { CursorPage, paginateCursor } from "../github/github_pagination_adapter";

describe("paginateCursor", () => {
    it("fetches pages until hasNextPage is false", async () => {
        const fetchPage = jest.fn<Promise<CursorPage<number>>, [string | null]>()
            .mockResolvedValueOnce({ nodes: [1, 2], pageInfo: { hasNextPage: true, endCursor: "cursor-1" } })
            .mockResolvedValueOnce({ nodes: [3], pageInfo: { hasNextPage: false, endCursor: null } });

        const nodes: number[] = [];
        for await (const page of paginateCursor(fetchPage)) {
            nodes.push(...page.nodes);
        }

        expect(nodes).toEqual([1, 2, 3]);
        expect(fetchPage).toHaveBeenNthCalledWith(1, null);
        expect(fetchPage).toHaveBeenNthCalledWith(2, "cursor-1");
    });

    it("rejects a page that requests continuation without a cursor", async () => {
        const fetchPage = jest.fn().mockResolvedValue({
            nodes: [],
            pageInfo: { hasNextPage: true, endCursor: null },
        });

        await expect(async () => {
            for await (const _page of paginateCursor(fetchPage, { description: "projects" })) {
                // Consume the iterator.
            }
        }).rejects.toThrow("projects: hasNextPage is true but endCursor is null");
    });
});
