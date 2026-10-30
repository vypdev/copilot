import { connectionIntent, connectionsView, NAMED_SESSION_LIMIT, sameSessionVault, type ConnectionIntent,
    type ConnectionOutcome, type SessionVault } from '../domain/named_sessions.ts';
import { localIdentifier } from '../domain/center_routes.ts';
import type { StoragePort } from './runtime_ports.ts';
import type { ProtectedSessionService } from './protected_session.ts';
import { deepFreeze } from '../domain/value.ts';
import type { ProtectedMutationTrace } from './protected_mutation.ts';
import { finishSession, sessionStep, type ObserveSessionOperation, type SessionOperationTrace } from './session_observation_ports.ts';
import type { SessionPreferenceBinding } from '../domain/session_preference_binding.ts';
import { NativeSessionVault, type NativeVaultObservation } from './native_session_vault.ts';
import type { PurposeIdentityVerifier } from './purpose_identity_verifier.ts';
import { writePurpose, type WritePurpose } from '../domain/credential_roles.ts';
import { planSessionVault } from '../domain/session_vault_plan.ts';
import type { PurposeSessionEntry } from '../domain/session_vault_entries.ts';
import type { SessionIdentity } from '../domain/session.ts';
import { CredentialEpochFence } from './credential_epoch_fence.ts';

export { NAMED_SESSIONS_KEY } from './native_session_vault.ts';
export interface NamedSessionPorts {
    protected(): Promise<boolean>; identifier(): string; changed(): void;
    connected(repositoryId: string, current: () => boolean, trace?: ProtectedMutationTrace): Promise<void>;
}
/** One worker owns a protected, bounded vault. Only redacted summaries leave this use case. */
export class NamedSessions {
    private busy = false;
    private generation = 0;
    private preferenceWitness: object = {};
    private roleProof: { readonly vault: SessionVault; readonly purpose: WritePurpose; readonly epoch: number } | null = null;
    private readonly vault: NativeSessionVault;
    constructor(store: StoragePort, private readonly active: ProtectedSessionService, private readonly ports: NamedSessionPorts, private readonly roleVerifier?: PurposeIdentityVerifier) {
        this.vault = new NativeSessionVault(store, () => ports.protected());
    }
    private notify(): void { try { this.ports.changed(); } catch { /* Notifications cannot replace protected storage facts. */ } }
    /** Private application lease; never serialize it or treat it as native mutation authority. */
    capturePreferenceSource(): () => boolean {
        const witness = this.preferenceWitness; const epoch = this.active.status().epoch;
        return () => !this.busy && witness === this.preferenceWitness && epoch === this.active.status().epoch;
    }
    /** Native vault events retire preference sources without interrupting this owner's own connection transaction. */
    invalidatePreferenceSource(): void { this.preferenceWitness = {}; }
    private async load(): Promise<NativeVaultObservation> {
        const observed = await this.vault.read();
        if (observed.vault.schemaVersion === 2 && !this.roleVerifier) throw new Error('protected-vault-unavailable');
        return observed;
    }
    private view(vault: SessionVault): ConnectionOutcome {
        const selected = vault.entries.find(entry => entry.id === vault.selected);
        const verified = this.active.verifiedIdentity();
        const epoch = this.active.status().epoch;
        const roles = this.roleProof && this.roleProof.epoch === epoch && sameSessionVault(vault, this.roleProof.vault) ? [this.roleProof.purpose] : [];
        if (!selected || !verified || !this.active.matches(selected.connection)) return connectionsView(vault, false, epoch, roles);
        // A restored connection may have a new canonical name or organization owner.
        // Current effective context uses the verified facts, never stale vault metadata.
        const result = connectionsView(vault, true, epoch, roles);
        return deepFreeze({ ...result, entries: result.entries.map(entry => {
            if (entry.id !== selected.id) return entry;
            const { organizationId: _oldOrganization, ...previous } = entry;
            return { ...previous, ...verified };
        }) });
    }
    async read(current: () => boolean): Promise<ConnectionOutcome> {
        try {
            const generation = this.generation;
            const { vault } = await this.load();
            return generation === this.generation && current() ? this.view(vault) : { state: 'stale' };
        } catch { return { state: 'unavailable' }; }
    }
    /** Stable vault ownership plus current worker verification; inspection cannot connect a session. */
    async preferenceBinding(current: () => boolean): Promise<SessionPreferenceBinding> {
        try {
            const source = this.capturePreferenceSource(); const epoch = this.active.status().epoch;
            const live = () => source() && current();
            if (!live()) return { state: 'stale' };
            const { vault } = await this.load(); if (!live()) return { state: 'stale' };
            const selected = vault.entries.find(entry => entry.id === vault.selected);
            if (!selected) return { state: 'disconnected' };
            if (selected.id === 'previous-session') return { state: 'legacy' };
            const verified = this.active.matches(selected.connection);
            const retained = verified || this.active.status().state !== 'connected' && await this.active.matchesRetained(selected.connection);
            if (!live()) return { state: 'stale' };
            if (!retained) return { state: 'unavailable' };
            const { vault: after } = await this.load(); if (!live() || !sameSessionVault(after, vault)) return { state: 'stale' };
            const observed = this.active.verifiedIdentity(); const active = observed !== null && this.active.matches(selected.connection);
            if (verified && !active) return { state: 'stale' };
            const identity = active ? observed : selected.connection;
            return deepFreeze({ state: 'ready', context: { scope: { host: 'github.com', entryId: selected.id,
                selectionRevision: vault.revision, accountId: selected.connection.viewerId, repositoryId: selected.connection.repositoryId },
                credentialEpoch: epoch, verified: active }, name: selected.name, account: identity.viewerLogin, repository: identity.repository, organizationId: identity.organizationId ?? null });
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
        if ((input.type === 'connect-role' || input.type === 'disable-role') && !this.roleVerifier) return { state: 'unavailable' };
        if (!current()) return { state: 'stale' };
        if (input.type === 'revoke-all') {
            try { await this.revokeAll(capture, current); return this.read(current); } catch { return { state: 'unavailable' }; }
        }
        if (this.busy) return { state: 'conflict' };
        this.busy = true; this.invalidatePreferenceSource(); const generation = this.generation;
        const credentials = new CredentialEpochFence(() => this.active.status().epoch);
        const live = () => generation === this.generation && current() && credentials.current();
        const intent = { ...input }; let admitted = false; let trace: SessionOperationTrace | null = null; let changedActive = false;
        const cleanup = async () => { if (changedActive && credentials.current()) await this.active.revoke(credentials.follow(trace), 'cleanup-active'); };
        try {
            const observed = await this.load(); const vault = observed.vault;
            if (!live()) return { state: 'stale' };
            if (vault.revision !== revision || revision >= Number.MAX_SAFE_INTEGER) return { state: 'conflict' };
            const adding = intent.type === 'connect' || intent.type === 'connect-role';
            if (adding && vault.entries.length >= NAMED_SESSION_LIMIT) return { state: 'capacity' };
            if (adding && vault.entries.some(entry => entry.name.toLowerCase() === intent.name.toLowerCase()
                || entry.connection.secret === intent.secret && entry.role !== (intent.type === 'connect-role' ? intent.purpose : 'repository-read'))) return { state: 'invalid' };
            const selected = intent.type === 'select' || intent.type === 'remove' ? vault.entries.find(entry => entry.id === intent.id)
                : intent.type === 'disable-role' && vault.schemaVersion === 2 ? vault.entries.find(entry => entry.id === vault.writeSelections[intent.purpose]) : undefined;
            if ((intent.type === 'select' || intent.type === 'remove') && !selected) return { state: 'invalid' };
            if (intent.type === 'disable-role' && !selected) return this.view(vault);
            const purpose = intent.type === 'connect-role' ? intent.purpose : selected?.role ?? 'repository-read';
            // Optional creation/disable is gated above; loaded schema2 requires its verifier in load().
            admitted = true;
            this.roleProof = null; this.roleVerifier?.invalidate();
            const target = adding ? intent.name : selected?.name ?? vault.entries.find(entry => entry.id === vault.selected)?.name ?? null;
            trace = capture(intent.type, { location: { route: 'connections' }, label: target }, live);
            if (!live()) return { state: 'stale' };
            const changesRead = intent.type === 'connect' || intent.type === 'disconnect' || intent.type === 'select' && purpose === 'repository-read'
                || intent.type === 'remove' && vault.selected === intent.id;
            if (changesRead) {
                changedActive = true;
                const revoked = this.active.revoke(credentials.follow(trace)); this.notify(); await revoked;
                if (!live()) return { state: 'stale' };
                if (this.active.status().state === 'unavailable') return { state: 'unavailable' };
            } else this.notify();
            let entry: PurposeSessionEntry | undefined;
            if (adding || intent.type === 'select') {
                const secret = adding ? intent.secret : selected!.connection.secret;
                const repository = adding ? intent.repository : intent.repository ?? selected!.connection.repository;
                let verified: SessionIdentity | null;
                if (writePurpose(purpose)) {
                    const result = await this.roleVerifier!.verify(purpose, secret, repository, live, selected?.connection);
                    if (!live()) return { state: 'stale' };
                    if (result.state !== 'verified') return { state: result.state };
                    verified = result.identity;
                } else {
                    const result = await this.active.connect(secret, repository, selected?.connection, live, credentials.follow(trace));
                    if (!live()) { await cleanup(); return { state: 'stale' }; }
                    verified = this.active.verifiedIdentity();
                    if (result.state !== 'connected' || !verified) return { state: ['limited', 'cooldown', 'budget'].includes(result.state)
                        ? result.state as 'limited' | 'cooldown' | 'budget' : 'unavailable' };
                    const preference = sessionStep(trace, 'save-repository-preference');
                    if (preference) await this.ports.connected(verified.repositoryId, live, preference); else await this.ports.connected(verified.repositoryId, live);
                }
                const id = selected && selected.id !== 'previous-session' ? selected.id : this.ports.identifier();
                if (!localIdentifier(id) || id === 'previous-session' || ((!selected || selected.id !== id) && vault.entries.some(entry => entry.id === id))) { await cleanup(); return { state: 'unavailable' }; }
                entry = { id, name: adding ? intent.name : selected!.name, host: 'github.com', role: purpose, connection: { schemaVersion: 1, secret, ...verified } };
            }
            const proposed = planSessionVault(vault, intent, entry);
            if (!live()) { await cleanup(); return { state: 'stale' }; }
            // A read-back can establish an observed save after lost acknowledgement; never repeat the write.
            // The sole native owner validates even a rejected plan before any queue admission.
            const saved = await this.vault.save(observed, proposed, live, () => sessionStep(trace, 'save-vault'));
            if (saved.state !== 'saved') { await cleanup(); return { state: saved.state }; }
            if (saved.fact.observation !== 'committed') { await cleanup(); return { state: 'unknown' }; }
            if (!live()) { await cleanup(); return { state: 'stale' }; }
            if (intent.type === 'select' && writePurpose(purpose)) this.roleProof = { vault: saved.candidate, purpose, epoch: this.active.status().epoch };
            return this.view(saved.candidate);
        } catch { await cleanup(); return { state: 'unavailable' }; }
        finally { this.busy = false; if (admitted) this.notify(); }
    }
    /** Permission removal is independent of preference-schema or center editing availability. */
    async revokeAll(observe?: ObserveSessionOperation, current: () => boolean = () => true): Promise<void> {
        this.invalidatePreferenceSource(); this.roleProof = null; this.roleVerifier?.invalidate();
        const generation = ++this.generation; const live = () => generation === this.generation && current();
        let trace: SessionOperationTrace | null = null;
        try { trace = observe?.('revoke-all', { location: { route: 'connections' }, label: null }, live) ?? null; } catch { /* Removal remains independent of recording. */ }
        const removal = this.active.revoke(trace);
        try {
            const removed = await this.vault.forget(sessionStep(trace, 'remove-vault')); await removal;
            if (removed.observation !== 'committed' || this.active.status().state === 'unavailable') throw new Error('protected-removal-unavailable');
        } finally { await removal; this.notify(); }
    }
}
