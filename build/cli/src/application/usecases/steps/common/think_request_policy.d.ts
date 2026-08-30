import type { Execution } from '../../../../data/model/execution';
import { type ParsedCopilotCommand } from '../../../../domain/copilot_command';
export type ThinkRequestDecision = {
    kind: 'skip';
    reason: 'empty-comment' | 'missing-token' | 'not-mentioned' | 'empty-question' | 'invalid-command';
    detail?: string;
} | {
    kind: 'ready';
    commentBody: string;
    question: string;
    issueNumberForContext: number;
    destinationNumber: number;
    destinationType: 'issue' | 'PR';
    command?: ParsedCopilotCommand;
};
/** Resolves the comment input and destination without performing I/O. */
export declare function resolveThinkRequest(param: Pick<Execution, 'issue' | 'pullRequest' | 'issueNumber' | 'tokenUser'>): ThinkRequestDecision;
