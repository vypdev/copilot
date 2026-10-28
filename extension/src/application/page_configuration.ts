import { pageProfileContext, runtimeConfiguration, type PageRequest, type RuntimeConfiguration } from '../domain/runtime_configuration.ts';
import type { ReadCancellation } from './read_ports.ts';
import type { ProtectedSessionService } from './protected_session.ts';
import type { SettingsRepository } from './settings_repository.ts';

/** One admission policy for rendered preferences and actual GETs. No provider authority from DOM metadata. */
export class PageConfigurationService {
    constructor(private readonly settings: SettingsRepository, private readonly sessions: ProtectedSessionService) {}
    async resolve(message: PageRequest, cancellation: ReadCancellation, current: () => boolean, active: boolean, online: boolean): Promise<RuntimeConfiguration | null> {
        const loaded = await this.settings.read();
        if (!current() || loaded.state !== 'ready') return null;
        const settings = loaded.settings;
        const project = (identity: Parameters<typeof runtimeConfiguration>[2], restricted = false) =>
            runtimeConfiguration(settings, message, identity, this.sessions.status().epoch, restricted);
        const standalone = project(null);
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
        return current() && result.epoch === this.sessions.status().epoch && observed.state === 'ready'
            && observed.settings.revision === settings.revision ? result : null;
    }
}
