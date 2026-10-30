import { vi } from 'vitest';
import { renderHistory, historyButton, historyReview } from './history_center_dom.ts';
import { ready, button } from './center_app_dom.ts';
import { seedClearHistory } from './clear_gateway.ts';
import { clearCopy } from '../../src/domain/clear_copy.ts';
import { operationCopy } from '../../src/domain/operation_copy.ts';
import { validJournalSnapshot } from '../../src/domain/local_journal.ts';
import type { JournalKind } from '../../src/domain/journal_facts.ts';

export async function clearCenterFixture(locale = 'en', retaining = false) {
    const f = await renderHistory('privacy', locale, async native => { seedClearHistory(native, retaining); await native.history.refresh(); });
    const bridge = async (value: unknown) => {
        for (const listener of f.app.browser.onMessage.listeners) listener(value, { id: f.app.browser.api.runtime.id }, () => undefined);
        return { state: 'observed' };
    };
    vi.mocked(f.browser.api.runtime.sendMessage).mockImplementation(bridge); f.notify.mockImplementation(() => { void bridge({ version: 1, method: 'center.invalidated' }); });
    const clear = clearCopy(locale); const operation = operationCopy(locale);
    await ready(() => !!document.querySelector('[data-permission-status]') && document.querySelector('[data-current-operation]')?.getAttribute('aria-busy') === 'false');
    return { ...f, clear, operation, bridge,
        begin: async (kind: JournalKind = 'diagnostics') => { await ready(() => !historyButton(kind, f.copy.text.clear).disabled); historyButton(kind, f.copy.text.clear).click(); await historyReview(); },
        confirm: async () => { button(f.copy.text.confirm).click(); await ready(() => clearText().includes(clear.states.settled) && !button(f.copy.text.close).disabled); },
        rows: (kind: JournalKind = 'diagnostics') => { const value = f.documents.get(kind); return validJournalSnapshot(kind, value) ? value.entries : []; } };
}
export function clearText(): string { return document.querySelector('[data-current-operation]')?.textContent ?? ''; }
