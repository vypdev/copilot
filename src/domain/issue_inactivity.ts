/** Default inactivity window used by the scheduled issue-maintenance action. */
export const DEFAULT_INACTIVITY_THRESHOLD_HOURS = 168;

/** Maximum supported window (one year) for a finite, operationally useful value. */
export const MAX_INACTIVITY_THRESHOLD_HOURS = 8_760;

export interface IssueActivitySnapshot {
    readonly number: number;
    readonly updatedAt?: string;
    readonly isPullRequest: boolean;
    readonly labels: readonly string[];
}

export type IssueInactivityDecision =
    | { readonly kind: 'close'; readonly inactiveForMilliseconds: number }
    | {
        readonly kind: 'skip';
        readonly reason:
            | 'pull-request'
            | 'not-waiting'
            | 'agent-processing'
            | 'missing-activity-timestamp'
            | 'future-activity'
            | 'recent-activity'
            | 'invalid-threshold';
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
export function evaluateIssueInactivity(
    input: IssueInactivityEvaluationInput,
): IssueInactivityDecision {
    if (input.issue.isPullRequest) return { kind: 'skip', reason: 'pull-request' };
    if (!hasLabel(input.issue.labels, input.waitingLabels)) {
        return { kind: 'skip', reason: 'not-waiting' };
    }
    if (hasLabel(input.issue.labels, [input.agentActivityLabel])) {
        return { kind: 'skip', reason: 'agent-processing' };
    }
    if (!Number.isFinite(input.thresholdHours)
        || input.thresholdHours <= 0
        || input.thresholdHours > MAX_INACTIVITY_THRESHOLD_HOURS) {
        return { kind: 'skip', reason: 'invalid-threshold' };
    }

    const updatedAtMilliseconds = Date.parse(input.issue.updatedAt ?? '');
    if (!Number.isFinite(updatedAtMilliseconds)) {
        return { kind: 'skip', reason: 'missing-activity-timestamp' };
    }
    if (!Number.isFinite(input.nowMilliseconds) || updatedAtMilliseconds > input.nowMilliseconds) {
        return { kind: 'skip', reason: 'future-activity' };
    }

    const inactiveForMilliseconds = input.nowMilliseconds - updatedAtMilliseconds;
    const thresholdMilliseconds = input.thresholdHours * 60 * 60 * 1000;
    return inactiveForMilliseconds >= thresholdMilliseconds
        ? { kind: 'close', inactiveForMilliseconds }
        : { kind: 'skip', reason: 'recent-activity' };
}

function hasLabel(labels: readonly string[], candidates: readonly string[]): boolean {
    const normalizedLabels = new Set(labels.map(normalize));
    return candidates.some(candidate => {
        const normalizedCandidate = normalize(candidate);
        return normalizedCandidate.length > 0 && normalizedLabels.has(normalizedCandidate);
    });
}

function normalize(value: string): string {
    return value.trim().toLowerCase();
}
