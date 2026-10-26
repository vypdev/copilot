import { pageIdentity } from '../domain/page.ts';
import { validSession, type ProtectedSession } from '../domain/session.ts';
import type { NativeObject, Repository, Viewer } from '../domain/read.ts';
import type { Message } from '../domain/protocol.ts';
import type { StoragePort } from './runtime_ports.ts';
import type { CancellationOwner, ReadCancellation, SessionPorts } from './read_ports.ts';
import { ReadScheduler, type ScheduledRead } from './read_scheduler.ts';

export const SESSION_KEY = 'copilot.connection.v1';
export type SessionStatus = { readonly state: 'disconnected' | 'connected' | 'unavailable' | 'revalidating' | 'limited' | 'cooldown' | 'budget'; readonly epoch: number; readonly retryAt?: number };
export class ProtectedSessionService {
    private epoch = 0;
    private retryAt: number | undefined;
    private connection: ProtectedSession | undefined;
    private cancellation: CancellationOwner;
    private initialization: Promise<void> | undefined;
    private persistence: Promise<unknown> = Promise.resolve();
    private state: SessionStatus['state'] = 'disconnected';
    constructor(private readonly store: StoragePort, private readonly scheduler: ReadScheduler, private readonly ports: SessionPorts) {
        this.cancellation = ports.cancellation();
    }
    selectedRepositoryId(): string { return this.connection?.repositoryId ?? ''; }
    status(): SessionStatus { return { state: this.state, epoch: this.epoch, ...(this.retryAt === undefined ? {} : { retryAt: this.retryAt }) }; }
    async start(): Promise<void> {
        this.initialization ??= this.restore();
        await this.initialization;
    }
    private async restore(): Promise<void> {
        const epoch = this.epoch;
        this.state = 'revalidating';
        try {
            if (!await this.ports.protected() || !await this.ports.permitted()) { await this.revoke(); return; }
            const stored = await this.store.get(SESSION_KEY);
            if (epoch !== this.epoch) return;
            if (!validSession(stored)) { await this.revoke(); return; }
            await this.establish(stored.secret, stored.repository, epoch, stored);
        } catch { if (epoch === this.epoch) { await this.revoke(); this.state = 'unavailable'; } }
    }
    async connect(secret: string, repository: string): Promise<SessionStatus> {
        await this.start();
        await this.revoke();
        const epoch = this.epoch;
        try {
            if (!await this.ports.protected() || !await this.ports.permitted()) { this.state = 'unavailable'; return this.status(); }
            if (epoch === this.epoch) await this.establish(secret, repository, epoch);
        } catch { if (epoch === this.epoch) { await this.revoke(); this.state = 'unavailable'; } }
        return this.status();
    }
    private async establish(secret: string, repository: string, epoch: number, expected?: ProtectedSession): Promise<void> {
        const activity = { visible: true, active: true, online: true, pending: false, manual: true };
        const identity = await this.scheduler.run(`connect/${epoch}/viewer`, 'connection', { type: 'viewer' }, secret, this.cancellation, activity);
        if (this.defer(identity, epoch)) return;
        if (identity.state !== 'ok' || !('login' in identity.data)) throw new Error('identity-unavailable');
        const viewer = identity.data as Viewer;
        const target = await this.scheduler.run(`connect/${epoch}/repository`, 'connection', { type: 'repository', name: repository }, secret, this.cancellation, activity);
        if (this.defer(target, epoch)) return;
        if (target.state !== 'ok' || !('name' in target.data)) throw new Error('repository-unavailable');
        const repo = target.data as Repository;
        if (identity.bytes + target.bytes > 1024 * 1024 || epoch !== this.epoch || this.cancellation.aborted) return;
        if (expected && (expected.viewerId !== viewer.id || expected.repositoryId !== repo.id)) throw new Error('identity-changed');
        const connection: ProtectedSession = { schemaVersion: 1, secret, viewerId: viewer.id, viewerLogin: viewer.login,
            repositoryId: repo.id, repository: repo.name };
        await this.persist(async () => { if (epoch === this.epoch) await this.store.set(SESSION_KEY, connection); });
        const permitted = await this.ports.permitted();
        if (epoch !== this.epoch) return;
        if (!permitted) { await this.revoke(); return; }
        this.connection = connection; this.state = 'connected';
    }
    private defer(result: ScheduledRead, epoch: number): boolean {
        if (result.state !== 'limited' && result.state !== 'cooldown' && result.state !== 'budget') return false;
        if (epoch === this.epoch) { this.state = result.state; this.retryAt = result.retryAt; }
        return true;
    }
    /** Fence and abort synchronously, before the first storage await. */
    async revoke(): Promise<void> {
        this.epoch++; this.retryAt = undefined; this.connection = undefined; this.state = 'disconnected';
        this.cancellation.abort(); this.cancellation = this.ports.cancellation(); this.scheduler.invalidate();
        try { await this.persist(() => this.store.remove(SESSION_KEY)); }
        catch { this.state = 'unavailable'; }
    }
    private persist(operation: () => Promise<void>): Promise<void> {
        const next = this.persistence.then(operation); this.persistence = next.catch(() => undefined); return next;
    }
    async snapshot(message: Extract<Message, { method: 'page.snapshot' }>, active: boolean, online: boolean, pageCancellation: ReadCancellation): Promise<unknown> {
        await this.start();
        const session = this.connection;
        const epoch = this.epoch;
        const page = pageIdentity(message.route);
        if (!session || !page || !['issue', 'pull'].includes(page.kind) || !page.number) return this.status();
        if (!await this.ports.permitted() || message.viewer === null || message.viewer.toLowerCase() !== session.viewerLogin.toLowerCase()) {
            await this.revoke(); return this.status();
        }
        if (message.repositoryId !== session.repositoryId || page.repository !== session.repository.toLowerCase()) return { state: 'unavailable', epoch: this.epoch };
        if (epoch !== this.epoch || this.connection !== session) return { state: 'disconnected', epoch: this.epoch };
        const combined = this.ports.cancellation();
        const releasePage = pageCancellation.onAbort(() => combined.abort());
        const releaseSession = this.cancellation.onAbort(() => combined.abort());
        let result;
        try { result = await this.scheduler.run(`${session.viewerId}/${session.repositoryId}/${page.kind}/${page.number}`,
            `${session.viewerId}/${session.repositoryId}`, { type: 'object', repository: session.repository, kind: page.kind as 'issue' | 'pull', number: page.number },
            session.secret, combined, { visible: message.visible, active, online, pending: false, manual: message.manual });
        } finally { releasePage(); releaseSession(); }
        if (epoch !== this.epoch || !this.connection) return { state: 'disconnected', epoch: this.epoch };
        if (result.state === 'unauthorized') { await this.revoke(); return this.status(); }
        if (result.state !== 'ok') return { state: result.state, epoch, ...(result.retryAt === undefined ? {} : { retryAt: result.retryAt }) };
        return { state: 'current', epoch, generation: message.generation, data: result.data as NativeObject };
    }
}
