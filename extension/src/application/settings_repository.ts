import { DEFAULT_SETTINGS, loadSettings, validSettings, type Settings, type SettingsLoad } from '../domain/settings.ts';
import { sameSettingsContent, settingsOperationId, settingsSnapshot } from '../domain/settings_operation.ts';
import { deepFreeze, keys, natural, record } from '../domain/value.ts';
import type { StoragePort } from './runtime_ports.ts';
import type { SettingsCommit, SettingsInspection, SettingsReceipt } from './settings_transaction_ports.ts';

export const SETTINGS_KEY = 'copilot.settings.v1';
interface Envelope { readonly current: unknown; readonly previous?: unknown; readonly operation?: SettingsReceipt }
function isEnvelope(value: unknown): value is Record<string, unknown> {
    return record(value) && Object.hasOwn(value, 'current') && keys(value, ['current', 'previous', 'operation']);
}
const continueAfterFailure = () => undefined;
/** The migration write was attempted; callers may inspect its observed result without retrying it. */
export class SettingsMigrationError extends Error {
    constructor() { super('settings-migration-unavailable'); }
}
export class SettingsRepository {
    private queue: Promise<unknown> = Promise.resolve();
    constructor(private readonly storage: StoragePort) {}
    async read(): Promise<SettingsLoad> {
        const value = await this.storage.get(SETTINGS_KEY);
        const current = isEnvelope(value) ? value.current : value;
        return loadSettings(current);
    }
    async inspect(): Promise<SettingsInspection> {
        const value = await this.storage.get(SETTINGS_KEY);
        const envelope = isEnvelope(value) ? value : null;
        const loaded = loadSettings(envelope ? envelope.current : value);
        const previous = loadSettings(envelope?.previous);
        const receipt = envelope?.operation;
        const operation = loaded.state === 'ready' && record(receipt) && keys(receipt, ['id', 'beforeRevision'])
            && Object.keys(receipt).length === 2 && settingsOperationId(receipt.id) && natural(receipt.beforeRevision)
            && loaded.settings.revision === receipt.beforeRevision + 1
            ? { id: receipt.id, beforeRevision: receipt.beforeRevision } : null;
        return { loaded, operation, rollback: envelope?.previous !== undefined && previous.state === 'ready' ? previous.settings : null };
    }
    /** One operation receipt and the complete current/rollback pair share one atomic storage set. */
    commit(value: unknown, expectedRevision: number, id: string, current: () => boolean): Promise<SettingsCommit> {
        const admitted = settingsSnapshot(value);
        if (!settingsOperationId(id) || !natural(expectedRevision) || !admitted) return Promise.resolve({ state: 'invalid' });
        const operation = this.queue.then(async (): Promise<SettingsCommit> => {
            const eligible = () => { try { return current() === true; } catch { return false; } };
            let inspected: SettingsInspection;
            try { inspected = await this.inspect(); } catch { return { state: 'unavailable' }; }
            if (!eligible()) return { state: 'stale' };
            if (inspected.loaded.state !== 'ready' || inspected.loaded.migrated) return { state: 'invalid' };
            const before = inspected.loaded.settings;
            const next = { ...admitted, revision: expectedRevision + 1 };
            if (!validSettings(next)) return { state: 'invalid' };
            if (inspected.operation?.id === id) {
                return inspected.operation.beforeRevision === expectedRevision && sameSettingsContent(before, next)
                    ? { state: 'replayed', revision: before.revision } : { state: 'invalid' };
            }
            if (before.revision !== expectedRevision) return { state: 'conflict' };
            const envelope: Envelope = { current: deepFreeze(JSON.parse(JSON.stringify(next)) as Settings), previous: before,
                operation: { id, beforeRevision: expectedRevision } };
            let acknowledgement: 'accepted' | 'unknown' = 'accepted';
            try { await this.storage.set(SETTINGS_KEY, envelope); } catch { acknowledgement = 'unknown'; }
            // Read even after an acknowledgement; partial or missing persistence is never success.
            try {
                const observed = await this.inspect();
                if (observed.loaded.state === 'ready' && observed.operation?.id === id
                    && observed.operation.beforeRevision === expectedRevision && sameSettingsContent(observed.loaded.settings, next)) {
                    return { state: 'committed', revision: next.revision, acknowledgement, current: eligible() };
                }
                return { state: 'unknown', acknowledgement, observedRevision: observed.loaded.state === 'ready' ? observed.loaded.settings.revision : null,
                    observation: observed.loaded.state !== 'ready' ? 'unavailable'
                        : sameSettingsContent(observed.loaded.settings, before) ? 'unchanged' : 'changed' };
            } catch { return { state: 'unknown', acknowledgement, observedRevision: null, observation: 'unavailable' }; }
        });
        this.queue = operation.catch(continueAfterFailure);
        return operation;
    }
    write(value: unknown, expectedRevision: number): Promise<Settings> {
        return this.update(settings => {
            if (settings.revision !== expectedRevision) throw new Error('settings-conflict-or-invalid');
            return value;
        });
    }
    /** Serialize application mutations against the latest complete settings envelope. */
    update(change: (settings: Settings) => unknown, current: () => boolean = () => true): Promise<Settings> {
        const operation = this.queue.then(async () => {
            const loaded = await this.read();
            if (loaded.state !== 'ready' || !current()) throw new Error('settings-conflict-or-invalid');
            const value = change(loaded.settings);
            if (loaded.settings.revision >= Number.MAX_SAFE_INTEGER || !validSettings(value)) throw new Error('settings-conflict-or-invalid');
            const next = deepFreeze({ ...value, revision: loaded.settings.revision + 1 });
            const envelope: Envelope = { current: next, previous: loaded.settings };
            // One storage operation atomically publishes current + one nonsecret rollback.
            await this.storage.set(SETTINGS_KEY, envelope);
            return next;
        });
        this.queue = operation.catch(continueAfterFailure);
        return operation;
    }
    initialize(): Promise<SettingsLoad> {
        const operation = this.queue.then(async () => {
            const loaded = await this.read();
            if (loaded.state === 'ready' && loaded.migrated) {
                const stored = await this.storage.get(SETTINGS_KEY);
                const previous = isEnvelope(stored) ? stored.current : stored;
                try { await this.storage.set(SETTINGS_KEY, { current: loaded.settings, previous }); }
                catch { throw new SettingsMigrationError(); }
            }
            return loaded;
        });
        this.queue = operation.catch(continueAfterFailure);
        return operation;
    }
    async rollback(expectedRevision: number): Promise<Settings> {
        const envelope = await this.storage.get(SETTINGS_KEY);
        const previous = record(envelope) ? loadSettings(envelope.previous) : loadSettings(undefined);
        if (previous.state !== 'ready' || previous.settings === DEFAULT_SETTINGS) throw new Error('settings-no-rollback');
        return this.write(previous.settings, expectedRevision);
    }
}
