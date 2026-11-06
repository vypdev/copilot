import { vi } from 'vitest';
import { renderHistory } from './history_center_dom.ts';
import { ready } from './center_app_dom.ts';
import { operationCopy } from '../../src/domain/operation_copy.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { reviewCopy } from '../../src/domain/review_copy.ts';
import { collectionSettings } from './collection_coordinator.ts';
import { activeCollectionPolicy } from './collection_policy.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';

export async function operationCenterFixture(locale = 'en', active = false) {
    const f = await renderHistory('appearance', locale, async owner => {
        if (active) { owner.values.set(SETTINGS_KEY, collectionSettings(true)); owner.policiesData.set('diagnostics', activeCollectionPolicy()); await owner.history.refresh(); }
    });
    vi.mocked(f.browser.api.runtime.sendMessage).mockImplementation(async value => {
        for (const listener of f.app.browser.onMessage.listeners) listener(value, { id: f.app.browser.api.runtime.id }, () => undefined);
        return { state: 'observed' };
    });
    await ready(() => !!document.querySelector('#center-theme') && document.querySelector('[data-current-operation]')?.getAttribute('aria-busy') === 'false');
    return { ...f, port: { ...f.port, get: vi.mocked(f.port.get), set: vi.mocked(f.port.set) }, opCopy: operationCopy(locale), centerCopy: centerCopy('auto', locale), reviewCopy: reviewCopy(locale) };
}
export function operationText(): string { return document.querySelector('[data-current-operation]')?.textContent ?? ''; }
