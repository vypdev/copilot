import { afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { writable } from 'svelte/store';
import SessionPreferenceTestHost from './SessionPreferenceTestHost.svelte';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { sessionPreferenceCopy } from '../../src/presentation/session_preference_copy.ts';
import { EMPTY_SESSION_PREFERENCE_VIEW, type SessionPreferenceClientView } from '../../src/domain/session_preference_client_view.ts';
import type { SessionPreferenceRead } from '../../src/domain/session_preference_read.ts';
import { sessionPreferenceActionsFixture } from './session_preference_ui.ts';

const mounts: ReturnType<typeof mount>[] = [];
afterEach(async () => { for (const host of mounts.splice(0)) await unmount(host); document.body.replaceChildren(); });
export function renderSessionPreferences(read: SessionPreferenceRead, view: Partial<SessionPreferenceClientView> = {}, editable = true, available = true, locale = 'en') {
    const actions = sessionPreferenceActionsFixture(); const copy = sessionPreferenceCopy(locale);
    const context = { center: centerCopy(locale), view: { ...EMPTY_SESSION_PREFERENCE_VIEW, reader: { phase: 'ready' as const, current: true, data: read }, ...view }, editable, available };
    const value = writable({ context, actions }); const host = mount(SessionPreferenceTestHost, { target: document.body, props: { value } }); mounts.push(host); flushSync();
    return { host, actions, copy, context, update: (next: typeof context) => { value.set({ context: next, actions }); flushSync(); } };
}
export function sessionPreferenceButton(label: string): HTMLButtonElement {
    const button = [...document.querySelectorAll('button')].find(node => node.textContent === label); if (!button) throw new Error('button:'+label); return button;
}
export function sessionPreferenceChoice(id: string, value: string): void {
    const input = document.getElementById(id) as HTMLSelectElement; if (!input) throw new Error('select:'+id);
    input.value = value; input.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
}
export function submitSessionPreferenceDraft(): void { document.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); flushSync(); }
