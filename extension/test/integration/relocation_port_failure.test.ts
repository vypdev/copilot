// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import RepositoryRelocation from '../../src/presentation/RepositoryRelocation.svelte';
import { captureRelocation } from '../../src/domain/repository_relocation.ts';
import { connectionsView } from '../../src/domain/named_sessions.ts';
import { button, change } from '../fixtures/center_app_dom.ts';
import { CONNECTED, deferred } from '../fixtures/runtime.ts';
function fixture() {
    const target = document.createElement('div'); document.body.append(target);
    const view = connectionsView({ schemaVersion: 1, revision: 1, selected: 'work', entries: [
        { id: 'work', name: 'Work', host: 'github.com', role: 'repository-read', connection: { ...CONNECTED, schemaVersion: 1 } },
    ] }, true);
    const pending = deferred<number | null>(); const close = vi.fn();
    const actions = { focusReview: vi.fn(), focusSession: vi.fn(), refresh: vi.fn(), connect: vi.fn(), change: vi.fn(() => pending.promise), dirty: vi.fn() };
    const component = mount(RepositoryRelocation, { target, props: { target: captureRelocation(view.entries[0], 1), view, locale: 'en', editable: true, busy: false, actions, close } }); flushSync();
    change('relocation-address', 'team/renamed'); button('Review address').click(); flushSync(); button('Verify new address').click(); flushSync();
    return { pending, actions, close, stop: async () => { await unmount(component); target.remove(); } };
}
it('a semantic port failure with an unchanged ready view retains the draft and cannot enable a second attempt without a fresh read', async () => {
    const f = fixture(); f.pending.reject(new Error('private callback failure'));
    await vi.waitFor(() => { flushSync(); expect(document.body.textContent).toContain('Completion was not confirmed.'); expect(button('Review address').disabled).toBe(true); });
    expect(document.body.textContent).not.toContain('private callback failure'); expect((document.querySelector('#relocation-address') as HTMLInputElement).value).toBe('team/renamed');
    expect(f.close).not.toHaveBeenCalled(); expect(f.actions.dirty).not.toHaveBeenCalled(); await f.stop();
});
it('a rejected semantic callback after disposal cannot clear a newer editor’s draft or close its view', async () => {
    const f = fixture(); await f.stop(); f.pending.reject(new Error('private late callback')); await Promise.resolve(); await Promise.resolve();
    expect(f.close).not.toHaveBeenCalled(); expect(f.actions.dirty).not.toHaveBeenCalled();
});
