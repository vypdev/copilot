import type { BugbotReviewOutcome, BugbotReviewTelemetrySnapshot } from '../../../../ports/bugbot_telemetry_ports';
import type { Execution } from '../../../../../data/model/execution';
import type { BugbotContext } from './types';
import type { PreparedBugbotFindings } from './prepare_bugbot_findings';
import { projectBugbotFindingStatuses } from '../../../../policies/bugbot_finding_status_policy';
import type { BugbotReviewProjection } from '../../../../../domain/bugbot/review_projection';

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
    private context?: BugbotContext;
    private prepared?: PreparedBugbotFindings;
    private projection?: BugbotReviewProjection;

    constructor(
        private readonly execution: Execution,
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

    observeContext(context: BugbotContext, prompt: string): void {
        this.context = context;
        this.promptCharacters = prompt.length;
    }

    observeResponse(response: unknown): void {
        this.responseCharacters = safeSerializedLength(response);
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
        const headSha = this.context?.prContext?.prHeadSha;
        const canonicalPullRequestNumber = this.context?.canonicalPullRequest?.number;
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
        const providerSources = (this.context?.coverage.sources ?? []).filter((source) =>
            source.pagesFetched > 0 && [
                'selection',
                'issue-comments',
                'pull-request-comments',
                'review-threads',
                'diff',
            ].includes(source.source));
        const selectionCandidates = this.context?.coverage.sources
            .find((source) => source.source === 'selection')?.itemsFetched;
        const repositoryId = this.execution.inputs?.repository?.id;
        const startedAtEpoch = Date.parse(this.startedAt);
        const reviewId = [
            this.execution.owner || 'unknown',
            this.execution.repo || 'unknown',
            canonicalPullRequestNumber !== undefined
                ? `pr-${canonicalPullRequestNumber}`
                : this.execution.pullRequest?.number > 0
                    ? `pr-${this.execution.pullRequest.number}`
                    : 'branch',
            headSha?.slice(0, 12) || String(Number.isFinite(startedAtEpoch) ? startedAtEpoch : this.startedAtMs),
        ].join(':');
        const agent = this.execution.ai.getAgentConfiguration(this.execution.isPullRequest ? 'reviewer' : 'findings');
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
            repository: `${this.execution.owner}/${this.execution.repo}`,
            ...(Number.isSafeInteger(repositoryId) && Number(repositoryId) > 0
                ? { repositoryId: Number(repositoryId) }
                : {}),
            triggerKind: sanitizeMetricName(this.execution.eventName || 'unknown'),
            ...(canonicalPullRequestNumber !== undefined
                ? { pullRequestNumber: canonicalPullRequestNumber }
                : this.execution.pullRequest?.number > 0
                    ? { pullRequestNumber: this.execution.pullRequest.number }
                    : {}),
            ...(headSha ? { headSha } : {}),
            publicationMode: this.execution.ai.getBugbotReviewConfiguration().publicationMode,
            configuredEffort: this.execution.ai.getBugbotReviewConfiguration().effort,
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
            ...(this.context ? {
                contextSelectionReason: this.context.selectionReason,
                ...(selectionCandidates !== undefined ? {
                    contextCandidateBucket: selectionCandidates >= 2 ? '2+' as const : String(selectionCandidates) as '0' | '1',
                } : {}),
                contextCoverageStatus: this.context.coverage.status,
                contextCoverage,
            } : {}),
            contextLogicalProviderReads: providerSources.length,
            contextRawProviderRequests: providerSources.reduce((sum, source) => sum + source.pagesFetched, 0),
            contextConcurrencyLimit: 2,
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
