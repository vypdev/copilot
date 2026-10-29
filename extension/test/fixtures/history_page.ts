import { afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import HistoryPage from '../../src/presentation/HistoryPage.svelte';
import { EMPTY_HISTORY_VIEW, type HistoryClientView } from '../../src/domain/history_client_view.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { historyCopy } from '../../src/domain/history_copy.ts';
import { historyActionsFixture } from './history_ui.ts';
import type { HistoryRoute } from '../../src/domain/history_ui.ts';

const mounts: ReturnType<typeof mount>[] = [];
afterEach(async () => { for (const host of mounts.splice(0)) await unmount(host); document.body.replaceChildren(); });
export function renderHistoryPage(view: Partial<HistoryClientView> = {}, route: HistoryRoute = 'activity', locale = 'en', editable = true) {
    const actions = historyActionsFixture(); const copy = historyCopy(locale);
    const context = { copy: centerCopy(locale), view: { ...EMPTY_HISTORY_VIEW, ...view }, route, editable };
    const host = mount(HistoryPage, { target: document.body, props: { context, actions } }); mounts.push(host); flushSync();
    return { host, actions, copy, close: async () => { await unmount(host); mounts.splice(mounts.indexOf(host), 1); } };
}
