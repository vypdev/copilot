import { pageProfileContext, runtimeConfiguration, type PageRequest, type RuntimeConfiguration } from '../domain/runtime_configuration.ts';
import { nativePauseProvenance, type TemporaryPauseObservation } from '../domain/temporary_pause_observation.ts';
import { sameSettingsContent } from '../domain/settings_operation.ts';
import type { RuntimeRestriction } from '../domain/runtime_provenance.ts';
import { resolveProfile } from '../domain/profile_resolution.ts';
import type { ReadCancellation } from './read_ports.ts';
import type { ProtectedSessionService } from './protected_session.ts';
import type { SettingsRepository } from './settings_repository.ts';
import type { TemporaryPauseReader } from './temporary_pause_reader.ts';
import type { SessionPreferenceAdmission, SessionPreferenceAdmissionView } from './session_preference_admission.ts';
import { UNAVAILABLE_SESSION_PREFERENCE_PROVENANCE } from '../domain/session_preference_provenance.ts';

/** Rendered facts and actual GETs share admission; explaining a veto never restores a credential. */
export class PageConfigurationService {
    constructor(private readonly settings: SettingsRepository, private readonly sessions: ProtectedSessionService, private readonly pauses?: TemporaryPauseReader,
        private readonly sessionPreferences?: SessionPreferenceAdmission) {}
    async resolve(message: PageRequest, cancellation: ReadCancellation, current: () => boolean, active: boolean, online: boolean, nativeTabId?: number): Promise<RuntimeConfiguration | null> {
        const loaded = await this.settings.read();
        if (!current() || loaded.state !== 'ready') return null;
        const settings = loaded.settings;
        const observe = async (): Promise<TemporaryPauseObservation> => this.pauses?.observe() ?? { condition: 'unavailable', loaded: { state: 'unavailable' } };
        const initial = await observe(); if (!current()) return null;
        const hot = this.sessions.verifiedIdentity();
        let temporary: SessionPreferenceAdmissionView | null = await this.sessionPreferences?.inspect(message, hot, current) ?? null;
        if (!current()) return null;
        const restriction: RuntimeRestriction = { native: nativePauseProvenance(initial, nativeTabId), claimedRepository: false, retainedScope: false,
            session: temporary?.provenance ?? UNAVAILABLE_SESSION_PREFERENCE_PROVENANCE };
        const project = (identity: Parameters<typeof runtimeConfiguration>[2], input = restriction) => {
            const status = this.sessions.status();
            return runtimeConfiguration(settings, message, identity, status.epoch, input, { state: status.state,
                retryAt: ['limited', 'cooldown', 'budget'].includes(status.state) ? status.retryAt ?? null : null }, temporary?.profile ?? undefined);
        };
        const sameNative = (value: TemporaryPauseObservation) => JSON.stringify(initial) === JSON.stringify(value);
        const finish = async (result: RuntimeConfiguration | null): Promise<RuntimeConfiguration | null> => {
            if (!result || !current()) return null;
            const observed = await this.settings.read(); if (!current()) return null;
            const native = await observe();
            const sameTemporary = temporary === null || await this.sessionPreferences!.unchanged(temporary);
            return current() && sameTemporary && result.epoch === this.sessions.status().epoch && observed.state === 'ready'
                && observed.settings.revision === settings.revision && sameSettingsContent(observed.settings, settings) && sameNative(native) ? result : null;
        };
        // Hot verified context is already in memory. Cold vetoes never read credentials merely to explain themselves.
        const standalone = project(hot);
        if (!standalone) return null;
        const claimedRepository = settings.repositories[message.repositoryId]?.paused === true && pageProfileContext(message, hot).repositoryId === null;
        if (standalone.settings.paused || claimedRepository) return finish(project(hot, { ...restriction, claimedRepository }));
        if (message.method === 'page.configuration' && message.inspectOnly === true) return finish(standalone);
        const retained = await this.sessions.retainedIdentity(); if (!current()) return null;
        const scope = pageProfileContext(message, retained);
        if (resolveProfile(settings, scope.repositoryId ? settings.repositories[scope.repositoryId] : undefined, settings.center, scope).paused)
            return finish(project(hot, { ...restriction, retainedScope: true }));
        const connectedCurrent = () => current() && this.pauses?.condition === 'clear' && this.sessionPreferences?.clear === true;
        if (scope.repositoryId && settings.repositories[scope.repositoryId]?.connected === true && active && online && message.visible) {
            if (!sameNative(await observe()) || !connectedCurrent() || !await this.sessionPreferences!.unchanged(temporary!)) return null;
            await this.sessions.start({ cancellation, current: connectedCurrent });
        }
        if (!connectedCurrent()) return null;
        temporary = await this.sessionPreferences!.inspect(message, this.sessions.verifiedIdentity(), connectedCurrent);
        return finish(project(this.sessions.verifiedIdentity(), { ...restriction, session: temporary.provenance }));
    }
}
