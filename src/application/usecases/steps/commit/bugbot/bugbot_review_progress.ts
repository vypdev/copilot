import { canonicalGitObjectId } from '../../../../../domain/git_object_id';
import type { BugbotPullRequestIdentity } from '../../../../../domain/bugbot/context';
import type { BugbotReviewProgressObservation, BugbotReviewProgressPort } from '../../../../ports/bugbot_review_progress_ports';
import { logInfo } from '../../../../ports/logging_ports';

const UPDATE_INTERVAL_MS = 5 * 60_000;
type Work = Pick<BugbotReviewProgressObservation, 'partitions' | 'frames' | 'candidates' | 'retries' | 'failureCode'>;

/** One host-owned observation stream. Serializes snapshots and never influences the review decision. */
export class BugbotReviewProgress {
    private readonly startedAt = this.now();
    private lastAt = -Infinity;
    private sequence = 0;
    private queue = Promise.resolve();
    private previous?: string;
    private lastStage?: BugbotReviewProgressObservation['stage'];
    private previousFrame?: number;
    private previousPlan?: number;
    private stageStartedAt = this.startedAt;
    private readonly stageTimesMs: Partial<Record<Exclude<BugbotReviewProgressObservation['stage'], 'finished'>, number>> = {};
    private work: Work = {};
    private baseRefSha?: string;

    constructor(private readonly target: BugbotPullRequestIdentity, private readonly port: BugbotReviewProgressPort | undefined,
        private readonly dryRun: boolean, private readonly locale: string, private readonly now = Date.now) {}

    pinComparison(baseRefSha: string | undefined): void {
        this.baseRefSha = canonicalGitObjectId(baseRefSha);
    }

    async record(stage: BugbotReviewProgressObservation['stage'], facts: Work = {},
        outcome?: BugbotReviewProgressObservation['outcome']): Promise<void> {
        const headSha = canonicalGitObjectId(this.target.headSha);
        if (!headSha || this.lastStage === 'finished') return;
        const at = this.now();
        const work = this.work = { ...this.work, ...facts };
        const data = { stage, ...work, ...(outcome ? { outcome } : {}) };
        const identity = JSON.stringify(data);
        const phaseChanged = stage !== this.lastStage;
        if (phaseChanged) {
            if (this.lastStage) this.stageTimesMs[this.lastStage] = Math.max(0, at - this.stageStartedAt);
            this.stageStartedAt = at;
        }
        const transition = phaseChanged || work.frames?.ordinal !== this.previousFrame
            || (facts.partitions !== undefined && this.previousPlan !== facts.partitions.total);
        if (identity === this.previous || (!transition && at - this.lastAt < UPDATE_INTERVAL_MS)) return;
        this.previous = identity;
        this.previousFrame = work.frames?.ordinal;
        this.previousPlan = work.partitions?.total;
        this.lastAt = at;
        this.lastStage = stage;
        const progress: BugbotReviewProgressObservation = { ...data, headSha, baseSha: canonicalGitObjectId(this.target.baseSha), baseRefSha: this.baseRefSha,
            pullNumber: this.target.number, elapsedMs: Math.max(0, at - this.startedAt), observedAt: new Date(at).toISOString(),
            sequence: ++this.sequence, stageTimesMs: { ...this.stageTimesMs } };
        this.queue = this.queue.then(async () => {
            logInfo(`[bugbot.progress] ${JSON.stringify(progress)}`);
            try {
                await this.port?.observe(progress, this.dryRun, this.locale);
            } catch {
                logInfo('Bugbot progress could not be updated. Review continues.');
            }
        });
        await this.queue;
    }
}
