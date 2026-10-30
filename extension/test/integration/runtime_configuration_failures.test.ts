import { expect, it, vi } from 'vitest';
import { pageConfigurationFixture, CONFIG } from '../fixtures/page_configuration.ts';

it('a connection dependency without a known waiting deadline remains explicit unknown metadata and does not restore during inspection', async () => {
    const h = pageConfigurationFixture(); vi.spyOn(h.service, 'status').mockReturnValue({ state: 'budget', epoch: 0 });
    expect(await h.call({ ...CONFIG, inspectOnly: true })).toMatchObject({ provenance: { connection: { state: 'budget', retryAt: null } } });
    expect(h.port.get).not.toHaveBeenCalled(); expect(h.reader.read).not.toHaveBeenCalled();
});
it.each(['initial', 'after-local-prerequisite'] as const)('an invalid numeric dependency at %s is rejected before a configuration can reach content', async stage => {
    const h = pageConfigurationFixture(); const corrupt = () => vi.spyOn(h.service, 'status').mockReturnValue({ state: 'budget', epoch: 0, retryAt: -1 });
    if (stage === 'initial') corrupt(); else h.sessionPorts.protected.mockImplementationOnce(async () => { corrupt(); return true; });
    expect(await h.call()).toEqual({ state: 'unavailable' }); expect(h.reader.read).not.toHaveBeenCalled();
});
