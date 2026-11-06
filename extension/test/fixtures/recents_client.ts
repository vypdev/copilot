import { afterEach, vi } from 'vitest';
import { RecentsClient, type RecentsClientPorts } from '../../src/application/recents_client.ts';
import type { CenterIdentity } from '../../src/domain/center_reply.ts';
import type { RecentsPermit } from '../../src/domain/center_visits.ts';

export const VISIT_OWNER: CenterIdentity = { clientId: 'a'.repeat(32), controllerEpoch: 1, credentialEpoch: 1, role: 'editor' };
export const VISIT_PERMIT: RecentsPermit = { state: 'ready', permit: `visit-${'b'.repeat(32)}`, epoch: 0, sequence: 0 };
const clients: RecentsClient[] = [];
afterEach(() => { clients.splice(0).forEach(client => client.stop()); });
export function recentsClientFixture() {
    let owner: CenterIdentity | null = { ...VISIT_OWNER }; let reply: unknown = { ...VISIT_PERMIT };
    const ports = { identity: vi.fn(() => owner), request: vi.fn<RecentsClientPorts['request']>(async message => message.method === 'center.recents.capture' ? reply : { state: 'observed' }), changed: vi.fn() };
    const client = new RecentsClient(ports); clients.push(client);
    return { client, ports, owner: (value: CenterIdentity | null) => { owner = value; }, reply: (value: unknown) => { reply = value; },
        visits: () => ports.request.mock.calls.filter(([message]) => message.method === 'center.recents.observe').map(([message]) => message) };
}
