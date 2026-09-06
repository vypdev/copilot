import { type ApplyLimitResult } from './limit_comments';
import type { BugbotFinding } from './types';
import type { BugbotFindingResolution } from './types';
export type BugbotResponse = {
    findings?: BugbotFinding[];
    resolved_finding_ids?: string[];
    resolved_finding_reasons?: Record<string, BugbotFindingResolution>;
};
export type PreparedBugbotFindings = ApplyLimitResult & {
    resolvedFindingIds: Set<string>;
    resolvedFindingResolutions?: ReadonlyMap<string, BugbotFindingResolution>;
    /** All accepted findings, including overflow items, used for reconciliation. */
    activeFindings?: readonly BugbotFinding[];
};
/** Hard cap for model-controlled arrays before any filtering or publication. */
export declare const MAX_AGENT_FINDINGS = 500;
export declare const MAX_AGENT_RESOLVED_FINDING_IDS = 500;
export declare const MIN_AGENT_FINDING_CONFIDENCE = 0.7;
export declare function normalizeBugbotResponse(response: unknown): {
    findings: BugbotFinding[];
    resolvedFindingIds: Set<string>;
    resolvedFindingResolutions: ReadonlyMap<string, BugbotFindingResolution>;
} | undefined;
export declare function prepareFindings(findings: BugbotFinding[], ignorePatterns: string[], minSeverityValue: string | undefined, maxComments: number): ApplyLimitResult & {
    activeFindings: readonly BugbotFinding[];
};
