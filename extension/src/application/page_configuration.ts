import { pageProfileContext, runtimeConfiguration, type PageRequest, type RuntimeConfiguration } from '../domain/runtime_configuration.ts';
import type { ReadCancellation } from './read_ports.ts';
import type { ProtectedSessionService } from './protected_session.ts';
import type { SettingsRepository } from './settings_repository.ts';
import { temporaryPauseRestriction } from '../domain/temporary_pauses.ts';
import type { TemporaryPauseReader } from './temporary_pause_reader.ts';

/** One admission policy for rendered preferences and actual GETs. No provider authority from DOM metadata. */
export class PageConfigurationService {
    constructor(private readonly settings: SettingsRepository, private readonly sessions: ProtectedSessionService, private readonly pauses?: TemporaryPauseReader) {}
    async resolve(message: PageRequest, cancellation: ReadCancellation, current: () => boolean, active: boolean, online: boolean, nativeTabId?: number): Promise<RuntimeConfiguration | null> {
        const loaded = await this.settings.read();
        if (!current() || loaded.state !== 'ready') return null;
        const settings = loaded.settings;
        const project = (identity: Parameters<typeof runtimeConfiguration>[2], restricted = false) =>
            runtimeConfiguration(settings, message, identity, this.sessions.status().epoch, restricted);
        const standalone = project(null);
        const pauses = await this.pauses?.read();
        if (!current()) return null;
        if (pauses && temporaryPauseRestriction(pauses, nativeTabId).paused) return project(null, true);
        // These can restrict a claimed scope before any protected or provider work, never enable it.
        if (standalone.settings.paused || settings.repositories[message.repositoryId]?.paused === true) return project(null, true);
        const retained = await this.sessions.retainedIdentity();
        if (!current()) return null;
        if (project(retained).settings.paused) return project(null, true);
        const scope = pageProfileContext(message, retained);
        if (scope.repositoryId && settings.repositories[scope.repositoryId]?.connected === true && active && online && message.visible) {
            await this.sessions.start({ cancellation, current });
        }
        if (!current()) return null;
        const result = project(this.sessions.verifiedIdentity());
        const observed = await this.settings.read();
        const finalPauses = await this.pauses?.read();
        return current() && result.epoch === this.sessions.status().epoch && observed.state === 'ready'
            && observed.settings.revision === settings.revision && JSON.stringify(pauses) === JSON.stringify(finalPauses) ? result : null;
    }
}
