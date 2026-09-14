import type { Result } from '../../../data/model/result';
import type { CopilotLifecycleLabels } from '../../../domain/copilot_lifecycle';
import type { LifecycleExternalEvidenceSource } from '../../policies/lifecycle_state_policy';

export type LifecycleSynchronizationTarget =
    | {
        readonly kind: 'issue';
        readonly number: number;
        readonly labels: readonly string[];
        readonly opened: boolean;
        readonly descriptionEdited: boolean;
    }
    | {
        readonly kind: 'pull-request';
        readonly number: number;
        readonly labels: readonly string[];
        readonly merged: boolean;
        readonly closed: boolean;
    };

export interface LifecycleSynchronizationContext {
    readonly eventName: string;
    readonly action: string;
    readonly target?: LifecycleSynchronizationTarget;
    readonly lifecycleLabels: Readonly<CopilotLifecycleLabels>;
    readonly evidence: LifecycleExternalEvidenceSource;
}

export interface LifecycleLabelPatch {
    readonly target: {
        readonly kind: LifecycleSynchronizationTarget['kind'];
        readonly number: number;
    };
    readonly labels: readonly string[];
}

export interface LifecycleSynchronizationOutcome {
    readonly results: readonly Result[];
    readonly labelPatch?: LifecycleLabelPatch;
}

/** Structural entrypoint source used only to copy trusted aggregate facts. */
export interface LifecycleSynchronizationContextSource {
    readonly eventName: string;
    readonly issueNumber: number;
    readonly isIssue: boolean;
    readonly isPullRequest: boolean;
    readonly inputs?: {
        readonly action?: string;
        readonly review?: { readonly state?: string; readonly commit_id?: string };
        readonly check_suite?: {
            readonly head_sha?: string;
            readonly status?: string;
            readonly conclusion?: string | null;
        };
        readonly workflow_run?: {
            readonly head_sha?: string;
            readonly status?: string;
            readonly conclusion?: string | null;
        };
    };
    readonly issue: {
        readonly number: number;
        readonly opened: boolean;
        readonly descriptionEdited: boolean;
    };
    readonly pullRequest: {
        readonly number: number;
        readonly isMerged: boolean;
        readonly isClosed: boolean;
    };
    readonly labels: {
        readonly currentIssueLabels: readonly string[];
        readonly currentPullRequestLabels: readonly string[];
        readonly lifecycle: CopilotLifecycleLabels;
    };
}

const PULL_REQUEST_LIFECYCLE_EVENTS = new Set([
    'pull_request',
    'pull_request_review',
    'pull_request_review_comment',
    'check_suite',
    'workflow_run',
]);

const ISSUE_LIFECYCLE_EVENTS = new Set(['issues', 'issue_comment', 'push']);

export function projectLifecycleSynchronizationContext(
    source: LifecycleSynchronizationContextSource,
): LifecycleSynchronizationContext {
    const target = projectTarget(source);
    return Object.freeze({
        eventName: source.eventName,
        action: source.inputs?.action ?? '',
        ...(target ? { target } : {}),
        lifecycleLabels: Object.freeze({ ...source.labels.lifecycle }),
        evidence: projectEvidence(source),
    });
}

export function lifecycleSynchronizationOutcome(
    results: readonly Result[] = [],
    labelPatch?: LifecycleLabelPatch,
): LifecycleSynchronizationOutcome {
    return Object.freeze({
        results: Object.freeze([...results]),
        ...(labelPatch ? {
            labelPatch: Object.freeze({
                target: Object.freeze({ ...labelPatch.target }),
                labels: Object.freeze([...labelPatch.labels]),
            }),
        } : {}),
    });
}

function projectTarget(source: LifecycleSynchronizationContextSource): LifecycleSynchronizationTarget | undefined {
    if ((source.isPullRequest || PULL_REQUEST_LIFECYCLE_EVENTS.has(source.eventName))
        && source.pullRequest.number > 0) {
        return Object.freeze({
            kind: 'pull-request',
            number: source.pullRequest.number,
            labels: Object.freeze([...source.labels.currentPullRequestLabels]),
            merged: source.pullRequest.isMerged,
            closed: source.pullRequest.isClosed,
        });
    }

    const issueNumber = source.issue.number > 0 ? source.issue.number : source.issueNumber;
    if ((source.isIssue || ISSUE_LIFECYCLE_EVENTS.has(source.eventName)) && issueNumber > 0) {
        return Object.freeze({
            kind: 'issue',
            number: issueNumber,
            labels: Object.freeze([...source.labels.currentIssueLabels]),
            opened: source.issue.opened,
            descriptionEdited: source.issue.descriptionEdited,
        });
    }

    return undefined;
}

function projectEvidence(source: LifecycleSynchronizationContextSource): LifecycleExternalEvidenceSource {
    if (source.eventName === 'pull_request_review') {
        return Object.freeze({
            kind: 'pull-request-review',
            headSha: source.inputs?.review?.commit_id,
            state: source.inputs?.review?.state,
        });
    }
    if (source.eventName === 'check_suite') {
        return Object.freeze({
            kind: 'check-suite',
            headSha: source.inputs?.check_suite?.head_sha,
            status: source.inputs?.check_suite?.status,
            conclusion: source.inputs?.check_suite?.conclusion,
        });
    }
    if (source.eventName === 'workflow_run') {
        return Object.freeze({
            kind: 'workflow-run',
            headSha: source.inputs?.workflow_run?.head_sha,
            status: source.inputs?.workflow_run?.status,
            conclusion: source.inputs?.workflow_run?.conclusion,
        });
    }
    return Object.freeze({ kind: 'none' });
}
