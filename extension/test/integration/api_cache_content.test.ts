import { afterEach, expect, it, vi } from 'vitest';
import { provenanceContent } from '../fixtures/provenance_content.ts';
import { DEFAULT_TEMPORARY_PAUSES } from '../../src/domain/temporary_pauses.ts';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { decodeApiCacheReply } from '../../src/domain/api_cache.ts';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const fixture = () => { const h = provenanceContent({ ...DEFAULT_TEMPORARY_PAUSES, emergency: true }); stops.push(h.stop); return h; };
const configurations = (h: ReturnType<typeof fixture>) => vi.mocked(h.api.runtime.sendMessage).mock.calls.map(([v]) => v as { method?: string; inspectOnly?: boolean }).filter(v => v.method === 'page.configuration');
it('a real cache clear refreshes the eligible GitHub tab as metadata only, even when a formerly blocked retained credential could now restore', async () => {
    const h = fixture(); h.mount(); await vi.waitFor(() => expect(h.panel()?.dataset.copilotSettings).toBe('ready'));
    const editor = await h.client(); await vi.waitFor(() => expect(h.panel()?.dataset.copilotSettings).toBe('ready')); expect(h.provider).not.toHaveBeenCalled();
    const draft = h.document.querySelector<HTMLTextAreaElement>('textarea')!; draft.focus(); draft.setSelectionRange(2, 7); const value = draft.value;
    // No wake event: a generic invalidate would now admit restoration and issue HTTP GETs.
    h.sessionValues.set(TEMPORARY_PAUSES_KEY, { ...DEFAULT_TEMPORARY_PAUSES, revision: 1 });
    const retained = structuredClone(h.sessionValues.get(SESSION_KEY)); vi.mocked(h.sessionArea.get).mockClear(); const before = configurations(h).length;
    const plan = decodeApiCacheReply(await editor.requestApiCache({ method: 'center.cache.preview' })); if (plan?.state !== 'preview') throw new Error('review unavailable');
    expect(await editor.requestApiCache({ method: 'center.cache.confirm', operationId: plan.operationId })).toEqual({ state: 'cleared' });
    await vi.waitFor(() => expect(configurations(h)).toHaveLength(before + 1)); await vi.waitFor(() => expect(h.panel()?.dataset.copilotSettings).toBe('ready'));
    expect(h.provider.mock.calls.map(([url]) => url)).toEqual([]); expect(configurations(h).at(-1)?.inspectOnly).toBe(true); expect(h.sessionArea.get).not.toHaveBeenCalledWith(SESSION_KEY);
    expect(h.sessionValues.get(SESSION_KEY)).toEqual(retained); expect(h.document.activeElement).toBe(draft); expect(draft.value).toBe(value); expect([draft.selectionStart, draft.selectionEnd]).toEqual([2, 7]);
    expect(h.api.runtime.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'page.snapshot' }));
});
it('the dedicated cache notification accepts only native background delivery and a closed packet, then issues one metadata-only inspection', async () => {
    const h = fixture(); h.mount(); await vi.waitFor(() => expect(h.panel()?.dataset.copilotSettings).toBe('ready'));
    const content = [...h.onMessage.listeners].at(-1)!; const before = configurations(h).length; const respond = vi.fn();
    content({ version: 1, method: 'runtime.cache.invalidated' }, { id: 'other' }, respond);
    content({ version: 1, method: 'runtime.cache.invalidated' }, { id: 'test', tab: { id: 7 } }, respond);
    content({ version: 1, method: 'runtime.cache.invalidated', inspectOnly: false }, { id: 'test' }, respond);
    expect(configurations(h)).toHaveLength(before); expect(respond).not.toHaveBeenCalled();
    h.notify({ version: 1, method: 'runtime.cache.invalidated' }); await vi.waitFor(() => expect(configurations(h)).toHaveLength(before + 1));
    expect(configurations(h).at(-1)?.inspectOnly).toBe(true); expect(h.provider).not.toHaveBeenCalled();
});
