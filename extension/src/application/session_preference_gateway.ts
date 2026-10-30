import type { SessionPreferenceMessage } from '../domain/session_preference_protocol.ts';
import type { SessionPreferenceRead } from '../domain/session_preference_read.ts';
import { sessionPreferenceEffective } from '../domain/session_preference_review.ts';
import { sessionPreferenceRestriction } from '../domain/session_preferences.ts';
import { deepFreeze } from '../domain/value.ts';
import type { CenterBinding, CenterClient, CenterController } from './center_controller.ts';
import type { SessionPreferencesStore } from './session_preferences_store.ts';
import type { SessionPreferenceReviews } from './session_preference_reviews.ts';
import { sameSessionPreferenceReviewSource, type SessionPreferenceSources } from './session_preference_sources.ts';

/** Native-origin admission is the parent's responsibility; role, binding and epoch remain independent gates. */
export class SessionPreferenceGateway {
    constructor(private readonly controller: CenterController, private readonly store: SessionPreferencesStore,
        private readonly reviews: SessionPreferenceReviews, private readonly sources: SessionPreferenceSources) {}
    invalidate(): void { this.reviews.invalidate(); }
    async handle(message: SessionPreferenceMessage, identity: CenterClient, binding: CenterBinding): Promise<unknown> {
        if (message.method === 'center.session-preferences.read') return this.read(identity, binding);
        if (identity.role !== 'editor') return { state: 'denied' };
        if (message.credentialEpoch !== identity.credentialEpoch) return { state: 'stale' };
        if (message.method === 'center.session-preferences.preview') return this.reviews.preview(message.intent, identity.clientId, message.expectedRevision);
        if (message.method === 'center.session-preferences.confirm') return this.reviews.confirm(message.operationId, message.expectedRevision, identity.clientId);
        if (message.method === 'center.session-preferences.cancel') return this.reviews.cancel(message.operationId, message.expectedRevision, identity.clientId);
        return this.reviews.inspect(message.operationId, message.expectedRevision, identity.clientId);
    }
    private async read(identity: CenterClient, binding: CenterBinding): Promise<SessionPreferenceRead | { readonly state: 'stale' }> {
        const source = this.sources.capture();
        const current = () => source() && this.controller.authorize(identity.clientId, binding, identity.controllerEpoch)?.credentialEpoch === identity.credentialEpoch;
        if (!current()) return { state: 'stale' };
        const before = await this.store.inspect(); if (!current()) return { state: 'stale' };
        const snapshot = await this.sources.read(current); if (!current()) return { state: 'stale' };
        const after = await this.store.inspect(); if (!current()) return { state: 'stale' };
        const final = await this.sources.read(current);
        if (!current() || before.witness !== after.witness || JSON.stringify(before.loaded) !== JSON.stringify(after.loaded)
            || (snapshot === null || final === null ? snapshot !== final : !sameSessionPreferenceReviewSource(snapshot, final))) return { state: 'stale' };
        const context = snapshot?.binding.state === 'ready' ? snapshot.binding.context : null;
        return deepFreeze({ state: 'ready', loaded: after.loaded, pending: after.pending, precaution: after.precaution,
            source: snapshot?.binding ?? null, settingsState: snapshot?.settings?.state ?? 'unavailable',
            settingsRevision: snapshot?.settings?.state === 'ready' ? snapshot.settings.settings.revision : null,
            effective: after.loaded.state === 'ready' && snapshot ? sessionPreferenceEffective(snapshot.settings, snapshot.binding, after.loaded.value) : null,
            restriction: sessionPreferenceRestriction(after.loaded, context) });
    }
}
