// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { mount, unmount, flushSync, tick, type Component } from 'svelte';
import SessionPreferenceRoute from '../../src/presentation/SessionPreferenceRoute.svelte';
import SessionPreferencesPage from '../../src/presentation/SessionPreferencesPage.svelte';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { EMPTY_SESSION_PREFERENCE_VIEW } from '../../src/domain/session_preference_client_view.ts';
import { sessionPreferenceActionsFixture } from '../fixtures/session_preference_ui.ts';
import type { SessionPreferenceRouteProps } from '../../src/domain/session_preference_ui.ts';
import { deferred } from '../fixtures/runtime.ts';

const mounts: ReturnType<typeof mount>[] = [];
afterEach(async () => { for (const host of mounts.splice(0)) await unmount(host); document.body.replaceChildren(); });
function render(load: () => Promise<Component<SessionPreferenceRouteProps>>) {
    const context = { center: centerCopy('en'), view: EMPTY_SESSION_PREFERENCE_VIEW, editable: false, available: true }; const actions = sessionPreferenceActionsFixture();
    const host = mount(SessionPreferenceRoute, { target: document.body, props: { context, actions, load } }); mounts.push(host); flushSync(); return { host, context, actions };
}
it('the fixed packaged route shows loading and mounts local preferences without inventing a native connection', async () => {
    const gate = deferred<Component<SessionPreferenceRouteProps>>(); const h = render(() => gate.promise); expect(document.body.textContent).toContain(h.context.center.messages.loading);
    gate.resolve(SessionPreferencesPage); await tick(); flushSync(); expect(document.querySelector('[data-session-preferences]')).not.toBeNull(); expect(h.actions.read).not.toHaveBeenCalled();
});
it('a failed packaged preference chunk gives a local unavailable result without exposing its exception or loading remote code', async () => {
    const h = render(() => Promise.reject(new Error('private chunk path'))); await tick(); flushSync();
    expect(document.querySelector('[role=alert]')?.textContent).toBe(h.context.center.messages.unavailable); expect(document.body.textContent).not.toContain('private chunk');
});
it.each(['resolve', 'reject'] as const)('a late preference chunk %s cannot revive an already unmounted native route', async kind => {
    const gate = deferred<Component<SessionPreferenceRouteProps>>(); const h = render(() => gate.promise); await unmount(h.host); mounts.splice(mounts.indexOf(h.host), 1);
    if (kind === 'resolve') gate.resolve(SessionPreferencesPage); else gate.reject(new Error('late chunk')); await tick(); flushSync();
    expect(document.querySelector('[data-session-preferences]')).toBeNull(); expect(document.querySelector('[role=alert]')).toBeNull();
});
