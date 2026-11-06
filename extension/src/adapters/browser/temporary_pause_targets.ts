import type { BrowserApi } from './api.ts';
import type { NativePauseTarget } from '../../application/temporary_pause_review_ports.ts';
import type { PauseTabChoice, PauseTabList } from '../../domain/temporary_pause_controls.ts';
import { pageIdentity } from '../../domain/page.ts';
import { deepFreeze, natural } from '../../domain/value.ts';

const eligible = (current: () => boolean): boolean => { try { return current() === true; } catch { return false; } };
/** Existing github.com host access only; no title, permission request, navigation or provider request. */
export class BrowserPauseTargets {
    constructor(private readonly tabs: Pick<BrowserApi['tabs'], 'get' | 'query'>) {}
    async target(tabId: number): Promise<NativePauseTarget | null> {
        if (!natural(tabId)) return null;
        try {
            const tab = await this.tabs.get(tabId);
            if (tab.incognito !== false || typeof tab.url !== 'string' || tab.url.length > 4096 || /[\s\\\p{Cc}\p{Cf}]/u.test(tab.url)) return null;
            const url = new URL(tab.url);
            if (url.origin !== 'https://github.com' || url.username || url.password) return null;
            const source = url.origin + url.pathname; const page = pageIdentity(source);
            // Safari's generated background page can misdecode raw non-ASCII characters.
            const label = page?.repository ? `${page.repository}${page.number === null ? '' : ` \u00b7 #${page.number}`}` : null;
            return deepFreeze({ tabId, source, label: label && label.length <= 240 ? label : null });
        } catch { return null; }
    }
    async list(current: () => boolean): Promise<PauseTabList> {
        if (!eligible(current)) return { state: 'stale' };
        try {
            const result = await this.tabs.query({ url: 'https://github.com/*' });
            if (!eligible(current)) return { state: 'stale' };
            const ids = [...new Set(result.slice(0, 128).map(tab => tab.id).filter(natural))];
            const tabs: PauseTabChoice[] = []; let next = 0;
            await Promise.all(Array.from({ length: Math.min(4, ids.length) }, async () => {
                while (next < ids.length && eligible(current)) {
                    const target = await this.target(ids[next++]); if (target) tabs.push({ tabId: target.tabId, label: target.label });
                }
            }));
            if (!eligible(current)) return { state: 'stale' };
            return deepFreeze({ state: 'ready', tabs: tabs.sort((a, b) => a.tabId - b.tabId), limited: result.length > 128 });
        } catch { return { state: 'unavailable' }; }
    }
}
