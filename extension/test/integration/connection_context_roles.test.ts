import { expect, it, vi } from 'vitest';
import { requestConnectionContext } from '../../src/application/center_connection_context.ts';
import type { CenterIdentity } from '../../src/domain/center_reply.ts';
import { connectionsView } from '../../src/domain/named_sessions.ts';
import { purposeVault, purposeEntry } from '../fixtures/credential_roles.ts';

const owner: CenterIdentity = { clientId: 'a'.repeat(32), role: 'editor', controllerEpoch: 2, credentialEpoch: 3 };
it.each([undefined, false, 0, '', { type: 'connect-role', purpose: undefined }, { type: 'connect-role', purpose: 'setup' }].map(value => ({ value })))('an unknown native gesture value $value cannot become a read fallback or optional credential request', async ({ value }) => {
    const request = vi.fn(); expect(await requestConnectionContext(async () => value, 4, owner, () => true, request)).toEqual({ state: 'not-sent', issue: 'invalid' }); expect(request).not.toHaveBeenCalled();
});
it('explicit denied permission remains distinct from malformed authoring and never issues a request', async () => {
    const request = vi.fn(); expect(await requestConnectionContext(async () => null, 4, owner, () => true, request)).toEqual({ state: 'not-sent', issue: 'denied' }); expect(request).not.toHaveBeenCalled();
});
it('a lazy native optional-purpose gesture is validated, stamped by the current owner and decoded without a grant', async () => {
    const entry = purposeEntry('issues-write'); const intent = { type: 'connect-role', purpose: 'issues-write', name: entry.name, secret: entry.connection.secret, repository: entry.connection.repository };
    const request = vi.fn(async () => connectionsView(purposeVault(), false));
    expect(await requestConnectionContext(async () => intent, 4, owner, () => true, request)).toMatchObject({ state: 'received', submitted: true, response: { optionalWrites: { 'issues-write': { state: 'stored' } } } });
    expect(request).toHaveBeenCalledExactlyOnceWith({ version: 1, method: 'center.connections.change', clientId: owner.clientId, controllerEpoch: 2, credentialEpoch: 3, expectedRevision: 4, intent });
});
