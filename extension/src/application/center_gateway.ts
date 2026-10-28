import { MAX_CENTER_RESPONSE_BYTES, type CenterMessage, type ConnectionMessage } from '../domain/center_protocol.ts';
import type { NamedSessions } from './named_sessions.ts';
import type { Sender } from '../domain/protocol.ts';
import { jsonBytesWithin } from '../domain/value.ts';
import { centerBinding, CenterController } from './center_controller.ts';
import { SettingsOperations } from './settings_operations.ts';
import { SettingsRepository, SettingsMigrationError } from './settings_repository.ts';

/** Called only after native extension-origin admission by MessageGateway. */
export class CenterGateway {
    constructor(private readonly controller: CenterController, private readonly operations: SettingsOperations,
        private readonly settings: SettingsRepository, private readonly connections?: NamedSessions) {}
    releaseTab(id: number): void { this.controller.releaseTab(id); }
    shutdown(): void { this.controller.shutdown(); }
    async handle(message: CenterMessage | ConnectionMessage, sender: Sender): Promise<unknown> {
        try {
            const result = await this.dispatch(message, sender);
            return jsonBytesWithin(result, MAX_CENTER_RESPONSE_BYTES) ? result : { state: 'unavailable' };
        } catch { return { state: 'unavailable' }; }
    }
    private async dispatch(message: CenterMessage | ConnectionMessage, sender: Sender): Promise<unknown> {
        const binding = centerBinding(sender);
        if (!binding) return { state: 'rejected' };
        if (message.method === 'center.open') return this.controller.open(binding);
        if (message.method === 'center.claim') return this.controller.claim(message.clientId, binding, message.controllerEpoch);
        if (message.method === 'center.close') return this.controller.close(message.clientId, binding, message.controllerEpoch);
        const epoch = message.method === 'center.read' || message.method === 'center.connections.read' ? undefined : message.controllerEpoch;
        const client = this.controller.authorize(message.clientId, binding, epoch);
        if (!client) return { state: 'stale' };
        if (message.method === 'center.connections.read') return this.connections?.read(() =>
            this.controller.authorize(message.clientId, binding, client.controllerEpoch) !== null) ?? { state: 'unavailable' };
        if (message.method === 'center.connections.change') {
            if (client.role !== 'editor') return { state: 'denied' };
            if (client.credentialEpoch !== message.credentialEpoch) return { state: 'stale' };
            return this.connections?.change(message.intent, message.expectedRevision, () =>
                this.controller.authorize(message.clientId, binding, client.controllerEpoch)?.role === 'editor') ?? { state: 'unavailable' };
        }
        if (message.method === 'center.read') {
            // A failed migration acknowledgement is not proof that storage is unavailable.
            // Read back once: preserve an unmigrated record as read-only, or report observed current data.
            try { await this.settings.initialize(); }
            catch (error) { if (!(error instanceof SettingsMigrationError)) return { state: 'unavailable' }; }
            const inspection = await this.settings.inspect();
            const current = this.controller.authorize(message.clientId, binding, client.controllerEpoch);
            if (!current || current.credentialEpoch !== client.credentialEpoch) return { state: 'stale' };
            return { ...current, loaded: inspection.loaded, rollbackAvailable: inspection.loaded.state === 'ready' && inspection.rollback !== null, lastOperation: inspection.operation };
        }
        if (client.role !== 'editor') return { state: 'denied' };
        if (message.credentialEpoch !== client.credentialEpoch) return { state: 'stale' };
        if (message.method === 'center.preview') return this.operations.preview(message.intent, message.clientId, message.expectedRevision);
        if (message.method === 'center.confirm') return this.operations.confirm(message.operationId, message.expectedRevision, message.clientId);
        return this.operations.cancel(message.operationId, message.expectedRevision, message.clientId);
    }
}
