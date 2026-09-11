export type BugbotReviewOutcome = 'completed' | 'no-findings' | 'dry-run' | 'superseded' | 'skipped' | 'failed';

export interface BugbotReviewTelemetrySnapshot {
    readonly schemaVersion: 1;
    readonly reviewId: string;
    readonly repository: string;
    readonly pullRequestNumber?: number;
    readonly headSha?: string;
    readonly publicationMode: 'publish' | 'dry-run';
    readonly configuredEffort: string;
    readonly agentProvider?: string;
    readonly agentModel?: string;
    readonly startedAt: string;
    readonly elapsedMs: number;
    readonly stagesMs: Readonly<Record<string, number>>;
    readonly promptCharacters: number;
    readonly responseCharacters: number;
    readonly estimatedInputTokens: number;
    readonly estimatedOutputTokens: number;
    readonly changedFiles: number;
    readonly changedLines: number;
    readonly rulesLoaded: number;
    readonly candidateFindings: number;
    readonly publishedFindings: number;
    readonly overflowFindings: number;
    readonly resolvedFindings: number;
    readonly findingStates?: Readonly<Partial<Record<import('../../domain/bugbot/review_state').BugbotFindingState, number>>>;
    readonly outcome: BugbotReviewOutcome;
    readonly errorCategory?: string;
}

export interface BugbotTelemetryPort {
    publish(snapshot: BugbotReviewTelemetrySnapshot): Promise<void> | void;
}
