import {
    DISABLED_PULL_REQUEST_APPROVAL_POLICY,
    parsePullRequestApprovalPolicy,
    type PullRequestApprovalPolicy,
} from './pull_request_approval_policy';

// Domain contracts and trusted policy parsing are implemented here. Application
// orchestration, adapters, command routing, rendering, and reply publication remain pending.

/** The fixed, ordered evidence groups in the GitHub runtime doctor contract. */
export const GITHUB_RUNTIME_DOCTOR_GROUPS = [
    'effective-configuration',
    'issue-readiness',
    'linked-branch-readiness',
    'workflow-contracts',
    'approval-policy',
    'approval-prerequisites',
    'pull-request-identity',
] as const;

export type GithubRuntimeDoctorGroup = typeof GITHUB_RUNTIME_DOCTOR_GROUPS[number];
export type GithubRuntimeDoctorCheckState = 'pass' | 'warning' | 'blocked' | 'unavailable' | 'not-applicable';
export type GithubRuntimeDoctorSeverity = 'blocked' | 'unavailable' | 'warning' | 'pass' | 'not-applicable';
export type GithubRuntimeDoctorTarget =
    | { readonly kind: 'issue'; readonly repositoryId: number; readonly issueNumber: number }
    | { readonly kind: 'pull-request'; readonly repositoryId: number; readonly pullNumber: number };

/** A domain result never includes provider diagnostics, credentials, or raw response DTOs. */
export interface GithubRuntimeDoctorCheck {
    readonly group: GithubRuntimeDoctorGroup;
    readonly state: GithubRuntimeDoctorCheckState;
    readonly evidence?: { readonly source: string; readonly url?: string };
    readonly action?: string;
}

export interface GithubRuntimeDoctorReport {
    readonly target: GithubRuntimeDoctorTarget;
    readonly checks: readonly GithubRuntimeDoctorCheck[];
    readonly severity: GithubRuntimeDoctorSeverity;
    readonly primaryAction?: string;
}

/** Semantic input to the strict policy boundary: callers must say whether a read succeeded. */
export type TrustedApprovalPolicyRead =
    | {
        readonly status: 'available';
        /** Effective trusted source after repository-over-organization precedence. */
        readonly source: 'repository' | 'organization';
        readonly value: string;
    }
    | { readonly status: 'absent' }
    | { readonly status: 'unavailable' };

export type DoctorApprovalPolicyResult =
    | { readonly status: 'valid'; readonly source: 'repository' | 'organization' | 'default-off'; readonly policy: PullRequestApprovalPolicy }
    | { readonly status: 'invalid' }
    | { readonly status: 'unavailable' };

/**
 * Parses only a successful trusted effective read. Verified absence preserves the
 * established off default; read failure is unavailable and never consults an injected value.
 */
export function parseTrustedDoctorApprovalPolicy(read: TrustedApprovalPolicyRead): DoctorApprovalPolicyResult {
    if (read.status === 'unavailable') return { status: 'unavailable' };
    if (read.status === 'absent') {
        return { status: 'valid', source: 'default-off', policy: DISABLED_PULL_REQUEST_APPROVAL_POLICY };
    }
    try {
        return { status: 'valid', source: read.source, policy: parsePullRequestApprovalPolicy(read.value) };
    } catch {
        // Do not leak parser/provider text into a report or user-facing surface.
        return { status: 'invalid' };
    }
}
