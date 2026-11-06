import { afterEach } from 'vitest';
import { historyGatewayFixture } from './history_gateway.ts';
import { centerClientFixture } from './center_client.ts';
import { render, ready } from './center_app_dom.ts';
import { historyCopy } from '../../src/domain/history_copy.ts';
import type { JournalKind } from '../../src/domain/journal_facts.ts';

const owners: ReturnType<typeof historyGatewayFixture>[] = [];
afterEach(() => { owners.splice(0).forEach(f => f.history.stop()); });
export async function renderHistory(route = 'activity', language = 'en', configure: (f: ReturnType<typeof historyGatewayFixture>) => Promise<void> = async () => undefined) {
    const f = historyGatewayFixture(); owners.push(f); const native = centerClientFixture();
    await configure(f);
    native.port.send.mockImplementation(async input => ({ ...await f.call(input) as object, sourceTree: native.port.sourceTree }));
    const app = await render(route, false, undefined, true, native, language);
    if (['activity', 'diagnostics', 'privacy'].includes(route)) await ready(() => !!document.querySelector('[data-history-consent]'));
    return { ...f, app, copy: historyCopy(language) };
}
export function historyButton(kind: JournalKind, label: string): HTMLButtonElement {
    const button = [...document.querySelectorAll<HTMLButtonElement>(`[data-history=${kind}] button`)].find(node => node.textContent === label);
    if (!button) throw new Error(`missing history button: ${label}`); return button;
}
export async function historyReview(): Promise<void> { await ready(() => !!document.querySelector('#history-review-heading') && document.querySelector('[aria-labelledby=history-review-heading]')?.getAttribute('aria-busy') === 'false'); }
