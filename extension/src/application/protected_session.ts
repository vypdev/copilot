import { pageIdentity } from '../domain/page.ts';
import { validSession, sameProtectedSession, type ProtectedSession, type SessionIdentity } from '../domain/session.ts';
import type { NativeObject, Repository, Viewer } from '../domain/read.ts';
import type { Message } from '../domain/protocol.ts';
import type { StoragePort } from './runtime_ports.ts';
import type { CancellationOwner, ReadCancellation, SessionPorts } from './read_ports.ts';
import { ReadScheduler, type ScheduledRead } from './read_scheduler.ts';
import { protectedMutation } from './protected_mutation.ts';
import { sessionStep, sessionCredential, type SessionOperationTrace } from './session_observation_ports.ts';

export const SESSION_KEY = 'copilot.connection.v1';
export type SessionStatus = { readonly state: 'disconnected' | 'connected' | 'unavailable' | 'revalidating' | 'limited' | 'cooldown' | 'budget'; readonly epoch: number; readonly retryAt?: number };
export interface RestorationScope { readonly cancellation: ReadCancellation; current(): boolean }
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
    matches(expected: ProtectedSession): boolean {
        return this.state === 'connected' && this.connection?.secret === expected.secret
            && this.connection.viewerId === expected.viewerId && this.connection.repositoryId === expected.repositoryId;
    }
    verifiedIdentity(): Omit<ProtectedSession, 'schemaVersion' | 'secret'> | null {
        if (!this.connection || this.state !== 'connected') return null;
        const { schemaVersion: _schema, secret: _secret, ...identity } = this.connection;
        return { ...identity };
    }
    status(): SessionStatus { return { state: this.state, epoch: this.epoch, ...(this.retryAt === undefined ? {} : { retryAt: this.retryAt }) }; }
    /** Restriction-only native equality; never restores, revokes or returns credential material. */
    async matchesRetained(expected: ProtectedSession): Promise<boolean> {
        const epoch = this.epoch;
        if (!await this.ports.protected() || !await this.ports.permitted()) return false;
        const value = await this.store.get(SESSION_KEY);
        return epoch === this.epoch && sameProtectedSession(value, expected);
    }
    /** Retained identity is restriction-only until start() has verified it again. */
    async retainedIdentity(): Promise<SessionIdentity | null> {
        if (!await this.ports.protected() || !await this.ports.permitted()) { await this.revoke(); return null; }
        if (this.connection) return this.verifiedIdentity();
        const value = await this.store.get(SESSION_KEY);
        if (!validSession(value)) return null;
        const { schemaVersion: _schema, secret: _secret, ...identity } = value; return identity;
    }
    async start(scope?: RestorationScope): Promise<void> {
        const epoch = this.epoch;
        this.initialization ??= this.restore(scope);
        const pending = this.initialization;
        await pending;
        // A fresh eligible request may retry; the scheduler retains cooldown/budget and no loop is started here.
        if (scope && epoch === this.epoch && this.initialization === pending && !this.connection) this.initialization = undefined;
    }
    private async restore(scope?: RestorationScope): Promise<void> {
        const epoch = this.epoch;
        const current = () => epoch === this.epoch && (!scope || !scope.cancellation.aborted && scope.current());
        if (!current()) return;
        this.state = 'revalidating';
        const cancellation = this.ports.cancellation();
        const releases = [this.cancellation.onAbort(() => cancellation.abort())];
        if (scope) releases.push(scope.cancellation.onAbort(() => cancellation.abort()));
        try {
            const ready = await this.ports.protected() && await this.ports.permitted();
            if (!current()) return;
            if (!ready) { await this.revoke(); return; }
            const stored = await this.store.get(SESSION_KEY);
            if (!current()) return;
            if (!validSession(stored)) { await this.revoke(); return; }
            await this.establish(stored.secret, stored.repository, epoch, stored, current, cancellation);
        } catch { if (current()) { await this.revoke(); this.state = 'unavailable'; } }
        finally {
            for (const release of releases) release();
            if (epoch === this.epoch && !current() && !this.connection) this.state = 'disconnected';
        }
    }
    async connect(secret: string, repository: string, expected?: ProtectedSession, current: () => boolean = () => true, observer?: SessionOperationTrace | null): Promise<SessionStatus> {
        await this.start();
        if (!current()) return this.status();
        const removal = this.revoke(observer); const epoch = this.epoch;
        await removal;
        try {
            if (epoch !== this.epoch || !current()) return this.status();
            const ready = await this.ports.protected() && await this.ports.permitted();
            if (epoch !== this.epoch || !current()) return this.status();
            if (!ready) { this.state = 'unavailable'; return this.status(); }
            await this.establish(secret, repository, epoch, expected, current, this.cancellation, observer);
        } catch { if (epoch === this.epoch) { await this.revoke(observer, 'cleanup-active'); this.state = 'unavailable'; } }
        return this.status();
    }
    private async establish(secret: string, repository: string, epoch: number, expected: ProtectedSession | undefined, current: () => boolean,
        cancellation: ReadCancellation = this.cancellation, observer?: SessionOperationTrace | null): Promise<void> {
        // Both callers admit the current scope synchronously; asynchronous completions are fenced below.
        const activity = { visible: true, active: true, online: true, pending: false, manual: true };
        const identity = await this.scheduler.run(`connect/${epoch}/viewer`, 'connection', { type: 'viewer' }, secret, cancellation, activity);
        if (epoch !== this.epoch || !current() || cancellation.aborted) return;
        if (this.defer(identity)) return;
        if (identity.state !== 'ok' || !('login' in identity.data)) throw new Error('identity-unavailable');
        const viewer = identity.data as Viewer;
        const target = await this.scheduler.run(`connect/${epoch}/repository`, 'connection', { type: 'repository', name: repository }, secret, cancellation, activity);
        if (epoch !== this.epoch || !current() || cancellation.aborted) return;
        if (this.defer(target)) return;
        if (target.state !== 'ok' || !('name' in target.data)) throw new Error('repository-unavailable');
        const repo = target.data as Repository;
        if (identity.bytes + target.bytes > 1024 * 1024) return;
        if (expected && (expected.viewerId !== viewer.id || expected.repositoryId !== repo.id)) throw new Error('identity-changed');
        const connection: ProtectedSession = Object.freeze({ schemaVersion: 1, secret, viewerId: viewer.id, viewerLogin: viewer.login,
            repositoryId: repo.id, repository: repo.name, ...(repo.organizationId === undefined ? {} : { organizationId: repo.organizationId }) });
        const saved = await this.persist(async () => {
            const trace = sessionStep(observer, 'save-active');
            if (epoch !== this.epoch || !current()) return null;
            return protectedMutation(() => this.store.set(SESSION_KEY, connection), async () => sameProtectedSession(await this.store.get(SESSION_KEY), connection), trace);
        });
        if (!saved) return;
        if (saved.observation !== 'committed') throw new Error('protected-save-unconfirmed');
        const permitted = await this.ports.permitted();
        if (epoch !== this.epoch) return;
        if (!permitted || !current()) { await this.revoke(observer, 'cleanup-active'); return; }
        this.connection = connection; this.state = 'connected';
    }
    private defer(result: ScheduledRead): boolean {
        if (result.state !== 'limited' && result.state !== 'cooldown' && result.state !== 'budget') return false;
        this.state = result.state; this.retryAt = result.retryAt;
        return true;
    }
    /** Fence and abort synchronously, before the first storage await. */
    async revoke(observer?: SessionOperationTrace | null, effect: 'retire-active' | 'cleanup-active' = 'retire-active'): Promise<void> {
        this.initialization ??= Promise.resolve();
        const previous = this.epoch; const epoch = ++this.epoch; this.retryAt = undefined; this.connection = undefined; this.state = 'disconnected';
        sessionCredential(observer, previous, epoch);
        this.cancellation.abort(); this.cancellation = this.ports.cancellation(); this.scheduler.invalidate();
        const removed = await this.persist(() => protectedMutation(() => this.store.remove(SESSION_KEY), async () => await this.store.get(SESSION_KEY) === undefined, sessionStep(observer, effect)));
        if (epoch === this.epoch && removed.observation !== 'committed') this.state = 'unavailable';
    }
    private persist<T>(operation: () => Promise<T>): Promise<T> {
        const next = this.persistence.then(operation); this.persistence = next.catch(() => undefined); return next;
    }
    async snapshot(message: Extract<Message, { method: 'page.snapshot' }>, active: boolean, online: boolean, pageCancellation: ReadCancellation): Promise<unknown> {
        await this.start();
        const session = this.connection;
        const epoch = this.epoch;
        const page = pageIdentity(message.route);
        if (!session || !page || !['issue', 'pull'].includes(page.kind) || !page.number) return this.status();
        const permitted = await this.ports.permitted();
        if (epoch !== this.epoch || this.connection !== session) return { state: 'disconnected', epoch: this.epoch };
        if (!permitted || message.viewer === null || message.viewer.toLowerCase() !== session.viewerLogin.toLowerCase()) {
            await this.revoke(); return this.status();
        }
        if (message.repositoryId !== session.repositoryId || page.repository !== session.repository.toLowerCase()) return { state: 'unavailable', epoch: this.epoch };
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
