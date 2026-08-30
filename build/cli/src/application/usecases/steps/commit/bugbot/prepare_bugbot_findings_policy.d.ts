import { type ApplyLimitResult } from './limit_comments';
import type { BugbotFinding } from './types';
export type BugbotResponse = {
    findings?: BugbotFinding[];
    resolved_finding_ids?: string[];
};
export type PreparedBugbotFindings = ApplyLimitResult & {
    resolvedFindingIds: Set<string>;
    /** All accepted findings, including overflow items, used for reconciliation. */
    activeFindings?: readonly BugbotFinding[];
};
export declare function normalizeBugbotResponse(response: unknown): {
    findings: BugbotFinding[];
    resolvedFindingIds: Set<string>;
} | undefined;
export declare function prepareFindings(findings: BugbotFinding[], ignorePatterns: string[], minSeverityValue: string | undefined, maxComments: number): ApplyLimitResult & {
    activeFindings: readonly BugbotFinding[];
};
