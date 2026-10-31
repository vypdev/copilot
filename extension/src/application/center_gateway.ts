import { MAX_CENTER_RESPONSE_BYTES, type CenterRequestMessage } from '../domain/center_protocol.ts';
import type { NamedSessions } from './named_sessions.ts';
import type { Sender } from '../domain/protocol.ts';
import { jsonBytesWithin } from '../domain/value.ts';
import { centerBinding, CenterController } from './center_controller.ts';
import { SettingsOperations } from './settings_operations.ts';
import { SettingsRepository, SettingsMigrationError } from './settings_repository.ts';
import { isHistoryMessage } from '../domain/history_protocol.ts';
import type { HistoryGateway } from './history_gateway.ts';
import type { CurrentOperations } from './current_operations.ts';
import type { HelperSamples } from './helper_samples.ts';
import { isPauseMessage } from '../domain/temporary_pause_protocol.ts';
import type { TemporaryPauseGateway } from './temporary_pause_gateway.ts';
import { isSessionPreferenceMessage } from '../domain/session_preference_protocol.ts';
import type { SessionPreferenceGateway } from './session_preference_gateway.ts';
import { isApiCacheMessage } from '../domain/api_cache_protocol.ts';
import type { ApiCacheReviews } from './api_cache_reviews.ts';

/** Called only after native extension-origin admission by MessageGateway. */
export class CenterGateway {
    constructor(private readonly controller: CenterController, private readonly operations: SettingsOperations,
        private readonly settings: SettingsRepository, private readonly connections?: NamedSessions, private readonly history?: HistoryGateway,
        private readonly current?: CurrentOperations, private readonly helpers?: HelperSamples, private readonly pauses?: TemporaryPauseGateway, private readonly sessionPreferences?: SessionPreferenceGateway,
        private readonly cache?: ApiCacheReviews) {}
    invalidatePreferenceSources(): void { this.sessionPreferences?.invalidate(); }
    releaseTab(id: number, legacyOnly = false): void { this.pauses?.invalidateTab(id); this.controller.releaseTab(id, legacyOnly); }
    releaseSource(source: Readonly<object>): void { this.controller.releaseSource(source); }
    shutdown(): void { this.cache?.stop(); this.sessionPreferences?.invalidate(); this.pauses?.invalidate(); this.current?.stop(); this.controller.shutdown(); }
    async handle(message: CenterRequestMessage, sender: Sender, source?: Readonly<object>): Promise<unknown> {
        try {
            const result = await this.dispatch(message, sender, source);
            return jsonBytesWithin(result, MAX_CENTER_RESPONSE_BYTES) ? result : { state: 'unavailable' };
        } catch { return { state: 'unavailable' }; }
    }
    private async dispatch(message: CenterRequestMessage, sender: Sender, source?: Readonly<object>): Promise<unknown> {
        const native = centerBinding(sender);
        if (!native) return { state: 'rejected' };
        const binding = source === undefined ? native : { ...native, source };
        if (message.method === 'center.open') return this.controller.open(binding);
        if (message.method === 'center.claim') return this.controller.claim(message.clientId, binding, message.controllerEpoch);
        if (message.method === 'center.close') return this.controller.close(message.clientId, binding, message.controllerEpoch);
        const epoch = message.method === 'center.read' || message.method === 'center.operation.read' || message.method === 'center.health.read' || message.method === 'center.connections.read' || message.method === 'center.history.read' || message.method === 'center.pauses.read' || message.method === 'center.session-preferences.read' ? undefined : message.controllerEpoch;
        const client = this.controller.authorize(message.clientId, binding, epoch);
        if (!client) return { state: 'stale' };
        if (message.method === 'center.operation.read') return this.current?.read(client.clientId) ?? { state: 'unavailable' };
        if (message.method === 'center.health.read') return binding.tabId === null ? { state: 'empty' } : this.helpers?.read(binding.tabId) ?? { state: 'unavailable' };
        if (isHistoryMessage(message)) return this.history?.handle(message, client, binding) ?? { state: 'unavailable' };
        if (isPauseMessage(message)) return this.pauses?.handle(message, client, binding) ?? { state: 'unavailable' };
        if (isSessionPreferenceMessage(message)) return this.sessionPreferences?.handle(message, client, binding) ?? { state: 'unavailable' };
        if (isApiCacheMessage(message)) {
            if (client.role !== 'editor') return { state: 'denied' };
            if (client.credentialEpoch !== message.credentialEpoch) return { state: 'stale' };
            if (!this.cache) return { state: 'unavailable' };
            if (message.method === 'center.cache.preview') return this.cache.preview(client.clientId);
            if (message.method === 'center.cache.confirm') return this.cache.confirm(message.operationId, client.clientId);
            if (message.method === 'center.cache.cancel') return this.cache.cancel(message.operationId, client.clientId);
            return this.cache.inspect(message.operationId, client.clientId);
        }
        if (message.method === 'center.connections.read') return this.connections?.read(() =>
            this.controller.authorize(message.clientId, binding, client.controllerEpoch) !== null) ?? { state: 'unavailable' };
        if (message.method === 'center.connections.change') {
            if (client.role !== 'editor') return { state: 'denied' };
            if (client.credentialEpoch !== message.credentialEpoch) return { state: 'stale' };
            return this.connections?.change(message.intent, message.expectedRevision, () =>
                this.controller.authorize(message.clientId, binding, client.controllerEpoch)?.role === 'editor',
            (action, target, live) => this.current?.observeSession(client.clientId, action, target, live, () => this.controller.fence(client.clientId)) ?? null) ?? { state: 'unavailable' };
        }
        if (message.method === 'center.read') {
            // A failed migration acknowledgement is not proof that storage is unavailable.
            // Read back once: preserve an unmigrated record as read-only, or report observed current data.
            try { await this.settings.initialize(); }
            catch (error) { if (!(error instanceof SettingsMigrationError)) return { state: 'unavailable' }; }
            const inspection = await this.settings.inspect();
            const current = this.controller.authorize(message.clientId, binding, client.controllerEpoch);
            if (!current || current.credentialEpoch !== client.credentialEpoch) return { state: 'stale' };
            this.operations.observeInspection(client.clientId, inspection);
            const verified = this.controller.authorize(message.clientId, binding, client.controllerEpoch);
            if (!verified || verified.credentialEpoch !== client.credentialEpoch) return { state: 'stale' };
            return { ...verified, loaded: inspection.loaded, rollbackAvailable: inspection.loaded.state === 'ready' && inspection.rollback !== null, lastOperation: inspection.operation };
        }
        if (client.role !== 'editor') return { state: 'denied' };
        if (message.credentialEpoch !== client.credentialEpoch) return { state: 'stale' };
        if (message.method === 'center.preview') return this.operations.preview(message.intent, message.clientId, message.expectedRevision);
        if (message.method === 'center.confirm') return this.operations.confirm(message.operationId, message.expectedRevision, message.clientId);
        return this.operations.cancel(message.operationId, message.expectedRevision, message.clientId);
    }
}
