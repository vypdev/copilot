import type { BugbotReviewOutcome, BugbotReviewTelemetrySnapshot } from '../application/ports/bugbot_telemetry_ports';
import type { BugbotFindingState } from '../domain/bugbot/review_state';

export interface BugbotAnalyticsReport {
    readonly reviews: number;
    readonly outcomes: Readonly<Record<BugbotReviewOutcome, number>>;
    /** Fraction of runs that did not fail, including intentional skips and superseded revisions. */
    readonly nonFailureRate: number;
    /** Fraction of actionable runs that completed analysis (skips and superseded revisions excluded). */
    readonly reviewCompletionRate: number;
    readonly latencyMs: { readonly p50: number; readonly p95: number; readonly maximum: number };
    readonly averageCandidateFindings: number;
    readonly averagePublishedFindings: number;
    readonly resolutionEvents: number;
    readonly findingStateObservations: Readonly<Record<BugbotFindingState, number>>;
    readonly estimatedInputTokens: number;
    readonly estimatedOutputTokens: number;
    readonly stageP95Ms: Readonly<Record<string, number>>;
}

const OUTCOMES: readonly BugbotReviewOutcome[] = ['completed', 'no-findings', 'partial', 'dry-run', 'superseded', 'skipped', 'failed'];

/** Aggregates content-free telemetry. Empty input is valid and produces a zero report. */
export function buildBugbotAnalytics(snapshots: readonly BugbotReviewTelemetrySnapshot[]): BugbotAnalyticsReport {
    const outcomes = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0])) as Record<BugbotReviewOutcome, number>;
    const stages = new Map<string, number[]>();
    for (const snapshot of snapshots) {
        outcomes[snapshot.outcome] += 1;
        for (const [stage, duration] of Object.entries(snapshot.stagesMs)) {
            const current = stages.get(stage) ?? [];
            current.push(duration);
            stages.set(stage, current);
        }
    }
    const reviews = snapshots.length;
    const nonFailures = reviews - outcomes.failed;
    const actionableReviews = reviews - outcomes.superseded - outcomes.skipped;
    const completedReviews = outcomes.completed + outcomes['no-findings'] + outcomes.partial + outcomes['dry-run'];
    return {
        reviews,
        outcomes,
        nonFailureRate: ratio(nonFailures, reviews),
        reviewCompletionRate: ratio(completedReviews, actionableReviews),
        latencyMs: distribution(snapshots.map((snapshot) => snapshot.elapsedMs)),
        averageCandidateFindings: average(snapshots.map((snapshot) => snapshot.candidateFindings)),
        averagePublishedFindings: average(snapshots.map((snapshot) => snapshot.publishedFindings)),
        resolutionEvents: snapshots.reduce((sum, snapshot) => sum + snapshot.resolvedFindings, 0),
        findingStateObservations: aggregateFindingStates(snapshots),
        estimatedInputTokens: snapshots.reduce((sum, snapshot) => sum + (snapshot.estimatedInputTokens ?? 0), 0),
        estimatedOutputTokens: snapshots.reduce((sum, snapshot) => sum + (snapshot.estimatedOutputTokens ?? 0), 0),
        stageP95Ms: Object.fromEntries([...stages].sort(([left], [right]) => left.localeCompare(right)).map(([stage, values]) => [stage, percentile(values, 0.95)])),
    };
}

function aggregateFindingStates(
    snapshots: readonly BugbotReviewTelemetrySnapshot[],
): BugbotAnalyticsReport['findingStateObservations'] {
    const totals = {
        open: 0,
        fixed: 0,
        obsolete: 0,
        dismissed: 0,
        reopened: 0,
        'verification-required': 0,
        unknown: 0,
    };
    for (const snapshot of snapshots) {
        for (const state of Object.keys(totals) as Array<keyof typeof totals>) {
            totals[state] += snapshot.findingStates?.[state] ?? 0;
        }
    }
    return totals;
}

export function parseBugbotTelemetry(input: string): BugbotReviewTelemetrySnapshot[] {
    const trimmed = input.trim();
    if (!trimmed) return [];
    try {
        const parsed = JSON.parse(trimmed) as unknown;
        return normalizeSnapshots(parsed);
    } catch {
        return trimmed.split(/\r?\n/u).flatMap((line) => {
            const candidate = line.includes('[bugbot.telemetry]') ? line.split('[bugbot.telemetry]').at(-1)?.trim() ?? '' : line.trim();
            if (!candidate) return [];
            try { return normalizeSnapshots(JSON.parse(candidate)); } catch { return []; }
        });
    }
}

function normalizeSnapshots(value: unknown): BugbotReviewTelemetrySnapshot[] {
    const values = Array.isArray(value) ? value : [value];
    return values.flatMap((entry): BugbotReviewTelemetrySnapshot[] => {
        if (!entry || typeof entry !== 'object') return [];
        const snapshot = entry as Partial<BugbotReviewTelemetrySnapshot>;
        if (snapshot.schemaVersion !== 1 || typeof snapshot.reviewId !== 'string'
            || !isNonNegativeFinite(snapshot.elapsedMs)
            || !OUTCOMES.includes(snapshot.outcome as BugbotReviewOutcome)) return [];
        const numeric = (value: unknown): number => isNonNegativeFinite(value) ? value : 0;
        const stages = snapshot.stagesMs && typeof snapshot.stagesMs === 'object'
            ? Object.fromEntries(Object.entries(snapshot.stagesMs)
                .filter(([stage, duration]) => Boolean(stage.trim()) && isNonNegativeFinite(duration)))
            : {};
        const findingStates = snapshot.findingStates && typeof snapshot.findingStates === 'object'
            ? Object.fromEntries(Object.entries(snapshot.findingStates)
                .filter(([, count]) => isNonNegativeFinite(count))) as BugbotReviewTelemetrySnapshot['findingStates']
            : undefined;
        const contextCoverage = normalizeContextCoverage(snapshot.contextCoverage);
        return [{
            schemaVersion: 1,
            reviewId: snapshot.reviewId.slice(0, 500),
            repository: typeof snapshot.repository === 'string' ? snapshot.repository.slice(0, 500) : 'unknown/unknown',
            ...(isNonNegativeFinite(snapshot.repositoryId) && snapshot.repositoryId > 0
                ? { repositoryId: snapshot.repositoryId }
                : {}),
            triggerKind: typeof snapshot.triggerKind === 'string' && snapshot.triggerKind.trim()
                ? snapshot.triggerKind.slice(0, 80)
                : 'unknown',
            ...(isNonNegativeFinite(snapshot.pullRequestNumber) ? { pullRequestNumber: snapshot.pullRequestNumber } : {}),
            ...(typeof snapshot.headSha === 'string' ? { headSha: snapshot.headSha.slice(0, 64) } : {}),
            publicationMode: snapshot.publicationMode === 'dry-run' ? 'dry-run' : 'publish',
            configuredEffort: typeof snapshot.configuredEffort === 'string' ? snapshot.configuredEffort.slice(0, 80) : 'default',
            ...(typeof snapshot.agentProvider === 'string' ? { agentProvider: snapshot.agentProvider.slice(0, 80) } : {}),
            ...(typeof snapshot.agentModel === 'string' ? { agentModel: snapshot.agentModel.slice(0, 200) } : {}),
            startedAt: typeof snapshot.startedAt === 'string' ? snapshot.startedAt.slice(0, 100) : '',
            elapsedMs: snapshot.elapsedMs,
            stagesMs: stages,
            promptCharacters: numeric(snapshot.promptCharacters),
            responseCharacters: numeric(snapshot.responseCharacters),
            estimatedInputTokens: numeric(snapshot.estimatedInputTokens),
            estimatedOutputTokens: numeric(snapshot.estimatedOutputTokens),
            changedFiles: numeric(snapshot.changedFiles),
            changedLines: numeric(snapshot.changedLines),
            rulesLoaded: numeric(snapshot.rulesLoaded),
            ...(snapshot.contextSelectionReason === 'event'
                || snapshot.contextSelectionReason === 'exact-head'
                || snapshot.contextSelectionReason === 'none'
                ? { contextSelectionReason: snapshot.contextSelectionReason }
                : {}),
            ...(snapshot.contextCandidateBucket === '0'
                || snapshot.contextCandidateBucket === '1'
                || snapshot.contextCandidateBucket === '2+'
                ? { contextCandidateBucket: snapshot.contextCandidateBucket }
                : {}),
            ...(snapshot.contextCoverageStatus === 'complete' || snapshot.contextCoverageStatus === 'partial'
                ? { contextCoverageStatus: snapshot.contextCoverageStatus }
                : {}),
            ...(contextCoverage ? { contextCoverage } : {}),
            contextLogicalProviderReads: numeric(snapshot.contextLogicalProviderReads),
            contextRawProviderRequests: numeric(snapshot.contextRawProviderRequests),
            contextConcurrencyLimit: 2,
            candidateFindings: numeric(snapshot.candidateFindings),
            publishedFindings: numeric(snapshot.publishedFindings),
            overflowFindings: numeric(snapshot.overflowFindings),
            resolvedFindings: numeric(snapshot.resolvedFindings),
            ...(findingStates ? { findingStates } : {}),
            outcome: snapshot.outcome as BugbotReviewOutcome,
            ...(typeof snapshot.errorCategory === 'string' ? { errorCategory: snapshot.errorCategory.slice(0, 80) } : {}),
        }];
    });
}

function normalizeContextCoverage(
    value: BugbotReviewTelemetrySnapshot['contextCoverage'] | undefined,
): BugbotReviewTelemetrySnapshot['contextCoverage'] | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const entries = Object.entries(value).slice(0, 20).flatMap(([source, candidate]) => {
        if (!source.trim() || !candidate || typeof candidate !== 'object') return [];
        if (candidate.status !== 'complete' && candidate.status !== 'partial') return [];
        const numericValues = [
            candidate.pagesFetched,
            candidate.itemsFetched,
            candidate.itemsRetained,
            candidate.omittedItems,
            candidate.truncatedItems,
        ];
        if (!numericValues.every(isNonNegativeFinite) || typeof candidate.limitReached !== 'boolean') return [];
        return [[source.slice(0, 80), {
            status: candidate.status,
            pagesFetched: candidate.pagesFetched,
            itemsFetched: candidate.itemsFetched,
            itemsRetained: candidate.itemsRetained,
            omittedItems: candidate.omittedItems,
            truncatedItems: candidate.truncatedItems,
            limitReached: candidate.limitReached,
            ...(candidate.providerLimitReached === true ? { providerLimitReached: true } : {}),
        }] as const];
    });
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function isNonNegativeFinite(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function average(values: readonly number[]): number {
    return values.length === 0 ? 0 : round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function distribution(values: readonly number[]): BugbotAnalyticsReport['latencyMs'] {
    return { p50: percentile(values, 0.5), p95: percentile(values, 0.95), maximum: values.length === 0 ? 0 : Math.max(...values) };
}

function percentile(values: readonly number[], quantile: number): number {
    if (values.length === 0) return 0;
    const ordered = [...values].sort((left, right) => left - right);
    return ordered[Math.max(0, Math.ceil(ordered.length * quantile) - 1)];
}

function ratio(numerator: number, denominator: number): number {
    return denominator === 0 ? 0 : round(numerator / denominator);
}

function round(value: number): number {
    return Math.round(value * 10_000) / 10_000;
}
