import { afterEach, expect, it, vi } from 'vitest';
import { provenanceContent } from '../fixtures/provenance_content.ts';
import { deferred } from '../fixtures/runtime.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { TEMPORARY_PAUSES_KEY } from '../../src/application/temporary_pause_reader.ts';
import { runtimeProvenanceCopy } from '../../src/presentation/runtime_provenance_copy.ts';
import { DEFAULT_TEMPORARY_PAUSES } from '../../src/domain/temporary_pauses.ts';

const stops: (() => void)[] = [];
afterEach(() => { for (const stop of stops.splice(0).reverse()) stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const fixture = (native?: unknown, locale?: 'en' | 'es' | 'fr' | 'pt') => { const h = provenanceContent(native, locale); stops.push(h.stop); return h; };
function fact(h: ReturnType<typeof fixture>, label: string) {
    const term = [...h.panel()!.querySelectorAll('dt')].find(node => node.textContent === label); return term?.nextElementSibling?.textContent;
}
async function ready(h: ReturnType<typeof fixture>) { await vi.waitFor(() => expect(h.panel()?.dataset.copilotSettings).toBe('ready')); }
it.each(['en', 'es', 'fr', 'pt'] as const)('the actual %s paused composition shows both native causes without private identities, credential reads or provider access', async locale => {
    const h = fixture({ ...DEFAULT_TEMPORARY_PAUSES, emergency: true, tabs: [7, 999] }, locale); const copy = runtimeProvenanceCopy(locale);
    const editor = h.document.querySelector('textarea')!; const draft = editor.value; editor.focus(); editor.setSelectionRange(3, 11);
    vi.mocked(h.sessionArea.get).mockClear(); h.mount(); await ready(h);
    expect(fact(h, copy.emergency)).toBe(copy.yes); expect(fact(h, copy.tab)).toBe(copy.yes); expect(fact(h, copy.nativeLabel)).toBe(copy.natives.emergency);
    expect(fact(h, copy.workerLabel)).toBe(copy.workers.clear); expect(h.panel()!.querySelector('button')!.disabled).toBe(true);
    expect(h.panel()!.textContent).not.toMatch(/999|Private profile name|repo-profile/); expect(h.provider).not.toHaveBeenCalled();
    expect(h.sessionArea.get).not.toHaveBeenCalledWith(SESSION_KEY); expect(h.document.activeElement).toBe(editor); expect(editor.value).toBe(draft); expect([editor.selectionStart, editor.selectionEnd]).toEqual([3, 11]);
});
it.each([{ document: { schemaVersion: 2, private: 'preserved' }, state: 'future' }, { document: { schemaVersion: 1 }, state: 'corrupt' }] as const)('the actual $state native document stays unknown and preserved through local recheck', async ({ document, state }) => {
    const h = fixture(document); const copy = runtimeProvenanceCopy('en'); h.mount(); await ready(h);
    expect(fact(h, copy.nativeLabel)).toBe(copy.natives[state]); expect(fact(h, copy.emergency)).toBe(copy.unknown); expect(fact(h, copy.tab)).toBe(copy.unknown);
    const writes = vi.mocked(h.sessionArea.set).mock.calls.length; const queries = vi.mocked(h.api.runtime.sendMessage).mock.calls.filter(([v]) => (v as { method?: string }).method === 'page.configuration').length;
    h.panel()!.querySelector<HTMLButtonElement>('[data-copilot-inspect-configuration]')!.click(); await ready(h);
    expect(h.api.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ method: 'page.configuration', manual: false }));
    expect(vi.mocked(h.api.runtime.sendMessage).mock.calls.filter(([v]) => (v as { method?: string }).method === 'page.configuration')).toHaveLength(queries + 1);
    expect(h.sessionArea.set).toHaveBeenCalledTimes(writes); expect(h.sessionValues.get(TEMPORARY_PAUSES_KEY)).toEqual(document); expect(h.provider).not.toHaveBeenCalled();
    expect(h.api.runtime.sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'page.snapshot' }));
});
it('a protected native document read failure exposes unknown facts without leaking or repairing its private error', async () => {
    const h = fixture(); const get = vi.mocked(h.sessionArea.get).getMockImplementation()!;
    vi.mocked(h.sessionArea.get).mockImplementation(async key => { if (key === TEMPORARY_PAUSES_KEY) throw new Error('PRIVATE native failure'); return get(key); });
    h.mount(); await ready(h); const copy = runtimeProvenanceCopy('en');
    expect(fact(h, copy.nativeLabel)).toBe(copy.natives.unavailable); expect(fact(h, copy.emergency)).toBe(copy.unknown); expect(h.panel()!.textContent).not.toContain('PRIVATE'); expect(h.provider).not.toHaveBeenCalled();
});
it('local recheck after a stored pause clears does not restore a retained credential or start provider verification', async () => {
    const h = fixture({ ...DEFAULT_TEMPORARY_PAUSES, emergency: true }); h.mount(); await ready(h);
    // The native value changed without a wake notification; inspection must remain metadata-only even when no veto remains.
    h.sessionValues.set(TEMPORARY_PAUSES_KEY, { ...DEFAULT_TEMPORARY_PAUSES, revision: 1 }); vi.mocked(h.sessionArea.get).mockClear();
    h.panel()!.querySelector<HTMLButtonElement>('[data-copilot-inspect-configuration]')!.click(); await ready(h);
    expect(fact(h, runtimeProvenanceCopy('en').emergency)).toBe(runtimeProvenanceCopy('en').no);
    expect(h.sessionArea.get).not.toHaveBeenCalledWith(SESSION_KEY); expect(h.provider).not.toHaveBeenCalled();
    expect(h.panel()!.querySelector('button')!.disabled).toBe(true); expect(h.api.runtime.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ method: 'page.configuration', inspectOnly: true }));
});
it.each([true, false])('a real native emergency commit accepted=%s exposes pending first, then factual native state or retained precaution', async accepted => {
    const h = fixture(); const client = await h.client();
    const plan = await client.requestPauses({ method: 'center.pauses.preview', intent: { type: 'emergency', paused: true }, expectedRevision: 0 });
    expect(plan?.operationId).toEqual(expect.any(String)); const gate = deferred<void>(); const entered = deferred<void>(); const set = vi.mocked(h.sessionArea.set).getMockImplementation()!;
    vi.mocked(h.sessionArea.set).mockImplementation(async values => { if (Object.hasOwn(values, TEMPORARY_PAUSES_KEY)) { entered.resolve(); await gate.promise; if (!accepted) return; } await set(values); });
    const confirming = client.requestPauses({ method: 'center.pauses.confirm', operationId: plan!.operationId as string, expectedRevision: 0 }); await entered.promise;
    vi.mocked(h.sessionArea.get).mockClear(); h.mount(); await ready(h); const copy = runtimeProvenanceCopy('en');
    expect(fact(h, copy.workerLabel)).toBe(copy.workers.pending); expect(fact(h, copy.nativeLabel)).toBe(copy.natives['not-checked']); expect(fact(h, copy.emergency)).toBe(copy.unknown);
    expect(h.sessionArea.get).not.toHaveBeenCalledWith(SESSION_KEY); expect(h.sessionArea.get).not.toHaveBeenCalledWith(TEMPORARY_PAUSES_KEY); expect(h.provider).not.toHaveBeenCalled();
    gate.resolve(); await confirming;
    await vi.waitFor(() => expect(fact(h, copy.workerLabel)).toBe(accepted ? copy.workers.clear : copy.workers.precaution));
    expect(fact(h, copy.emergency)).toBe(accepted ? copy.yes : copy.unknown);
    h.panel()!.querySelector<HTMLButtonElement>('[data-copilot-inspect-configuration]')!.click(); await ready(h);
    expect(fact(h, copy.workerLabel)).toBe(accepted ? copy.workers.clear : copy.workers.precaution); expect(h.provider).not.toHaveBeenCalled();
});
