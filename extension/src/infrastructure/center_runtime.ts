import type { BrowserApi } from '../adapters/browser/api.ts';
import { CenterController } from '../application/center_controller.ts';
import { CenterGateway } from '../application/center_gateway.ts';
import { SettingsOperations } from '../application/settings_operations.ts';
import type { SettingsRepository } from '../application/settings_repository.ts';
import type { ProtectedSessionService } from '../application/protected_session.ts';

/** Random authority identifiers are acquired only in the native background composition. */
export function centerIdentifier(): string {
    return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function createCenter(api: BrowserApi, settings: SettingsRepository, sessions: ProtectedSessionService, notify: () => void): CenterGateway {
    const controller = new CenterController({ now: () => Date.now(), identifier: centerIdentifier,
        permitted: () => api.extension?.inIncognitoContext !== true, credentialEpoch: () => sessions.status().epoch,
        changed: () => { operations.invalidate(); notify(); } });
    const operations = new SettingsOperations(settings, { now: () => Date.now(), identifier: centerIdentifier,
        fence: id => controller.fence(id), notify });
    return new CenterGateway(controller, operations, settings);
}
