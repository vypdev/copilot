import type { Result } from './data/model/result';
import type { AgentConfiguration } from './domain/agent';
import type { FindingsQueryPort } from './application/ports/agent_findings_ports';
import type { BugbotScmPorts } from './application/ports/bugbot_scm_ports';
import type { BugbotTelemetryPort } from './application/ports/bugbot_telemetry_ports';
import type { BugbotReviewConfiguration } from './domain/bugbot/review_configuration';
/** Already-bound SCM authority for exactly one repository. */
export interface BugbotScmGateway extends BugbotScmPorts {
    readonly repository: {
        readonly owner: string;
        readonly name: string;
    };
    readonly telemetry?: BugbotTelemetryPort;
}
export type BugbotMinimumSeverity = 'info' | 'low' | 'medium' | 'high';
export type BugbotReviewTarget = {
    readonly kind: 'pull-request';
    readonly number: number;
    readonly head: string;
    readonly base?: string;
    readonly linkedIssueNumber?: number;
    readonly action?: 'opened' | 'reopened' | 'synchronize';
    readonly expectedHeadSha?: string;
    readonly before?: string;
    readonly draft?: boolean;
} | {
    readonly kind: 'branch';
    readonly branch: string;
    readonly base?: string;
    readonly issueNumber?: number;
    readonly before?: string;
    readonly after?: string;
};
/** Sole supported request for the programmatic Bugbot review entry point. */
export interface BugbotReviewRequest {
    readonly target: BugbotReviewTarget;
    readonly agent: AgentConfiguration;
    readonly configuration?: Partial<BugbotReviewConfiguration>;
    readonly ignoreFiles?: readonly string[];
    readonly minimumSeverity?: BugbotMinimumSeverity;
    readonly commentLimit?: number;
    readonly authenticatedUser?: string;
    readonly locale?: {
        readonly pullRequest?: string;
    };
}
/** Provider-neutral programmatic entry point. Consumers supply agent and SCM adapters. */
export declare class BugbotReviewService {
    private readonly useCase;
    private readonly repository;
    constructor(agent: FindingsQueryPort, scm: BugbotScmGateway);
    review(request: BugbotReviewRequest): Promise<readonly Result[]>;
}
export { evaluateBugbotFindings, evaluateBugbotQualityGate } from './tooling/bugbot_quality_eval';
export { evaluateBugbotBenchmark, loadBugbotBenchmark, loadBugbotPredictions } from './tooling/bugbot_benchmark';
export { buildBugbotAnalytics, parseBugbotTelemetry } from './tooling/bugbot_analytics';
export { buildSemanticFindingFingerprint, buildFindingFingerprint } from './domain/bugbot/finding_identity';
export { normalizeBugbotReviewConfiguration, resolveBugbotReviewEffort } from './domain/bugbot/review_configuration';
export { BUGBOT_FINDING_STATES, classifyBugbotFindingState, countActionableBugbotFindings, countBugbotFindingStates, isBugbotActionableState, isBugbotCleanState, } from './domain/bugbot/review_state';
export { buildBugbotReviewProjection } from './domain/bugbot/review_projection';
export { ApplicationError } from './application/errors/application_error';
export type { ApplicationErrorCode, ApplicationErrorKind, ApplicationErrorPublicRecord, } from './application/errors/application_error';
export type { AgentConfiguration } from './domain/agent';
export type { FindingsQueryPort } from './application/ports/agent_findings_ports';
export type { BugbotContextPorts } from './application/ports/bugbot_context_ports';
export type { BugbotFindingPublicationPorts } from './application/ports/bugbot_finding_publication_ports';
export type { BugbotFindingResolutionPorts } from './application/ports/bugbot_finding_resolution_ports';
export type { BugbotScmPorts } from './application/ports/bugbot_scm_ports';
export type { BugbotPresentationMutationPorts, BugbotReconciliationSnapshotPorts, } from './application/ports/bugbot_reconciliation_ports';
export type { BugbotTelemetryPort } from './application/ports/bugbot_telemetry_ports';
export type { BugbotReviewNavigation } from './application/ports/bugbot_review_navigation_ports';
export type { Result } from './data/model/result';
export type { BugbotFinding } from './domain/bugbot/finding';
export type { BugbotReviewConfiguration } from './domain/bugbot/review_configuration';
export type { BugbotReviewTelemetrySnapshot } from './application/ports/bugbot_telemetry_ports';
export type { BugbotFindingState, BugbotFindingStateCounts, BugbotFindingEvidence, BugbotResolvedFindingState, } from './domain/bugbot/review_state';
export type { BugbotProjectedFinding, BugbotProjectionOutcome, BugbotReviewProjection, } from './domain/bugbot/review_projection';
export type { PullRequestReviewReference, PullRequestReviewSummary, } from './application/ports/pull_request_review_comment_ports';
