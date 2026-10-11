import { getResultPayload } from '../../data/model/result';

export const IMPLEMENTATION_REPLY_RESULT_ID = 'CommentAutomation.ImplementationReply';

export interface ImplementationResultProjection {
    readonly kind: 'implementation-result';
    readonly outcome: 'changes-pushed' | 'no-changes';
    readonly branch: string;
}

/** A receipt proves the operation's outcome, not feature acceptance or completeness. */
export function readImplementationResult(
    resultId: string,
    payload: unknown,
): ImplementationResultProjection | undefined {
    if (resultId !== IMPLEMENTATION_REPLY_RESULT_ID) return undefined;
    const publication = getResultPayload(getResultPayload(payload)?.publication);
    if (publication?.kind !== 'implementation-result'
        || (publication.outcome !== 'changes-pushed' && publication.outcome !== 'no-changes')
        || typeof publication.branch !== 'string' || !publication.branch.trim()
        || publication.branch.length > 255 || /\p{Cc}/u.test(publication.branch)
        || Object.keys(publication).some(key => !['kind', 'outcome', 'branch'].includes(key))) return undefined;
    return Object.freeze({ kind: 'implementation-result', outcome: publication.outcome,
        branch: publication.branch.trim() });
}
