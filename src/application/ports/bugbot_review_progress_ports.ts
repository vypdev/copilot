import type { BugbotReviewOutcome } from './bugbot_telemetry_ports';

export interface BugbotWorkCount {
    readonly completed: number;
    readonly total: number;
}

export interface BugbotReviewProgressObservation {
    readonly stage: 'preparing' | 'analyzing' | 'verifying' | 'publishing' | 'finished';
    readonly headSha: string;
    readonly baseSha?: string;
    readonly baseRefSha?: string;
    readonly pullNumber: number;
    readonly elapsedMs: number;
    readonly observedAt: string;
    readonly sequence: number;
    readonly partitions?: BugbotWorkCount;
    readonly frames?: { readonly ordinal: number; readonly total: number };
    readonly candidates?: BugbotWorkCount;
    readonly retries?: number;
    readonly stageTimesMs?: Readonly<Partial<Record<'preparing' | 'analyzing' | 'verifying' | 'publishing', number>>>;
    readonly failureCode?: string;
    readonly outcome?: BugbotReviewOutcome;
}

/** Attempt-scoped optional presentation. Finding and approval writes are separate ports. */
export interface BugbotReviewProgressPort {
    observe(progress: BugbotReviewProgressObservation, dryRun: boolean, locale: string): Promise<void>;
}
