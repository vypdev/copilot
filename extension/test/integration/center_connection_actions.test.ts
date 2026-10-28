// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { connectionActions } from '../../src/infrastructure/center_connections.ts';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { browserFixture } from '../fixtures/browser.ts';

it('rejects a foreign element, retired route and unreadable session list before requesting permission, clearing a submitted unready password field', async () => {
    const h = centerClientFixture(); const browser = browserFixture(); let current = false;
    await h.client.start(); const actions = connectionActions(browser.api, document, h.client, () => current, vi.fn());
    actions.connect({}); actions.change({ type: 'disconnect' }, 0); actions.refresh(); current = true; actions.connect(document.createElement('div'));
    const form = document.createElement('form'); const secret = document.createElement('input'); secret.name = 'secret'; secret.type = 'password';
    secret.value = 'synthetic_not_a_real_credential'; form.append(secret); actions.connect(form);
    expect(secret.value).toBe(''); expect(browser.api.permissions.request).not.toHaveBeenCalled();
    actions.refresh(); await vi.waitFor(() => expect(h.client.view.phase).toBe('ready'));
    actions.change({ type: 'disconnect' }, 0); await vi.waitFor(() => expect(h.client.view.phase).toBe('ready'));
    expect(browser.api.permissions.request).not.toHaveBeenCalled(); h.client.stop();
});
