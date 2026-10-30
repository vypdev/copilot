import type { CenterIdentity } from '../domain/center_reply.ts';
import type { HistoryRequest } from '../domain/history_request.ts';
import type { HistoryMessage } from '../domain/history_protocol.ts';
import { HISTORY_EFFECTS } from '../domain/history_protocol.ts';
import type { PauseRequest } from '../domain/pause_request.ts';
import type { PauseMessage } from '../domain/temporary_pause_protocol.ts';
import { PAUSE_EFFECTS } from '../domain/pause_request.ts';
import { SESSION_PREFERENCE_EFFECTS, type SessionPreferenceRequest } from '../domain/session_preference_request.ts';
import type { SessionPreferenceMessage } from '../domain/session_preference_protocol.ts';

type Reply = Promise<Record<string, unknown> | null>;
/** Preserve existing history transport semantics while keeping reusable native identity out of its callers. */
export function requestHistoryContext(input: HistoryRequest, owner: CenterIdentity | null, stopped: boolean, blocked: boolean,
    request: (message: HistoryMessage) => Reply): Reply {
    if (stopped || !owner) return Promise.resolve({ state: 'stale' });
    if (HISTORY_EFFECTS[input.method] && blocked) return Promise.resolve({ state: 'busy' });
    return request(input.method === 'center.history.read' ? { ...input, version: 1, clientId: owner.clientId }
        : { ...input, version: 1, clientId: owner.clientId, controllerEpoch: owner.controllerEpoch, credentialEpoch: owner.credentialEpoch });
}
/** Ordinary preference reads cannot block independent native safety controls. Actual mutations/reviews still exclude them. */
export async function requestPauseContext(input: PauseRequest, owner: CenterIdentity | null, stopped: boolean, blocked: boolean,
    request: (message: PauseMessage) => Reply, current: () => CenterIdentity | null): Reply {
    if (stopped || !owner) return { state: 'stale' };
    if (input.method !== 'center.pauses.read' && owner.role !== 'editor') return { state: 'denied' };
    if (PAUSE_EFFECTS[input.method] && blocked) return { state: 'busy' };
    const result = await request(input.method === 'center.pauses.read' ? { ...input, version: 1, clientId: owner.clientId }
        : { ...input, version: 1, clientId: owner.clientId, controllerEpoch: owner.controllerEpoch, credentialEpoch: owner.credentialEpoch });
    const after = current();
    return (['clientId', 'controllerEpoch', 'credentialEpoch', 'role'] as const).every(key => after?.[key] === owner[key]) ? result : { state: 'stale' };
}
/** Same private native owner and independent read/result admission, with no caller-provided controller fields. */
export async function requestSessionPreferenceContext(input: SessionPreferenceRequest, owner: CenterIdentity | null, stopped: boolean, blocked: boolean,
    request: (message: SessionPreferenceMessage) => Reply, current: () => CenterIdentity | null): Reply {
    if (stopped || !owner) return { state: 'stale' };
    if (input.method !== 'center.session-preferences.read' && owner.role !== 'editor') return { state: 'denied' };
    if (SESSION_PREFERENCE_EFFECTS[input.method] && blocked) return { state: 'busy' };
    const result = await request(input.method === 'center.session-preferences.read' ? { ...input, version: 1, clientId: owner.clientId }
        : { ...input, version: 1, clientId: owner.clientId, controllerEpoch: owner.controllerEpoch, credentialEpoch: owner.credentialEpoch });
    const after = current();
    return (['clientId', 'controllerEpoch', 'credentialEpoch', 'role'] as const).every(key => after?.[key] === owner[key]) ? result : { state: 'stale' };
}
