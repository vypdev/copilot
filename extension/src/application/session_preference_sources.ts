import type { SettingsLoad } from '../domain/settings.ts';
import type { SessionPreferenceBinding } from '../domain/session_preference_binding.ts';
import { sameSettingsContent } from '../domain/settings_operation.ts';
import type { SettingsRepository } from './settings_repository.ts';
import type { NamedSessions } from './named_sessions.ts';
import type { SettingsMutationReservation } from './settings_mutation_queue.ts';

export interface SessionPreferenceReviewSource { readonly settings: SettingsLoad | null; readonly binding: SessionPreferenceBinding }
/** Source acquisition has no provider/credential mutation. Only ready settings become effective values. */
export class SessionPreferenceSources {
    constructor(private readonly settings: SettingsRepository, private readonly connections: NamedSessions) {}
    capture(): () => boolean { return this.connections.capturePreferenceSource(); }
    reserve(): SettingsMutationReservation | null { return this.settings.reserveMutations(); }
    async read(current: () => boolean): Promise<SessionPreferenceReviewSource | null> {
        try {
            if (current() !== true) return null;
            let settings: SettingsLoad | null = null;
            try { settings = await this.settings.read(); } catch { /* Clear/adoption can inspect their own native data without invented saved preferences. */ }
            if (current() !== true) return null;
            const binding = await this.connections.preferenceBinding(current); if (current() !== true || binding.state === 'stale') return null;
            return { settings, binding };
        } catch { return null; }
    }
}
export function sameSessionPreferenceReviewSource(left: SessionPreferenceReviewSource, right: SessionPreferenceReviewSource): boolean {
    return JSON.stringify(left.binding) === JSON.stringify(right.binding) && (left.settings === null || right.settings === null ? left.settings === right.settings
        : left.settings.state === right.settings.state && (left.settings.state !== 'ready' || right.settings.state === 'ready'
            && left.settings.settings.revision === right.settings.settings.revision && sameSettingsContent(left.settings.settings, right.settings.settings)));
}
