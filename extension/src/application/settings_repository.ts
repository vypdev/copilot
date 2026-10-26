import { DEFAULT_SETTINGS, loadSettings, validSettings, type Settings, type SettingsLoad } from '../domain/settings.ts';
import { deepFreeze, record } from '../domain/value.ts';
import type { StoragePort } from './runtime_ports.ts';

export const SETTINGS_KEY = 'copilot.settings.v1';
interface Envelope { readonly current: unknown; readonly previous?: unknown }
export class SettingsRepository {
    private queue: Promise<unknown> = Promise.resolve();
    constructor(private readonly storage: StoragePort) {}
    async read(): Promise<SettingsLoad> {
        const value = await this.storage.get(SETTINGS_KEY);
        const current = record(value) && Object.hasOwn(value, 'current') ? value.current : value;
        return loadSettings(current);
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
        this.queue = operation.catch(() => undefined);
        return operation;
    }
    initialize(): Promise<SettingsLoad> {
        const operation = this.queue.then(async () => {
            const loaded = await this.read();
            if (loaded.state === 'ready' && loaded.migrated) {
                const previous = await this.storage.get(SETTINGS_KEY);
                await this.storage.set(SETTINGS_KEY, { current: loaded.settings, previous });
            }
            return loaded;
        });
        this.queue = operation.catch(() => undefined);
        return operation;
    }
    async rollback(expectedRevision: number): Promise<Settings> {
        const envelope = await this.storage.get(SETTINGS_KEY);
        const previous = record(envelope) ? loadSettings(envelope.previous) : loadSettings(undefined);
        if (previous.state !== 'ready' || previous.settings === DEFAULT_SETTINGS) throw new Error('settings-no-rollback');
        return this.write(previous.settings, expectedRevision);
    }
}
