import { expect, it, vi } from 'vitest';
import { requestSessionPreferenceContext } from '../../src/application/center_request_context.ts';
import { requestConnectionContext } from '../../src/application/center_connection_context.ts';
import { centerClientFixture } from '../fixtures/center_client.ts';
import type { CenterIdentity } from '../../src/domain/center_reply.ts';
import type { SessionPreferenceMessage } from '../../src/domain/session_preference_protocol.ts';

const owner: CenterIdentity = { clientId: 'a'.repeat(32), controllerEpoch: 1, credentialEpoch: 2, role: 'editor' };
const preview = { method: 'center.session-preferences.preview', expectedRevision: 0, intent: { type: 'clear' } } as const;
it.each(['stopped', 'missing', 'observer', 'held'] as const)('a %s native client cannot acquire session-preference mutation authority from a transport wrapper', async reason => {
    const request = vi.fn(async (_message: SessionPreferenceMessage) => ({ state: 'unavailable' }));
    expect(await requestSessionPreferenceContext(preview, reason === 'missing' ? null : reason === 'observer' ? { ...owner, role: 'observer' } : owner,
        reason === 'stopped', reason === 'held', request, () => owner)).toEqual({ state: reason === 'stopped' || reason === 'missing' ? 'stale' : reason === 'observer' ? 'denied' : 'busy' });
    expect(request).not.toHaveBeenCalled();
});
it('independent metadata reads remain admitted while an effect family is held and use no reusable controller or operation fields', async () => {
    const request = vi.fn(async (_message: SessionPreferenceMessage) => ({ state: 'unavailable' }));
    expect(await requestSessionPreferenceContext({ method: 'center.session-preferences.read' }, owner, false, true, request, () => owner)).toEqual({ state: 'unavailable' });
    expect(request).toHaveBeenCalledExactlyOnceWith({ version: 1, method: 'center.session-preferences.read', clientId: owner.clientId });
});
it('a stale context cannot prompt lazy connection input or a permission gesture even before wire acquisition', async () => {
    const input = vi.fn(async () => null); const request = vi.fn(async () => null);
    expect(await requestConnectionContext(input, 0, owner, () => false, request)).toEqual({ state: 'stale' }); expect(input).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
});
it('a packaged older center without session-preference controls returns unavailable instead of fabricating metadata or authority', async () => {
    const h = centerClientFixture(); try { await h.client.start(); expect(await h.client.requestSessionPreferences({ method: 'center.session-preferences.read' })).toEqual({ state: 'unavailable' }); }
    finally { h.client.stop(); }
});
