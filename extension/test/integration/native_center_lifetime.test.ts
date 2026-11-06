import { expect, it } from 'vitest';
import { startBackground } from '../../src/infrastructure/background_runtime.ts';
import { browserFixture } from '../fixtures/browser.ts';
import { CenterChannelClient } from '../../src/adapters/browser/center_channel_client.ts';

it('native same-document hash loading, including a subsequent loading without URL, preserves the editing owner', async () => {
    const h = browserFixture(); const stop = startBackground(h.api);
    const channel = new CenterChannelClient(h.api.runtime, () => undefined);
    const call = (value: object) => channel.send({ version: 1, ...value } as Parameters<typeof channel.send>[0]) as Promise<Record<string, unknown>>;
    try {
        const owner = await call({ method: 'center.open' });
        expect(owner).toMatchObject({ state: 'ready', role: 'editor' });
        const updated = [...h.onUpdated.listeners][0];
        updated(1, { url: 'chrome-extension://test/runtime.html#/appearance', status: 'loading' });
        updated(1, { status: 'complete' }); updated(1, { status: 'loading' }); updated(1, { status: 'complete' });
        expect(await call({ method: 'center.read', clientId: owner.clientId })).toMatchObject({ state: 'ready', role: 'editor', clientId: owner.clientId });
    } finally { channel.stop(); stop(); }
});
