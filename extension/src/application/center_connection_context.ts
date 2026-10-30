import type { CenterIdentity } from '../domain/center_reply.ts';
import type { ConnectionMessage } from '../domain/center_protocol.ts';
import { connectionIntent, decodeConnections, type ConnectionIntent, type ConnectionOutcome } from '../domain/named_sessions.ts';

export type ConnectionInput = ConnectionIntent | null | (() => Promise<unknown>);
export type ConnectionContextResult = { readonly state: 'stale' }
    | { readonly state: 'not-sent'; readonly issue: 'unavailable' | 'denied' | 'invalid' }
    | { readonly state: 'received'; readonly submitted: boolean; readonly response: ConnectionOutcome | null };
/** Lazy native gesture input and wire acquisition; ownership, publication and lifecycle stay with CenterClient. */
export async function requestConnectionContext(input: ConnectionInput, revision: number, owner: CenterIdentity, current: () => boolean,
    request: (message: ConnectionMessage) => Promise<unknown>): Promise<ConnectionContextResult> {
    if (!current()) return { state: 'stale' };
    let intent: unknown;
    try { intent = typeof input === 'function' ? await input() : input; }
    catch { return { state: 'not-sent', issue: 'unavailable' }; }
    if (!current()) return { state: 'stale' };
    if (input && intent === null) return { state: 'not-sent', issue: 'denied' };
    if (intent !== null && !connectionIntent(intent)) return { state: 'not-sent', issue: 'invalid' };
    const response = decodeConnections(await request(intent ? { version: 1, method: 'center.connections.change',
        clientId: owner.clientId, controllerEpoch: owner.controllerEpoch, credentialEpoch: owner.credentialEpoch, expectedRevision: revision, intent }
        : { version: 1, method: 'center.connections.read', clientId: owner.clientId }));
    return current() ? { state: 'received', submitted: intent !== null, response } : { state: 'stale' };
}
