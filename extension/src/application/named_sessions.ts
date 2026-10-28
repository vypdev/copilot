import { connectionIntent, connectionsView, NAMED_SESSION_LIMIT, validVault, type ConnectionIntent,
    type ConnectionOutcome, type SessionVault } from '../domain/named_sessions.ts';
import { localIdentifier } from '../domain/center_routes.ts';
import type { StoragePort } from './runtime_ports.ts';
import type { ProtectedSessionService } from './protected_session.ts';
import { SESSION_KEY } from './protected_session.ts';
import { validSession } from '../domain/session.ts';

export const NAMED_SESSIONS_KEY = 'copilot.named-sessions.v1';
export interface NamedSessionPorts {
    protected(): Promise<boolean>; identifier(): string; changed(): void;
    connected(repositoryId: string, current: () => boolean): Promise<void>;
}
const empty = (): SessionVault => ({ schemaVersion: 1, revision: 0, selected: null, entries: [] });

/** One worker owns a protected, bounded vault. Only redacted summaries leave this use case. */
export class NamedSessions {
    private busy = false;
    private generation = 0;
    private persistence: Promise<unknown> = Promise.resolve();
    constructor(private readonly store: StoragePort, private readonly active: ProtectedSessionService, private readonly ports: NamedSessionPorts) {}
    private persist(operation: () => Promise<void>): Promise<void> {
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
        if (!selected || !verified || !this.active.matches(selected.connection)) return connectionsView(vault, false);
        // A restored connection may have a new canonical name or organization owner.
        // Current effective context uses the verified facts, never stale vault metadata.
        const { organizationId: _oldOrganization, ...previous } = selected.connection;
        return connectionsView({ ...vault, entries: vault.entries.map(entry => entry.id === selected.id
            ? { ...entry, connection: { ...previous, ...verified } } : entry) }, true);
    }
    async read(current: () => boolean): Promise<ConnectionOutcome> {
        try {
            const generation = this.generation;
            await this.active.start(); const vault = await this.load();
            return generation === this.generation && current() ? this.view(vault) : { state: 'stale' };
        } catch { return { state: 'unavailable' }; }
    }
    async change(input: ConnectionIntent, revision: number, current: () => boolean): Promise<ConnectionOutcome> {
        if (!connectionIntent(input)) return { state: 'invalid' };
        if (!current()) return { state: 'stale' };
        if (input.type === 'revoke-all') {
            try { await this.revokeAll(); return this.read(current); } catch { return { state: 'unavailable' }; }
        }
        if (this.busy) return { state: 'conflict' };
        this.busy = true; const generation = this.generation;
        const live = () => generation === this.generation && current();
        const intent = { ...input }; let admitted = false;
        try {
            const vault = await this.load();
            if (!live()) return { state: 'stale' };
            if (vault.revision !== revision || revision >= Number.MAX_SAFE_INTEGER) return { state: 'conflict' };
            if (intent.type === 'connect' && vault.entries.length >= NAMED_SESSION_LIMIT) return { state: 'capacity' };
            if (intent.type === 'connect' && vault.entries.some(entry => entry.name.toLowerCase() === intent.name.toLowerCase())) return { state: 'invalid' };
            const selected = intent.type === 'select' || intent.type === 'remove' ? vault.entries.find(entry => entry.id === intent.id) : undefined;
            if ((intent.type === 'select' || intent.type === 'remove') && !selected) return { state: 'invalid' };
            admitted = true;
            if (intent.type !== 'remove' || vault.selected === intent.id) {
                const revoked = this.active.revoke(); this.notify(); await revoked;
                if (!live()) return { state: 'stale' };
                if (this.active.status().state === 'unavailable') return { state: 'unavailable' };
            }
            let next: SessionVault;
            if (intent.type === 'connect' || intent.type === 'select') {
                const secret = intent.type === 'connect' ? intent.secret : selected!.connection.secret;
                const repository = intent.type === 'connect' ? intent.repository : selected!.connection.repository;
                const result = await this.active.connect(secret, repository, selected?.connection, live);
                if (!live()) { await this.active.revoke(); return { state: 'stale' }; }
                const verified = this.active.verifiedIdentity();
                if (result.state !== 'connected' || !verified) return { state: ['limited', 'cooldown', 'budget'].includes(result.state)
                    ? result.state as 'limited' | 'cooldown' | 'budget' : 'unavailable' };
                await this.ports.connected(verified.repositoryId, live);
                const id = selected?.id ?? this.ports.identifier();
                if (!localIdentifier(id) || (!selected && vault.entries.some(entry => entry.id === id))) { await this.active.revoke(); return { state: 'unavailable' }; }
                const entry = { id, name: intent.type === 'connect' ? intent.name : selected!.name, host: 'github.com' as const,
                    role: 'repository-read' as const, connection: { schemaVersion: 1 as const, secret, ...verified } };
                next = { ...vault, revision: revision + 1, selected: id,
                    entries: selected ? vault.entries.map(previous => previous.id === id ? entry : previous) : [...vault.entries, entry] };
            } else {
                next = { ...vault, revision: revision + 1, selected: intent.type === 'disconnect' || vault.selected === intent.id ? null : vault.selected,
                    entries: intent.type === 'remove' ? vault.entries.filter(entry => entry.id !== intent.id)
                        : vault.entries.filter(entry => entry.id !== vault.selected) };
            }
            if (!live()) { await this.active.revoke(); return { state: 'stale' }; }
            // A read-back can establish an observed save after lost acknowledgement; never repeat the write.
            try { await this.persist(async () => { if (live()) await this.store.set(NAMED_SESSIONS_KEY, next); }); }
            catch {
                const observed = await this.store.get(NAMED_SESSIONS_KEY);
                if (!validVault(observed) || JSON.stringify(observed) !== JSON.stringify(next)) { await this.active.revoke(); return { state: 'unknown' }; }
            }
            if (!live()) { await this.active.revoke(); return { state: 'stale' }; }
            return this.view(next);
        } catch { await this.active.revoke(); return { state: 'unavailable' }; }
        finally { this.busy = false; if (admitted) this.notify(); }
    }
    /** Permission removal is independent of preference-schema or center editing availability. */
    async revokeAll(): Promise<void> {
        this.generation++; const removal = this.active.revoke();
        try {
            await this.persist(() => this.store.remove(NAMED_SESSIONS_KEY)); await removal;
            if (this.active.status().state === 'unavailable') throw new Error('protected-removal-unavailable');
        } finally { await removal; this.notify(); }
    }
}
