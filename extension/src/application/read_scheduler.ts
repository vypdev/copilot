import { initialSchedule, rateLimit, reserveRead, scheduleDecision, validSchedule, type Activity, type ScheduleState } from '../domain/scheduling.ts';
import type { ReadRequest } from '../domain/read.ts';
import type { StoragePort } from './runtime_ports.ts';
import type { GitHubReadPort, ReadCancellation, ReadResult } from './read_ports.ts';

interface CacheEntry { readonly result: Extract<ReadResult, { state: 'ok' }>; readonly expires: number; readonly epoch: number }
export type ScheduledRead = ReadResult | { readonly state: 'inactive' | 'cooldown' | 'budget' | 'busy' | 'storage-unavailable'; readonly bytes: 0 };
export class ReadScheduler {
    private state: ScheduleState | undefined;
    private readonly pending = new Map<string, Promise<ScheduledRead>>();
    private readonly cache = new Map<string, CacheEntry>();
    private gate: Promise<unknown> = Promise.resolve();
    private epoch = 0;
    constructor(private readonly store: StoragePort, private readonly reader: GitHubReadPort,
        private readonly now: () => number, private readonly jitter: () => number) {}
    invalidate(): void { this.epoch++; this.cache.clear(); }
    async run(key: string, repository: string, request: ReadRequest, secret: string, cancellation: ReadCancellation,
        activity: Activity): Promise<ScheduledRead> {
        const duplicate = this.pending.get(key);
        if (duplicate) return duplicate;
        if (this.pending.size >= 2) return { state: 'busy', bytes: 0 };
        const epoch = this.epoch;
        const task = this.execute(key, repository, request, secret, cancellation, activity, epoch);
        this.pending.set(key, task);
        try { return await task; } finally { if (this.pending.get(key) === task) this.pending.delete(key); }
    }
    private async execute(key: string, repository: string, request: ReadRequest, secret: string, cancellation: ReadCancellation,
        activity: Activity, epoch: number): Promise<ScheduledRead> {
        const reserve = this.gate.then(async () => {
            if (!this.state) {
                const persisted = await this.store.get('copilot.schedule.v1');
                if (persisted !== undefined && !validSchedule(persisted)) return 'storage-unavailable' as const;
                this.state = persisted ?? initialSchedule(this.now());
            }
            if (this.now() < this.state.started) return 'cooldown' as const;
            if (this.now() - this.state.started >= 3600000) this.state = initialSchedule(this.now());
            const decision = scheduleDecision(this.state, this.now(), key, repository, !!secret, activity);
            if (decision !== 'allowed') return decision;
            const next = reserveRead(this.state, this.now(), key, repository, !!secret, activity.manual);
            await this.store.set('copilot.schedule.v1', next); this.state = next;
            return 'allowed' as const;
        });
        this.gate = reserve.catch(() => undefined);
        let decision: Awaited<typeof reserve>;
        try { decision = await reserve; } catch { return { state: 'storage-unavailable', bytes: 0 }; }
        if (decision !== 'allowed') return { state: decision, bytes: 0 };
        if (cancellation.aborted || epoch !== this.epoch) return { state: 'aborted', bytes: 0 };
        const cached = this.cache.get(key);
        if (cached && cached.epoch === epoch && cached.expires > this.now() && !activity.manual) return cached.result;
        const result = await this.reader.read(request, secret, cancellation, cached?.result.etag);
        if (cancellation.aborted || epoch !== this.epoch) return { state: 'aborted', bytes: 0 };
        if (result.state === 'limited') {
            const update = this.gate.then(async () => {
                const next = rateLimit(this.state!, this.now(), result.retryAfter, this.jitter());
                this.state = next;
                await this.store.set('copilot.schedule.v1', next);
            });
            this.gate = update.catch(() => undefined);
            try { await update; } catch { return { state: 'storage-unavailable', bytes: 0 }; }
        }
        if (result.state === 'unchanged') {
            if (!cached || cached.epoch !== epoch) return { state: 'invalid', bytes: 0 };
            this.cache.set(key, { ...cached, expires: this.now() + 60000 });
            return cached.result;
        }
        if (result.state === 'ok') {
            if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value!);
            let bytes = [...this.cache.values()].reduce((total, entry) => total + entry.result.bytes, 0);
            for (const [old, entry] of this.cache) {
                if (bytes + result.bytes <= 1024 * 1024) break;
                this.cache.delete(old); bytes -= entry.result.bytes;
            }
            this.cache.set(key, { result, epoch, expires: this.now() + 60000 });
        } else if (result.state !== 'limited') this.cache.delete(key);
        return result;
    }
}
