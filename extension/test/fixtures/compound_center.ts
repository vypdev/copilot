import { vi } from 'vitest';
import { renderHistory, historyButton, historyReview } from './history_center_dom.ts';
import { ready, button } from './center_app_dom.ts';
import { collectionSettings } from './collection_coordinator.ts';
import { activeCollectionPolicy } from './collection_policy.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { collectionCopy } from '../../src/domain/collection_copy.ts';
import { operationCopy } from '../../src/domain/operation_copy.ts';
import { validJournalSnapshot } from '../../src/domain/local_journal.ts';

export async function compoundCenterFixture(locale = 'en', active = false) {
    const f = await renderHistory('privacy', locale, async native => {
        native.values.set(SETTINGS_KEY, collectionSettings(active));
        if (active) native.policiesData.set('diagnostics', activeCollectionPolicy()); await native.history.refresh();
    });
    const bridge = async (value: unknown) => {
        for (const listener of f.app.browser.onMessage.listeners) listener(value, { id: f.app.browser.api.runtime.id }, () => undefined);
        return { state: 'observed' };
    };
    vi.mocked(f.browser.api.runtime.sendMessage).mockImplementation(bridge); f.notify.mockImplementation(() => { void bridge({ version: 1, method: 'center.invalidated' }); });
    const compound = collectionCopy(locale); const operation = operationCopy(locale);
    await ready(() => !!document.querySelector('[data-permission-status]') && document.querySelector('[data-current-operation]')?.getAttribute('aria-busy') === 'false');
    return { ...f, compound, operation, bridge,
        begin: async (action: 'start' | 'stop' = 'start') => { historyButton('diagnostics', f.copy.text[action === 'start' ? 'enable' : 'stop']).click(); await historyReview(); },
        confirm: async () => { button(f.copy.text.confirm).click(); await ready(() => compoundText().includes(compound.states.settled) && !button(f.copy.text.close).disabled); },
        rows: () => { const value = f.documents.get('diagnostics'); return validJournalSnapshot('diagnostics', value) ? value.entries : []; } };
}
export function compoundText(): string { return document.querySelector('[data-current-operation]')?.textContent ?? ''; }
