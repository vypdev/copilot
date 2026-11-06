import type { PauseMessage } from '../domain/temporary_pause_protocol.ts';
import type { PauseTabList } from '../domain/temporary_pause_controls.ts';
import type { CenterBinding, CenterClient, CenterController } from './center_controller.ts';
import type { TemporaryPauseStore } from './temporary_pause_store.ts';
import type { TemporaryPauseReviews } from './temporary_pause_reviews.ts';

export interface PauseTargetReader { list(current: () => boolean): Promise<PauseTabList> }
/** Native origin/binding is admitted by the parent; editing still requires this exact current owner and epoch. */
export class TemporaryPauseGateway {
    constructor(private readonly controller: CenterController, private readonly store: TemporaryPauseStore,
        private readonly reviews: TemporaryPauseReviews, private readonly targets: PauseTargetReader) {}
    invalidate(): void { this.reviews.invalidate(); }
    invalidateTab(tabId: number): void { this.reviews.invalidateTab(tabId); }
    async handle(message: PauseMessage, identity: CenterClient, binding: CenterBinding): Promise<unknown> {
        const current = () => this.controller.authorize(identity.clientId, binding, identity.controllerEpoch)?.credentialEpoch === identity.credentialEpoch;
        if (message.method === 'center.pauses.read') {
            if (!current()) return { state: 'stale' };
            const { loaded, precaution, pending } = await this.store.inspect(); if (!current()) return { state: 'stale' };
            const targets = await this.targets.list(current); if (!current()) return { state: 'stale' };
            return { state: 'ready', loaded, precaution, pending, targets };
        }
        if (identity.role !== 'editor') return { state: 'denied' };
        if (message.credentialEpoch !== identity.credentialEpoch) return { state: 'stale' };
        if (message.method === 'center.pauses.preview') return this.reviews.preview(message.intent, message.clientId, message.expectedRevision);
        if (message.method === 'center.pauses.confirm') return this.reviews.confirm(message.operationId, message.expectedRevision, message.clientId);
        if (message.method === 'center.pauses.cancel') return this.reviews.cancel(message.operationId, message.expectedRevision, message.clientId);
        return this.reviews.inspect(message.operationId, message.expectedRevision, message.clientId);
    }
}
