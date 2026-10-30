import { afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { writable } from 'svelte/store';
import ConnectionRolesTestHost from './ConnectionRolesTestHost.svelte';
import { credentialRoleCopy } from '../../src/domain/credential_role_copy.ts';
import { connectionCopy } from '../../src/domain/connection_copy.ts';
import { connectionsView } from '../../src/domain/named_sessions.ts';
import { captureRelocation } from '../../src/domain/repository_relocation.ts';
import type { ConnectionPanelProps } from '../../src/domain/connection_ui.ts';
import { purposeVault } from './credential_roles.ts';

const stops: (() => Promise<void>)[] = [];
afterEach(async () => { for (const stop of stops.splice(0)) await stop(); document.body.replaceChildren(); vi.restoreAllMocks(); });
export function roleUiFixture(review = false, options: Partial<ConnectionPanelProps> = {}) {
    const native = connectionsView(purposeVault(), true, 2); const close = vi.fn();
    const actions = { focusReview: vi.fn(), focusSession: vi.fn(), refresh: vi.fn(), connect: vi.fn(), change: vi.fn(async (): Promise<number | null> => 5), dirty: vi.fn() };
    let props = { view: native, locale: 'en' as const, editable: true, busy: false, hasDraft: false, ...options, actions,
        target: review ? captureRelocation(native.entries[1], native.revision) : null, close };
    const value = writable(props); const host = mount(ConnectionRolesTestHost, { target: document.body, props: { value } }); flushSync(); let alive = true;
    const stop = async () => { if (!alive) return; alive = false; await unmount(host); }; stops.push(stop);
    return { actions, close, copy: credentialRoleCopy(props.locale), common: connectionCopy(props.locale), view: native, host, stop,
        update: (next: Partial<ConnectionPanelProps>) => { props = { ...props, ...next, actions }; value.set(props); flushSync(); } };
}
export function roleButton(label: string, scope: ParentNode = document): HTMLButtonElement {
    const node = [...scope.querySelectorAll('button')].find(button => button.textContent?.trim() === label); if (!node) throw new Error('button:'+label); return node;
}
export function roleChoice(value: string): void {
    const field = document.getElementById('connection-purpose') as HTMLSelectElement; field.value = value; field.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
}
export const roleReviewText = () => document.querySelector('[data-role-review]')?.textContent ?? '';
