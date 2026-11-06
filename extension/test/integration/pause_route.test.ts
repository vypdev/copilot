// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { mount, unmount, flushSync, tick, type Component } from 'svelte';
import PauseRoute from '../../src/presentation/PauseRoute.svelte';
import PausesPage from '../../src/presentation/PausesPage.svelte';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { EMPTY_PAUSE_VIEW } from '../../src/domain/pause_client_view.ts';
import { pauseActionsFixture } from '../fixtures/pause_ui.ts';
import { deferred } from '../fixtures/runtime.ts';
import type { PauseRouteProps } from '../../src/domain/pause_ui.ts';
const mounts: ReturnType<typeof mount>[] = [];
afterEach(async () => { for (const host of mounts.splice(0)) await unmount(host); document.body.replaceChildren(); });
function render(load: () => Promise<Component<PauseRouteProps>>) {
    const context = { center: centerCopy('en'), view: EMPTY_PAUSE_VIEW, editable: false, available: true }; const actions = pauseActionsFixture();
    const host = mount(PauseRoute, { target: document.body, props: { context, actions, load } }); mounts.push(host); flushSync(); return { host, context, actions };
}
it('the fixed packaged page loader exposes loading and then mounts the independent native route without reading credentials', async () => {
    const gate = deferred<Component<PauseRouteProps>>(); const h = render(() => gate.promise); expect(document.body.textContent).toContain(h.context.center.messages.loading);
    gate.resolve(PausesPage); await tick(); flushSync(); expect(document.querySelector('[data-native-pauses]')).not.toBeNull(); expect(h.actions.read).not.toHaveBeenCalled();
});
it('a failed packaged chunk is an explicit local unavailable state and never a remote-code fallback', async () => {
    const h = render(() => Promise.reject(new Error('private path'))); await tick(); flushSync(); expect(document.querySelector('[role=alert]')?.textContent).toBe(h.context.center.messages.unavailable); expect(document.body.textContent).not.toContain('private path');
});
it.each(['resolve', 'reject'] as const)('a late chunk %s after unmount cannot revive a retired native view', async kind => {
    const gate = deferred<Component<PauseRouteProps>>(); const h = render(() => gate.promise); await unmount(h.host); mounts.splice(mounts.indexOf(h.host), 1);
    if (kind === 'resolve') gate.resolve(PausesPage); else gate.reject(new Error('retired chunk')); await tick(); flushSync(); expect(document.querySelector('[data-native-pauses]')).toBeNull(); expect(document.querySelector('[role=alert]')).toBeNull();
});
