// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import DependencyPage from '../../src/presentation/DependencyPage.svelte';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { EMPTY_INVENTORY_NAVIGATION } from '../../src/domain/inventory_filters.ts';
import type { CenterActions } from '../../src/domain/center_ui.ts';

let app: Record<string, unknown> | null = null;
afterEach(async () => { if (app) await unmount(app); app = null; document.body.replaceChildren(); });
it('a dependency view receiving a retired or unrelated route shows unavailable rather than a different milestone or runnable tool', () => {
    const accessed = vi.fn(() => { throw new Error('readonly-view-requested-an-action'); });
    const actions = new Proxy({} as CenterActions, { get: accessed }); const copy = centerCopy('en');
    app = mount(DependencyPage, { target: document.body, props: { context: { settings: DEFAULT_SETTINGS, copy, editable: false,
        location: { route: 'work' }, rollbackAvailable: false, inventory: EMPTY_INVENTORY_NAVIGATION, hasDraft: false }, actions } }); flushSync();
    expect(document.querySelector('[role=status]')?.textContent).toBe(copy.messages.unavailable); expect(document.querySelector('a,button,input,form')).toBeNull(); expect(accessed).not.toHaveBeenCalled();
});
