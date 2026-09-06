import type { BugbotReviewOutcome, BugbotReviewTelemetrySnapshot } from '../../../../ports/bugbot_telemetry_ports';
import type { Execution } from '../../../../../data/model/execution';
import type { BugbotContext } from './types';
import type { PreparedBugbotFindings } from './prepare_bugbot_findings';
export interface BugbotReviewTelemetryClock {
    now(): number;
    isoNow(): string;
}
export declare class BugbotReviewTelemetry {
    private readonly execution;
    private readonly clock;
    private readonly startedAtMs;
    private readonly startedAt;
    private readonly stages;
    private promptCharacters;
    private responseCharacters;
    private context?;
    private prepared?;
    constructor(execution: Execution, clock?: BugbotReviewTelemetryClock);
    measure<T>(stage: string, action: () => Promise<T> | T): Promise<T>;
    observeContext(context: BugbotContext, prompt: string): void;
    observeResponse(response: unknown): void;
    observePrepared(prepared: PreparedBugbotFindings): void;
    snapshot(outcome: BugbotReviewOutcome, errorCategory?: string): BugbotReviewTelemetrySnapshot;
}
