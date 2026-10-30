import { connectionIntent, connectionsView, NAMED_SESSION_LIMIT, validVault, sameSessionVault, type ConnectionIntent,
    type ConnectionOutcome, type SessionVault } from '../domain/named_sessions.ts';
import { localIdentifier } from '../domain/center_routes.ts';
import type { StoragePort } from './runtime_ports.ts';
import type { ProtectedSessionService } from './protected_session.ts';
import { SESSION_KEY } from './protected_session.ts';
import { validSession } from '../domain/session.ts';
import { deepFreeze } from '../domain/value.ts';
import { protectedMutation, type ProtectedMutationTrace } from './protected_mutation.ts';
import { finishSession, sessionStep, type ObserveSessionOperation, type SessionOperationTrace } from './session_observation_ports.ts';

export const NAMED_SESSIONS_KEY = 'copilot.named-sessions.v1';
export interface NamedSessionPorts {
    protected(): Promise<boolean>; identifier(): string; changed(): void;
    connected(repositoryId: string, current: () => boolean, trace?: ProtectedMutationTrace): Promise<void>;
}
const empty = (): SessionVault => ({ schemaVersion: 1, revision: 0, selected: null, entries: [] });

/** One worker owns a protected, bounded vault. Only redacted summaries leave this use case. */
export class NamedSessions {
    private busy = false;
    private generation = 0;
    private persistence: Promise<unknown> = Promise.resolve();
    constructor(private readonly store: StoragePort, private readonly active: ProtectedSessionService, private readonly ports: NamedSessionPorts) {}
    private persist<T>(operation: () => Promise<T>): Promise<T> {
        const next = this.persistence.then(operation); this.persistence = next.catch(() => undefined); return next;
    }
    private notify(): void { try { this.ports.changed(); } catch { /* Notifications cannot replace protected storage facts. */ } }
    private async load(): Promise<SessionVault> {
        if (!await this.ports.protected()) throw new Error('protected-storage-unavailable');
        const value = await this.store.get(NAMED_SESSIONS_KEY);
        if (value === undefined) {
            const previous = await this.store.get(SESSION_KEY);
            return validSession(previous) ? { ...empty(), selected: 'previous-session', entries: [{ id: 'previous-session', name: 'GitHub',
                host: 'github.com', role: 'repository-read', connection: previous }] } : empty();
        }
        if (!validVault(value)) throw new Error('protected-vault-invalid');
        return structuredClone(value);
    }
    private view(vault: SessionVault): ConnectionOutcome {
        const selected = vault.entries.find(entry => entry.id === vault.selected);
        const verified = this.active.verifiedIdentity();
        const epoch = this.active.status().epoch;
        if (!selected || !verified || !this.active.matches(selected.connection)) return connectionsView(vault, false, epoch);
        // A restored connection may have a new canonical name or organization owner.
        // Current effective context uses the verified facts, never stale vault metadata.
        const { organizationId: _oldOrganization, ...previous } = selected.connection;
        return connectionsView({ ...vault, entries: vault.entries.map(entry => entry.id === selected.id
            ? { ...entry, connection: { ...previous, ...verified } } : entry) }, true, epoch);
    }
    async read(current: () => boolean): Promise<ConnectionOutcome> {
        try {
            const generation = this.generation;
            await this.active.start(); const vault = await this.load();
            return generation === this.generation && current() ? this.view(vault) : { state: 'stale' };
        } catch { return { state: 'unavailable' }; }
    }
    async change(input: ConnectionIntent, revision: number, current: () => boolean, observe?: ObserveSessionOperation): Promise<ConnectionOutcome> {
        let trace: SessionOperationTrace | null = null;
        const capture: ObserveSessionOperation = (action, target, live) => {
            try { trace = observe?.(action, target, live) ?? null; } catch { /* A secondary capture cannot reject an admitted action. */ }
            return trace;
        };
        let result: ConnectionOutcome;
        try { result = await this.apply(input, revision, current, capture); } catch { result = { state: 'unavailable' }; }
        finishSession(trace, result.state); return result;
    }
    private async apply(input: ConnectionIntent, revision: number, current: () => boolean, capture: ObserveSessionOperation): Promise<ConnectionOutcome> {
        if (!connectionIntent(input)) return { state: 'invalid' };
        if (!current()) return { state: 'stale' };
        if (input.type === 'revoke-all') {
            try { await this.revokeAll(capture, current); return this.read(current); } catch { return { state: 'unavailable' }; }
        }
        if (this.busy) return { state: 'conflict' };
        this.busy = true; const generation = this.generation;
        const live = () => generation === this.generation && current();
        const intent = { ...input }; let admitted = false; let trace: SessionOperationTrace | null = null; let changedActive = false;
        const cleanup = async () => { if (changedActive) await this.active.revoke(trace, 'cleanup-active'); };
        try {
            const vault = await this.load();
            if (!live()) return { state: 'stale' };
            if (vault.revision !== revision || revision >= Number.MAX_SAFE_INTEGER) return { state: 'conflict' };
            if (intent.type === 'connect' && vault.entries.length >= NAMED_SESSION_LIMIT) return { state: 'capacity' };
            if (intent.type === 'connect' && vault.entries.some(entry => entry.name.toLowerCase() === intent.name.toLowerCase())) return { state: 'invalid' };
            const selected = intent.type === 'select' || intent.type === 'remove' ? vault.entries.find(entry => entry.id === intent.id) : undefined;
            if ((intent.type === 'select' || intent.type === 'remove') && !selected) return { state: 'invalid' };
            if (intent.type === 'connect' || intent.type === 'select') { await this.active.start(); if (!live()) return { state: 'stale' }; }
            admitted = true;
            const target = intent.type === 'connect' ? intent.name : selected?.name ?? vault.entries.find(entry => entry.id === vault.selected)?.name ?? null;
            trace = capture(intent.type, { location: { route: 'connections' }, label: target }, live);
            if (!live()) return { state: 'stale' };
            if (intent.type !== 'remove' || vault.selected === intent.id) {
                changedActive = true;
                const revoked = this.active.revoke(trace); this.notify(); await revoked;
                if (!live()) return { state: 'stale' };
                if (this.active.status().state === 'unavailable') return { state: 'unavailable' };
            }
            let next: SessionVault;
            if (intent.type === 'connect' || intent.type === 'select') {
                const secret = intent.type === 'connect' ? intent.secret : selected!.connection.secret;
                const repository = intent.type === 'connect' ? intent.repository : intent.repository ?? selected!.connection.repository;
                const result = await this.active.connect(secret, repository, selected?.connection, live, trace);
                if (!live()) { await cleanup(); return { state: 'stale' }; }
                const verified = this.active.verifiedIdentity();
                if (result.state !== 'connected' || !verified) return { state: ['limited', 'cooldown', 'budget'].includes(result.state)
                    ? result.state as 'limited' | 'cooldown' | 'budget' : 'unavailable' };
                const preference = sessionStep(trace, 'save-repository-preference');
                if (preference) await this.ports.connected(verified.repositoryId, live, preference); else await this.ports.connected(verified.repositoryId, live);
                const id = selected?.id ?? this.ports.identifier();
                if (!localIdentifier(id) || (!selected && vault.entries.some(entry => entry.id === id))) { await cleanup(); return { state: 'unavailable' }; }
                const entry = { id, name: intent.type === 'connect' ? intent.name : selected!.name, host: 'github.com' as const,
                    role: 'repository-read' as const, connection: { schemaVersion: 1 as const, secret, ...verified } };
                next = { ...vault, revision: revision + 1, selected: id,
                    entries: selected ? vault.entries.map(previous => previous.id === id ? entry : previous) : [...vault.entries, entry] };
            } else {
                next = { ...vault, revision: revision + 1, selected: intent.type === 'disconnect' || vault.selected === intent.id ? null : vault.selected,
                    entries: intent.type === 'remove' ? vault.entries.filter(entry => entry.id !== intent.id)
                        : vault.entries.filter(entry => entry.id !== vault.selected) };
            }
            if (!live()) { await cleanup(); return { state: 'stale' }; }
            // A read-back can establish an observed save after lost acknowledgement; never repeat the write.
            const expected = deepFreeze(next);
            const saved = await this.persist(async () => {
                const step = sessionStep(trace, 'save-vault'); if (!live()) return null;
                return protectedMutation(() => this.store.set(NAMED_SESSIONS_KEY, expected), async () => sameSessionVault(await this.store.get(NAMED_SESSIONS_KEY), expected), step);
            });
            if (!saved) { await cleanup(); return { state: 'stale' }; }
            if (saved.observation !== 'committed') { await cleanup(); return { state: 'unknown' }; }
            if (!live()) { await cleanup(); return { state: 'stale' }; }
            return this.view(next);
        } catch { await cleanup(); return { state: 'unavailable' }; }
        finally { this.busy = false; if (admitted) this.notify(); }
    }
    /** Permission removal is independent of preference-schema or center editing availability. */
    async revokeAll(observe?: ObserveSessionOperation, current: () => boolean = () => true): Promise<void> {
        const generation = ++this.generation; const live = () => generation === this.generation && current();
        let trace: SessionOperationTrace | null = null;
        try { trace = observe?.('revoke-all', { location: { route: 'connections' }, label: null }, live) ?? null; } catch { /* Removal remains independent of recording. */ }
        const removal = this.active.revoke(trace);
        try {
            const removed = await this.persist(() => protectedMutation(() => this.store.remove(NAMED_SESSIONS_KEY), async () => await this.store.get(NAMED_SESSIONS_KEY) === undefined, sessionStep(trace, 'remove-vault'))); await removal;
            if (removed.observation !== 'committed' || this.active.status().state === 'unavailable') throw new Error('protected-removal-unavailable');
        } finally { await removal; this.notify(); }
    }
}
