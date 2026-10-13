import { createCopilotHistoryReadPort } from '../copilot_history_port_factory';
const coverage = { source: 'issue-comments' as const, status: 'complete' as const, pagesFetched: 1, itemsFetched: 0,
    itemsRetained: 0, omittedItems: 0, truncatedItems: 0, limitReached: false };
describe('physical history read authority', () => {
    it('exposes only a frozen origin and exact comment query, with no credential or mutation capability', () => {
        const port = createCopilotHistoryReadPort({ listIssueComments: jest.fn() });
        expect(Object.keys(port).sort()).toEqual(['readComments', 'serverOrigin']); expect(Object.isFrozen(port)).toBe(true);
        expect(port.serverOrigin).toBe('https://github.com'); expect(JSON.stringify(port)).not.toMatch(/token|mutation|reviewThread/);
    });
    it('preserves the bound provider receiver and exact target', async () => {
        const source = { expected: 42, async listIssueComments(number: number) { expect(number).toBe(this.expected); return { value: [], coverage }; } };
        await expect(createCopilotHistoryReadPort(source, 'https://github.example').readComments(42)).resolves.toEqual({ value: [], coverage });
    });
    it('retains the provider completeness proof without normalization', async () => {
        const read = { value: [], coverage }; await expect(createCopilotHistoryReadPort({ listIssueComments: async () => read }).readComments(1)).resolves.toBe(read);
    });
    it('preserves incomplete retained subset evidence', async () => {
        const read = { value: [{ id: 3, body: '/copilot fix all' }], coverage: { ...coverage, status: 'partial' as const, itemsRetained: 1, itemsFetched: 1 } };
        await expect(createCopilotHistoryReadPort({ listIssueComments: async () => read }).readComments(9)).resolves.toBe(read);
    });
    it('does not convert provider denial into complete empty results', async () => {
        await expect(createCopilotHistoryReadPort({ listIssueComments: async () => { throw new Error('denied'); } }).readComments(42)).rejects.toThrow('denied');
    });
});
