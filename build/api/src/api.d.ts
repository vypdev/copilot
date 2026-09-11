import type { Execution } from './data/model/execution';
import type { FindingsQueryPort } from './application/ports/agent_findings_ports';
import type { BugbotContextPorts } from './application/ports/bugbot_context_ports';
import type { BugbotFindingPublicationPorts } from './application/ports/bugbot_finding_publication_ports';
import type { BugbotFindingResolutionPorts } from './application/ports/bugbot_finding_resolution_ports';
import type { BugbotTelemetryPort } from './application/ports/bugbot_telemetry_ports';
import type { BugbotReviewCommandOverrides } from './domain/bugbot/review_command';
export interface BugbotScmGateway {
    readonly context: BugbotContextPorts;
    readonly publication: BugbotFindingPublicationPorts;
    readonly resolution: BugbotFindingResolutionPorts;
    readonly telemetry?: BugbotTelemetryPort;
}
/** Provider-neutral programmatic entry point. Consumers supply agent and SCM adapters. */
export declare class BugbotReviewService {
    private readonly useCase;
    constructor(agent: FindingsQueryPort, scm: BugbotScmGateway);
    review(execution: Execution, options?: BugbotReviewCommandOverrides): Promise<import("./data/model/result").Result[]>;
}
export { evaluateBugbotFindings, evaluateBugbotQualityGate } from './tooling/bugbot_quality_eval';
export { evaluateBugbotBenchmark, loadBugbotBenchmark, loadBugbotPredictions } from './tooling/bugbot_benchmark';
export { buildBugbotAnalytics, parseBugbotTelemetry } from './tooling/bugbot_analytics';
export { buildSemanticFindingFingerprint, buildFindingFingerprint } from './domain/bugbot/finding_identity';
export { normalizeBugbotReviewConfiguration, resolveBugbotReviewEffort } from './domain/bugbot/review_configuration';
export { BUGBOT_FINDING_STATES, classifyBugbotFindingState, countActionableBugbotFindings, countBugbotFindingStates, isBugbotActionableState, isBugbotCleanState, } from './domain/bugbot/review_state';
export { buildBugbotReviewProjection } from './domain/bugbot/review_projection';
export { Execution } from './data/model/execution';
export { Ai } from './data/model/ai';
export type { FindingsQueryPort } from './application/ports/agent_findings_ports';
export type { BugbotContextPorts } from './application/ports/bugbot_context_ports';
export type { BugbotFindingPublicationPorts } from './application/ports/bugbot_finding_publication_ports';
export type { BugbotFindingResolutionPorts } from './application/ports/bugbot_finding_resolution_ports';
export type { BugbotTelemetryPort } from './application/ports/bugbot_telemetry_ports';
export type { BugbotReviewNavigation, BugbotReviewNavigationPort, } from './application/ports/bugbot_review_navigation_ports';
export type { Result } from './data/model/result';
export type { BugbotFinding } from './domain/bugbot/finding';
export type { BugbotReviewConfiguration } from './domain/bugbot/review_configuration';
export type { BugbotReviewTelemetrySnapshot } from './application/ports/bugbot_telemetry_ports';
export type { BugbotFindingState, BugbotFindingStateCounts, BugbotFindingEvidence, BugbotResolvedFindingState, } from './domain/bugbot/review_state';
export type { BugbotProjectedFinding, BugbotProjectionOutcome, BugbotReviewProjection, } from './domain/bugbot/review_projection';
export type { PullRequestReviewReference, PullRequestReviewSummary, PullRequestReviewSummaryQueryPort, PullRequestReviewSummaryUpdatePort, } from './application/ports/pull_request_review_comment_ports';
