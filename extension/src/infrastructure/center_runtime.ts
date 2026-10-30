import type { BrowserApi } from '../adapters/browser/api.ts';
import { CenterController } from '../application/center_controller.ts';
import { CenterGateway } from '../application/center_gateway.ts';
import { SettingsOperations } from '../application/settings_operations.ts';
import type { SettingsRepository } from '../application/settings_repository.ts';
import type { ProtectedSessionService } from '../application/protected_session.ts';
import type { NamedSessions } from '../application/named_sessions.ts';
import { HistoryControls } from '../application/history_controls.ts';
import { HistoryGateway } from '../application/history_gateway.ts';
import type { CollectionHistory } from '../application/collection_history.ts';
import type { CollectionPolicyStore } from '../application/collection_policy_ports.ts';
import { CurrentOperations } from '../application/current_operations.ts';

/** Random authority identifiers are acquired only in the native background composition. */
export function centerIdentifier(): string {
    return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}
export function createCenter(api: BrowserApi, settings: SettingsRepository, sessions: ProtectedSessionService, notify: () => void, connections?: NamedSessions,
    history?: { readonly owner: CollectionHistory; readonly policies: CollectionPolicyStore }): CenterGateway {
    const current = new CurrentOperations({ now: () => Date.now(),
        changed: () => { void api.runtime.sendMessage({ version: 1, method: 'center.operation.invalidated' }).catch(() => undefined); },
        admit: (fact, source) => history?.owner.writer.admit('diagnostics', fact, source) ?? null,
        update: (ticket, fact) => history?.owner.writer.update(ticket, fact),
        // A ticket can only originate from this composition's history writer.
        retention: ticket => history!.owner.writer.retention(ticket) });
    const controller = new CenterController({ now: () => Date.now(), identifier: centerIdentifier,
        permitted: () => api.extension?.inIncognitoContext !== true, credentialEpoch: () => sessions.status().epoch,
        changed: () => { current.invalidate(); operations.invalidate(); controls?.invalidate(); notify(); } });
    const operations = new SettingsOperations(settings, { now: () => Date.now(), identifier: centerIdentifier,
        fence: id => controller.fence(id), notify, observe: (...args) => current.reviewSettings(...args) });
    const controls = history ? new HistoryControls(history.owner, history.policies, { now: () => Date.now(), identifier: centerIdentifier,
        fence: id => controller.fence(id), observe: (...args) => current.reviewCollection(...args), observeClear: (...args) => current.reviewClear(...args) }) : undefined;
    return new CenterGateway(controller, operations, settings, connections, history ? new HistoryGateway(controller, history.owner, controls!) : undefined, current);
}
