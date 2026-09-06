/** Default inactivity window used by the scheduled issue-maintenance action. */
export declare const DEFAULT_INACTIVITY_THRESHOLD_HOURS = 168;
/** Maximum supported window (one year) for a finite, operationally useful value. */
export declare const MAX_INACTIVITY_THRESHOLD_HOURS = 8760;
export interface IssueActivitySnapshot {
    readonly number: number;
    readonly updatedAt?: string;
    readonly isPullRequest: boolean;
    readonly labels: readonly string[];
}
export type IssueInactivityDecision = {
    readonly kind: 'close';
    readonly inactiveForMilliseconds: number;
} | {
    readonly kind: 'skip';
    readonly reason: 'pull-request' | 'not-waiting' | 'agent-processing' | 'missing-activity-timestamp' | 'future-activity' | 'recent-activity' | 'invalid-threshold';
};
export interface IssueInactivityEvaluationInput {
    readonly issue: IssueActivitySnapshot;
    readonly waitingLabels: readonly string[];
    readonly agentActivityLabel: string;
    readonly thresholdHours: number;
    readonly nowMilliseconds: number;
}
/**
 * Decides whether an issue can be closed without depending on GitHub or time
 * APIs. GitHub's `updated_at` is treated as the last activity observed by the
 * provider; this includes comments and issue metadata changes.
 */
export declare function evaluateIssueInactivity(input: IssueInactivityEvaluationInput): IssueInactivityDecision;
