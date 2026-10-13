import { Result } from '../../data/model/result';
import type { CopilotHistoryReadPort, CopilotHistoryRequest } from '../ports/copilot_history_ports';
import { HISTORY_UNAVAILABLE, HISTORY_UNSUPPORTED_SURFACE, selectCopilotHistory } from '../policies/copilot_history_policy';

/** A failed read cannot prove empty history or an operation failure. */
export async function readCopilotHistory(request: CopilotHistoryRequest, ports?: CopilotHistoryReadPort): Promise<Result> {
    let history = request.generalConversation ? HISTORY_UNAVAILABLE : HISTORY_UNSUPPORTED_SURFACE;
    if (ports && request.generalConversation && request.botLogin && Number.isSafeInteger(request.target.number)
        && request.target.number > 0 && Number.isSafeInteger(request.queryId) && request.queryId > 0) {
        try {
            const read = await ports.readComments(request.target.number);
            const coverage = read.coverage;
            const counters = [coverage.pagesFetched, coverage.itemsFetched, coverage.itemsRetained, coverage.omittedItems, coverage.truncatedItems];
            if (counters.some(value => !Number.isSafeInteger(value) || value < 0)
                || typeof coverage.limitReached !== 'boolean'
                || (coverage.providerLimitReached !== undefined && typeof coverage.providerLimitReached !== 'boolean')) throw new Error('Invalid history coverage counters.');
            if (coverage.source !== 'issue-comments' || coverage.itemsRetained !== read.value.length
                || coverage.itemsFetched < coverage.itemsRetained || !['complete', 'partial'].includes(coverage.status)) throw new Error('Invalid history coverage.');
            history = selectCopilotHistory({ target: `${request.target.kind}:${request.target.number}`, queryId: request.queryId,
                botLogin: request.botLogin, complete: coverage.status === 'complete' && coverage.omittedItems === 0
                    && coverage.truncatedItems === 0 && !coverage.limitReached && !coverage.providerLimitReached,
                comments: read.value.map(comment => Object.freeze({ id: comment.id, body: comment.body,
                    author: comment.user?.login ?? '', automated: comment.isAutomatedAuthor })) });
        } catch { /* Provider errors disclose no inferred absence and no raw error. */ }
    }
    return new Result({ id: 'CommentAutomation.History', success: true, executed: true,
        payload: { publication: Object.freeze({ ...history, owner: request.owner, repository: request.repository,
            target: Object.freeze({ ...request.target }), serverOrigin: ports?.serverOrigin ?? 'https://github.com' }) } });
}
