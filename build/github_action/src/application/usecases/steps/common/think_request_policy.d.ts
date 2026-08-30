import type { Execution } from '../../../../data/model/execution';
export type ThinkRequestDecision = {
    kind: 'skip';
    reason: 'empty-comment' | 'missing-token' | 'not-mentioned' | 'empty-question';
} | {
    kind: 'ready';
    commentBody: string;
    question: string;
    issueNumberForContext: number;
    destinationNumber: number;
    destinationType: 'issue' | 'PR';
};
/** Resolves the comment input and destination without performing I/O. */
export declare function resolveThinkRequest(param: Pick<Execution, 'issue' | 'pullRequest' | 'issueNumber' | 'tokenUser'>): ThinkRequestDecision;
