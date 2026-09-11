export declare const BUGBOT_FINDING_STATES: readonly ["open", "reopened", "fixed", "obsolete", "dismissed", "verification-required", "unknown"];
export type BugbotFindingState = typeof BUGBOT_FINDING_STATES[number];
export type BugbotResolvedFindingState = 'fixed' | 'obsolete' | 'dismissed';
export interface BugbotThreadFact {
    readonly resolved: boolean;
    readonly resolvedByLogin?: string;
}
export interface BugbotFindingEvidence {
    readonly markerResolved: boolean;
    readonly markerResolution?: BugbotResolvedFindingState;
    readonly thread?: BugbotThreadFact;
    readonly botLogin?: string;
    readonly wasResolvedBeforeCurrentAnalysis?: boolean;
    readonly currentAnalysisReportsFinding?: boolean;
    readonly trusted?: boolean;
    readonly malformed?: boolean;
}
/**
 * Resolves one provider-neutral Bugbot lifecycle state from durable marker and
 * native thread facts. The model is intentionally fail-closed: disagreement
 * never projects a clean PR unless a human dismissal can be attributed.
 */
export declare function classifyBugbotFindingState(evidence: BugbotFindingEvidence): BugbotFindingState;
export declare function isBugbotActionableState(state: BugbotFindingState): boolean;
export declare function isBugbotCleanState(state: BugbotFindingState): boolean;
export declare function isHumanResolver(resolverLogin: string | undefined, botLogin: string | undefined): boolean;
export type BugbotFindingStateCounts = Record<BugbotFindingState, number>;
export declare function countBugbotFindingStates(states: Iterable<BugbotFindingState>): BugbotFindingStateCounts;
export declare function countActionableBugbotFindings(counts: Readonly<BugbotFindingStateCounts>): number;
