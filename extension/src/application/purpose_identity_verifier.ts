import { optionalRoleCredential, writePurpose, type WritePurpose } from '../domain/credential_roles.ts';
import { repositoryAddress } from '../domain/session_vault_entries.ts';
import { validSessionIdentity, type SessionIdentity } from '../domain/session.ts';
import { deepFreeze } from '../domain/value.ts';
import type { Repository, Viewer } from '../domain/read.ts';
import type { CancellationOwner, SessionPorts } from './read_ports.ts';
import type { ReadScheduler, ScheduledRead } from './read_scheduler.ts';

export type PurposeIdentityResult = { readonly state: 'verified'; readonly identity: SessionIdentity }
    | { readonly state: 'invalid' | 'conflict' | 'stale' | 'unavailable' }
    | { readonly state: 'limited' | 'cooldown' | 'budget'; readonly retryAt?: number };

/** Only identity GETs. This service cannot persist, activate a read session or certify a write grant. */
export class PurposeIdentityVerifier {
    private generation = 0;
    private running: { readonly cancellation: CancellationOwner } | null = null;
    constructor(private readonly scheduler: ReadScheduler, private readonly ports: SessionPorts) {}
    invalidate(): void { this.generation++; this.running?.cancellation.abort(); }
    async verify(purpose: WritePurpose, secret: string, repository: string, current: () => boolean, expected?: SessionIdentity): Promise<PurposeIdentityResult> {
        if (!writePurpose(purpose) || !optionalRoleCredential(secret) || !repositoryAddress(repository)) return { state: 'invalid' };
        if (this.running) return { state: 'conflict' };
        let cancellation: CancellationOwner;
        try { cancellation = this.ports.cancellation(); } catch { return { state: 'unavailable' }; }
        const generation = ++this.generation; const task = { cancellation }; this.running = task;
        const live = () => generation === this.generation && !task.cancellation.aborted && current() === true;
        const ready = async () => await this.ports.protected() === true && await this.ports.permitted() === true;
        const activity = { visible: true, active: true, online: true, pending: false, manual: true };
        try {
            if (!live()) return { state: 'stale' };
            const permitted = await ready(); if (!live()) return { state: 'stale' };
            if (!permitted) return { state: 'unavailable' };
            const prefix = `purpose/${purpose}/${generation}`;
            const readOptions = { cacheResponse: false };
            const viewer = await this.scheduler.run(`${prefix}/viewer`, `purpose/${purpose}`, { type: 'viewer' }, secret, task.cancellation, activity, readOptions);
            if (!live()) return { state: 'stale' };
            if (viewer.state !== 'ok' || !('login' in viewer.data)) return this.failure(viewer);
            const target = await this.scheduler.run(`${prefix}/repository`, `purpose/${purpose}`, { type: 'repository', name: repository }, secret, task.cancellation, activity, readOptions);
            if (!live()) return { state: 'stale' };
            if (target.state !== 'ok' || !('name' in target.data)) return this.failure(target);
            if (viewer.bytes + target.bytes > 1024 * 1024) return { state: 'unavailable' };
            const user = viewer.data as Viewer; const repo = target.data as Repository;
            const identity = { viewerId: user.id, viewerLogin: user.login, repositoryId: repo.id, repository: repo.name,
                ...(repo.organizationId === undefined ? {} : { organizationId: repo.organizationId }) };
            if (!validSessionIdentity(identity) || expected && (expected.viewerId !== identity.viewerId || expected.repositoryId !== identity.repositoryId)) return { state: 'unavailable' };
            const stillPermitted = await ready(); if (!live()) return { state: 'stale' };
            return stillPermitted ? deepFreeze({ state: 'verified' as const, identity }) : { state: 'unavailable' };
        } catch { return { state: 'unavailable' }; }
        // Invalidation never frees this slot; admission forbids a replacement until this attempt drains.
        finally { this.running = null; }
    }
    private failure(value: ScheduledRead): PurposeIdentityResult {
        return value.state === 'limited' || value.state === 'cooldown' || value.state === 'budget'
            ? { state: value.state, ...(value.retryAt === undefined ? {} : { retryAt: value.retryAt }) } : { state: 'unavailable' };
    }
}
