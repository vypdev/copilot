import { afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PauseTestHost from './PauseTestHost.svelte';
import { writable } from 'svelte/store';
import { EMPTY_PAUSE_VIEW, type PauseClientView } from '../../src/domain/pause_client_view.ts';
import { pauseCopy } from '../../src/domain/pause_copy.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { pauseActionsFixture } from './pause_ui.ts';
import { pauseControlWire } from './pause_wire.ts';
const mounts: ReturnType<typeof mount>[] = [];
afterEach(async () => { for (const host of mounts.splice(0)) await unmount(host); document.body.replaceChildren(); });
export function renderPausePage(view: Partial<PauseClientView> = {}, editable = true, available = true, locale = 'en') {
    const actions = pauseActionsFixture(); const copy = pauseCopy(locale);
    const context = { center: centerCopy(locale), view: { ...EMPTY_PAUSE_VIEW, reader: { phase: 'ready' as const, current: true, data: pauseControlWire() }, ...view }, editable, available };
    const value = writable({ context, actions }); const host = mount(PauseTestHost, { target: document.body, props: { value } }); mounts.push(host); flushSync();
    return { host, actions, copy, context, update: (next: typeof context) => { value.set({ context: next, actions }); flushSync(); }, close: async () => { await unmount(host); mounts.splice(mounts.indexOf(host), 1); } };
}
export function pauseButton(label: string): HTMLButtonElement {
    const button = [...document.querySelectorAll('button')].find(node => node.textContent === label); if (!button) throw new Error(label); return button;
}
