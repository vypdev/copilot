import { applyCommentLimit } from './limit_comments';
import type { BugbotFinding } from './types';
export type BugbotResponse = {
    findings?: BugbotFinding[];
    resolved_finding_ids?: string[];
};
export type PreparedBugbotFindings = ReturnType<typeof applyCommentLimit> & {
    resolvedFindingIds: Set<string>;
};
export declare function prepareBugbotFindings(response: unknown, ignorePatterns: string[], minSeverityValue: string | undefined, maxComments: number): PreparedBugbotFindings | undefined;
