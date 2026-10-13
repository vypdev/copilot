import { readCopilotHistory } from '../read_copilot_history_workflow';
import type { CopilotHistoryRequest } from '../../ports/copilot_history_ports';
const request: CopilotHistoryRequest = { owner: 'acme', repository: 'widget', target: { kind: 'issue', number: 42 },
    queryId: 100, botLogin: 'vypbot', locale: 'en-US', generalConversation: true };
const comments = [{ id: 10, body: '/copilot remember bounded rule', user: { login: 'developer' } }];
const coverage = { source: 'issue-comments' as const, status: 'complete' as const, pagesFetched: 1,
    itemsFetched: 1, itemsRetained: 1, omittedItems: 0, truncatedItems: 0, limitReached: false };
const publication = (result: Awaited<ReturnType<typeof readCopilotHistory>>) => (result.payload as { publication: { state: string; rows: unknown[]; target: unknown } }).publication;
describe('bounded exact-conversation history workflow', () => {
    it('reads only the bound issue and returns immutable retained records', async () => {
        const readComments = jest.fn().mockResolvedValue({ value: comments, coverage });
        const result = await readCopilotHistory(request, { serverOrigin: 'https://github.com', readComments });
        expect(readComments).toHaveBeenCalledTimes(1); expect(readComments).toHaveBeenCalledWith(42);
        expect(publication(result).state).toBe('complete'); expect(publication(result).rows).toHaveLength(1);
        expect(Object.isFrozen(publication(result))).toBe(true);
    });
    it('uses the exact PR conversation without resolving another issue', async () => {
        const readComments = jest.fn().mockResolvedValue({ value: [], coverage: { ...coverage, itemsFetched: 0, itemsRetained: 0 } });
        expect(publication(await readCopilotHistory({ ...request, target: { kind: 'pr', number: 75 } }, { serverOrigin: 'https://github.example', readComments })).target).toEqual({ kind: 'pr', number: 75 });
        expect(readComments).toHaveBeenCalledWith(75);
    });
    it('preserves an incomplete retained subset', async () => expect(publication(await readCopilotHistory(request, { serverOrigin: 'https://github.com',
        readComments: async () => ({ value: comments, coverage: { ...coverage, status: 'partial' } }) })).state).toBe('partial'));
    it('does not prove empty history from an incomplete empty sample', async () => expect(publication(await readCopilotHistory(request, { serverOrigin: 'https://github.com',
        readComments: async () => ({ value: [], coverage: { ...coverage, status: 'partial', itemsRetained: 0 } }) })).state).toBe('unavailable'));
    it('contains provider failures without disclosing the error or inferring absence', async () => {
        const result = await readCopilotHistory(request, { serverOrigin: 'https://github.com', readComments: async () => { throw new Error('SECRET'); } });
        expect(publication(result).state).toBe('unavailable'); expect(JSON.stringify(result)).not.toContain('SECRET');
    });
    it.each([{ generalConversation: false }, { botLogin: '' }, { queryId: 0 }, { target: { kind: 'issue' as const, number: 0 } }])('does not read an unavailable target binding %#', async changed => {
        const readComments = jest.fn(); expect(publication(await readCopilotHistory({ ...request, ...changed }, { serverOrigin: 'https://github.com', readComments })).state).toBe('generalConversation' in changed ? 'unsupported-surface' : 'unavailable'); expect(readComments).not.toHaveBeenCalled();
    });
    it('keeps an unavailable composition unknown', async () => expect(publication(await readCopilotHistory(request)).state).toBe('unavailable'));
    it.each([{ source: 'review-threads' as const }, { itemsRetained: 2 }, { itemsFetched: 0 }])('rejects contradictory provider coverage %#', async changed => expect(publication(await readCopilotHistory(request,
        { serverOrigin: 'https://github.com', readComments: async () => ({ value: comments, coverage: { ...coverage, ...changed } }) })).state).toBe('unavailable'));
    it.each([{ truncatedItems: 1 }, { omittedItems: 1 }, { providerLimitReached: true }, { limitReached: true }])('keeps incomplete coverage partial even if a provider labels it complete %#', async changed => expect(publication(await readCopilotHistory(request,
        { serverOrigin: 'https://github.com', readComments: async () => ({ value: comments, coverage: { ...coverage, ...changed } }) })).state).toBe('partial'));
});

it.each([{ itemsFetched: NaN }, { itemsFetched: 1.5 }, { itemsFetched: '1' }, { limitReached: undefined },
    { providerLimitReached: 'false' }, { pagesFetched: -1 }])('cannot certify completeness from malformed provider counters %#', async changed => {
    const result = await readCopilotHistory(request, { serverOrigin: 'https://github.com',
        readComments: async () => ({ value: comments, coverage: { ...coverage, ...changed } as never }) });
    expect(publication(result).state).toBe('unavailable'); expect(publication(result).rows).toEqual([]);
});
