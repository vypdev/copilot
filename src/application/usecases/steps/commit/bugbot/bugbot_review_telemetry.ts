import type { BugbotReviewOutcome, BugbotReviewTelemetrySnapshot } from '../../../../ports/bugbot_telemetry_ports';
import type { BugbotContext } from './types';
import type { PreparedBugbotFindings } from './prepare_bugbot_findings';
import { projectBugbotFindingStatuses } from '../../../../policies/bugbot_finding_status_policy';
import type { BugbotReviewProjection } from '../../../../../domain/bugbot/review_projection';
import type { BugbotReviewOperationContext } from './bugbot_review_operation_context';
import type { BugbotContextPreflight } from './load_bugbot_context_use_case';

export interface BugbotReviewTelemetryClock {
    now(): number;
    isoNow(): string;
}

const systemClock: BugbotReviewTelemetryClock = {
    now: () => Date.now(),
    isoNow: () => new Date().toISOString(),
};

export class BugbotReviewTelemetry {
    private readonly startedAtMs: number;
    private readonly startedAt: string;
    private readonly stages: Record<string, number> = {};
    private promptCharacters = 0;
    private responseCharacters = 0;
    private preflight?: BugbotContextPreflight;
    private context?: BugbotContext;
    private prepared?: PreparedBugbotFindings;
    private projection?: BugbotReviewProjection;
    private analysisPartitions = 0;
    private completedAnalysisPartitions = 0;
    private analysisDiffFragments = 0;
    private analysisAssignedFiles = 0;
    private activeAnalysisPartitions = 0;
    private maximumAnalysisConcurrency = 0;
    private failedAnalysisPartitionOrdinal?: number;
    private failedAnalysisPartitionCategory?: string;

    constructor(
        private readonly execution: BugbotReviewOperationContext,
        private readonly clock: BugbotReviewTelemetryClock = systemClock,
    ) {
        this.startedAtMs = clock.now();
        this.startedAt = clock.isoNow();
    }

    async measure<T>(stage: string, action: () => Promise<T> | T): Promise<T> {
        const startedAt = this.clock.now();
        try {
            return await action();
        } finally {
            this.stages[sanitizeMetricName(stage)] = Math.max(0, this.clock.now() - startedAt);
        }
    }

    observePreflight(preflight: BugbotContextPreflight): void {
        this.preflight = preflight;
    }

    observeContext(context: BugbotContext, prompt?: string): void {
        this.context = context;
        if (prompt) this.observePrompt(prompt);
    }

    observePrompt(prompt: string): void {
        this.promptCharacters += prompt.length;
    }

    observeResponse(response: unknown): void {
        this.responseCharacters += safeSerializedLength(response);
    }

    observePartitionPlan(partitions: number, fragments: number, files: number): void {
        this.analysisPartitions = partitions;
        this.analysisDiffFragments = fragments;
        this.analysisAssignedFiles = files;
    }

    beginPartition(): void {
        this.activeAnalysisPartitions += 1;
        this.maximumAnalysisConcurrency = Math.max(
            this.maximumAnalysisConcurrency,
            this.activeAnalysisPartitions,
        );
    }

    endPartition(
        completed: boolean,
        failure?: { readonly ordinal: number; readonly category: string },
    ): void {
        this.activeAnalysisPartitions = Math.max(0, this.activeAnalysisPartitions - 1);
        if (completed) this.completedAnalysisPartitions += 1;
        if (failure && (this.failedAnalysisPartitionOrdinal === undefined
            || failure.ordinal < this.failedAnalysisPartitionOrdinal)) {
            this.failedAnalysisPartitionOrdinal = failure.ordinal;
            this.failedAnalysisPartitionCategory = sanitizeMetricName(failure.category);
        }
    }

    observePrepared(prepared: PreparedBugbotFindings): void {
        this.prepared = prepared;
    }

    /** Uses the final provider-verified projection for every downstream metric. */
    observeProjection(projection: BugbotReviewProjection): void {
        this.projection = projection;
    }

    snapshot(outcome: BugbotReviewOutcome, errorCategory?: string): BugbotReviewTelemetrySnapshot {
        const changes = this.context?.prContext?.changes ?? [];
        const canonicalPullRequest = this.context?.canonicalPullRequest
            ?? this.preflight?.canonicalPullRequest;
        const headSha = this.context?.prContext?.prHeadSha
            ?? canonicalPullRequest?.headSha;
        const canonicalPullRequestNumber = canonicalPullRequest?.number;
        const contextCoverage = Object.fromEntries(
            (this.context?.coverage.sources ?? [])
                .map((source) => [source.source, {
                    status: source.status,
                    pagesFetched: source.pagesFetched,
                    itemsFetched: source.itemsFetched,
                    itemsRetained: source.itemsRetained,
                    omittedItems: source.omittedItems,
                    truncatedItems: source.truncatedItems,
                    limitReached: source.limitReached,
                    ...(source.providerLimitReached ? { providerLimitReached: true } : {}),
                }]),
        );
        const observedSources = this.context?.coverage.sources
            ?? (this.preflight ? [this.preflight.selectionCoverage] : []);
        const providerSources = observedSources.filter((source) =>
            source.pagesFetched > 0 && [
                'selection',
                'issue-comments',
                'pull-request-comments',
                'review-threads',
                'diff',
            ].includes(source.source));
        const selectionCandidates = observedSources
            .find((source) => source.source === 'selection')?.itemsFetched;
        const contextSelectionReason = this.context?.selectionReason
            ?? this.preflight?.selectionReason;
        const repositoryId = this.execution.repository.id;
        const startedAtEpoch = Date.parse(this.startedAt);
        const reviewId = [
            this.execution.repository.owner || 'unknown',
            this.execution.repository.name || 'unknown',
            canonicalPullRequestNumber !== undefined
                ? `pr-${canonicalPullRequestNumber}`
                : this.execution.target.pullRequestNumber > 0
                    ? `pr-${this.execution.target.pullRequestNumber}`
                    : 'branch',
            headSha?.slice(0, 12) || String(Number.isFinite(startedAtEpoch) ? startedAtEpoch : this.startedAtMs),
        ].join(':');
        const agent = this.execution.analysis.agentConfiguration;
        const findingStates = this.projection?.counts ?? (this.context && this.prepared
            ? projectBugbotFindingStatuses(
                this.context.existingByFindingId,
                this.prepared.activeFindings ?? this.prepared.toPublish,
                this.prepared.resolvedFindingIds,
                this.prepared.resolvedFindingResolutions,
            ).counts
            : undefined);
        return {
            schemaVersion: 1,
            reviewId,
            repository: `${this.execution.repository.owner}/${this.execution.repository.name}`,
            ...(Number.isSafeInteger(repositoryId) && Number(repositoryId) > 0
                ? { repositoryId: Number(repositoryId) }
                : {}),
            triggerKind: sanitizeMetricName(this.execution.trigger.kind),
            ...(canonicalPullRequestNumber !== undefined
                ? { pullRequestNumber: canonicalPullRequestNumber }
                : this.execution.target.pullRequestNumber > 0
                    ? { pullRequestNumber: this.execution.target.pullRequestNumber }
                    : {}),
            ...(headSha ? { headSha } : {}),
            publicationMode: this.execution.analysis.reviewConfiguration.publicationMode,
            configuredEffort: this.execution.analysis.reviewConfiguration.effort,
            ...(agent?.provider ? { agentProvider: agent.provider } : {}),
            ...(agent?.model ? { agentModel: agent.model } : {}),
            startedAt: this.startedAt,
            elapsedMs: Math.max(0, this.clock.now() - this.startedAtMs),
            stagesMs: { ...this.stages },
            promptCharacters: this.promptCharacters,
            responseCharacters: this.responseCharacters,
            estimatedInputTokens: estimateTokens(this.promptCharacters),
            estimatedOutputTokens: estimateTokens(this.responseCharacters),
            changedFiles: changes.length,
            changedLines: changes.reduce((sum, change) => sum + change.additions + change.deletions, 0),
            rulesLoaded: this.context?.reviewRuleSources?.length ?? 0,
            ...(contextSelectionReason ? {
                contextSelectionReason,
                ...(selectionCandidates !== undefined ? {
                    contextCandidateBucket: selectionCandidates >= 2 ? '2+' as const : String(selectionCandidates) as '0' | '1',
                } : {}),
            } : {}),
            ...(this.context ? {
                contextCoverageStatus: this.context.coverage.status,
                contextCoverage,
            } : {}),
            contextLogicalProviderReads: providerSources.length,
            contextRawProviderRequests: providerSources.reduce((sum, source) => sum + source.pagesFetched, 0),
            contextConcurrencyLimit: 2,
            ...(this.analysisPartitions > 0 ? {
                analysisPartitions: this.analysisPartitions,
                completedAnalysisPartitions: this.completedAnalysisPartitions,
                analysisDiffFragments: this.analysisDiffFragments,
                analysisAssignedFiles: this.analysisAssignedFiles,
                maximumAnalysisConcurrency: this.maximumAnalysisConcurrency,
                ...(this.failedAnalysisPartitionOrdinal !== undefined ? {
                    failedAnalysisPartitionOrdinal: this.failedAnalysisPartitionOrdinal,
                    failedAnalysisPartitionCategory: this.failedAnalysisPartitionCategory,
                } : {}),
            } : {}),
            candidateFindings: this.prepared?.activeFindings?.length ?? 0,
            publishedFindings: outcome === 'completed' || outcome === 'partial'
                ? this.prepared?.toPublish.length ?? 0
                : 0,
            overflowFindings: this.prepared?.overflowCount ?? 0,
            resolvedFindings: this.prepared?.resolvedFindingIds.size ?? 0,
            ...(findingStates ? { findingStates } : {}),
            outcome,
            ...(errorCategory ? { errorCategory: sanitizeMetricName(errorCategory) } : {}),
        };
    }
}

function estimateTokens(characters: number): number {
    return Math.ceil(Math.max(0, characters) / 4);
}

function safeSerializedLength(value: unknown): number {
    try {
        return JSON.stringify(value)?.length ?? 0;
    } catch {
        return 0;
    }
}

function sanitizeMetricName(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '_').slice(0, 80) || 'unknown';
}
