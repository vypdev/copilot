import { copyNativeSessionVault, sameNativeSessionVault, type NativeSessionVault as SessionVaultSnapshot } from '../domain/purpose_session_vault.ts';
import { validSession } from '../domain/session.ts';
import { deepFreeze } from '../domain/value.ts';
import type { StoragePort } from './runtime_ports.ts';
import { SESSION_KEY } from './protected_session.ts';
import { protectedMutation, type ProtectedMutationFact, type ProtectedMutationTrace } from './protected_mutation.ts';

export const NAMED_SESSIONS_KEY = 'copilot.named-sessions.v1';
export interface NativeVaultObservation { readonly present: boolean; readonly vault: SessionVaultSnapshot }
export type NativeVaultSave = { readonly state: 'saved'; readonly candidate: SessionVaultSnapshot; readonly fact: ProtectedMutationFact }
    | { readonly state: 'stale' | 'conflict' | 'unavailable' };

/** The named-session owner shares this single queue for all purposes and physical forgetting. */
export class NativeSessionVault {
    private persistence: Promise<unknown> = Promise.resolve();
    constructor(private readonly store: StoragePort, private readonly protectedArea: () => Promise<boolean>) {}
    private persist<T>(operation: () => Promise<T>): Promise<T> {
        // Save contains native failures; forget uses the total protected-mutation primitive.
        const next = this.persistence.then(operation); this.persistence = next; return next;
    }
    async read(): Promise<NativeVaultObservation> {
        if (await this.protectedArea() !== true) throw new Error('protected-storage-unavailable');
        const raw = await this.store.get(NAMED_SESSIONS_KEY);
        if (raw === undefined) {
            const previous = await this.store.get(SESSION_KEY);
            const vault: SessionVaultSnapshot = validSession(previous) ? { schemaVersion: 1, revision: 0, selected: 'previous-session', entries: [{
                id: 'previous-session', name: 'GitHub', host: 'github.com', role: 'repository-read', connection: previous }] }
                : { schemaVersion: 1, revision: 0, selected: null, entries: [] };
            return deepFreeze({ present: false, vault });
        }
        const vault = copyNativeSessionVault(raw);
        if (!vault) throw new Error('protected-vault-invalid');
        return Object.freeze({ present: true, vault });
    }
    save(before: NativeVaultObservation, proposed: unknown, current: () => boolean,
        trace: () => ProtectedMutationTrace | null = () => null): Promise<NativeVaultSave> {
        const expected = copyNativeSessionVault(proposed);
        if (!expected || expected.revision !== before.vault.revision + 1 || expected.schemaVersion < before.vault.schemaVersion) return Promise.resolve({ state: 'unavailable' });
        return this.persist(async () => {
            try {
                if (current() !== true) return { state: 'stale' };
                const protectedArea = await this.protectedArea(); if (current() !== true) return { state: 'stale' };
                if (protectedArea !== true) return { state: 'unavailable' };
                const observed = await this.store.get(NAMED_SESSIONS_KEY); if (current() !== true) return { state: 'stale' };
                if (before.present ? !sameNativeSessionVault(observed, before.vault) : observed !== undefined) return { state: 'conflict' };
                let observer: ProtectedMutationTrace | null = null;
                try { observer = trace(); } catch { /* A secondary observer cannot reject an otherwise admitted native mutation. */ }
                if (current() !== true) return { state: 'stale' };
                const fact = await protectedMutation(() => this.store.set(NAMED_SESSIONS_KEY, expected),
                    async () => sameNativeSessionVault(await this.store.get(NAMED_SESSIONS_KEY), expected), observer);
                return { state: 'saved', candidate: expected, fact };
            } catch { return { state: 'unavailable' }; }
        });
    }
    /** Explicit forgetting is independent from unreadable schemas or failed protection inspection. */
    forget(trace?: ProtectedMutationTrace | null): Promise<ProtectedMutationFact> {
        return this.persist(() => protectedMutation(() => this.store.remove(NAMED_SESSIONS_KEY),
            async () => await this.store.get(NAMED_SESSIONS_KEY) === undefined, trace));
    }
}
