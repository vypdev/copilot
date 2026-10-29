import type { HistoryMessage } from '../domain/history_protocol.ts';
import type { CenterBinding, CenterClient, CenterController } from './center_controller.ts';
import type { CollectionHistory } from './collection_history.ts';
import type { HistoryControls } from './history_controls.ts';

/** Reached only through the extension-origin gateway and an authorized native client binding. */
export class HistoryGateway {
    constructor(private readonly controller: CenterController, private readonly history: CollectionHistory, private readonly controls: HistoryControls) {}
    async handle(message: HistoryMessage, identity: CenterClient, binding: CenterBinding): Promise<unknown> {
        const current = () => this.controller.authorize(message.clientId, binding, identity.controllerEpoch)?.credentialEpoch === identity.credentialEpoch;
        if (message.method === 'center.history.read') return this.history.read(message.kind, current);
        if (identity.role !== 'editor') return { state: 'denied' };
        if (message.credentialEpoch !== identity.credentialEpoch) return { state: 'stale' };
        if (message.method === 'center.collection.result') return this.controls.collection.inspect(message.operationId, message.clientId);
        if (message.method === 'center.history.clear.result') return this.controls.clear.inspect(message.operationId, message.clientId);
        if (message.method === 'center.collection.preview') return this.controls.previewCollection(message.kind, message.action, message.clientId);
        if (message.method === 'center.history.clear.preview') return this.controls.previewClear(message.kind, message.clientId);
        if (message.method === 'center.collection.confirm') return this.controls.collection.confirm(message.operationId, message.clientId);
        if (message.method === 'center.collection.cancel') return this.controls.collection.cancel(message.operationId, message.clientId);
        if (message.method === 'center.history.clear.confirm') return this.controls.clear.confirm(message.operationId, message.clientId);
        return this.controls.clear.cancel(message.operationId, message.clientId);
    }
}
