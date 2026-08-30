import { applyCommentLimit } from './limit_comments';
import type { BugbotFinding } from './types';
export type BugbotResponse = {
    findings?: BugbotFinding[];
    resolved_finding_ids?: string[];
};
export type PreparedBugbotFindings = ReturnType<typeof applyCommentLimit> & {
    resolvedFindingIds: Set<string>;
};
export declare function normalizeBugbotResponse(response: unknown): {
    findings: BugbotFinding[];
    resolvedFindingIds: Set<string>;
} | undefined;
export declare function prepareFindings(findings: BugbotFinding[], ignorePatterns: string[], minSeverityValue: string | undefined, maxComments: number): ReturnType<typeof applyCommentLimit>;
