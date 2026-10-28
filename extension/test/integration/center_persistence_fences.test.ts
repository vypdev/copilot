import { expect, it, vi } from 'vitest';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { CENTER_BINDING, centerFixture } from '../fixtures/center.ts';
import { deferred } from '../fixtures/runtime.ts';

const intent = { type: 'preferences', values: { density: 'compact' } };
it.each(['takeover', 'close', 'tab-removal'])('a %s during persistence preserves the saved fact and marks its context obsolete', async transition => {
    const h = centerFixture(); const editor = h.open(); const preview = await h.operations.preview(intent, editor.clientId);
    if (preview.state !== 'preview') throw new Error('expected preview');
    const started = deferred<void>(); const persisted = deferred<void>();
    vi.mocked(h.port.set).mockImplementationOnce(async (key, value) => { started.resolve(); await persisted.promise; h.values.set(key, value); });
    const confirming = h.gateway.handle({ version: 1, method: 'center.confirm', clientId: editor.clientId, controllerEpoch: editor.controllerEpoch,
        operationId: preview.operationId, expectedRevision: preview.revision }, { documentId: CENTER_BINDING.documentId!, tab: { id: 1 } });
    await started.promise;
    if (transition === 'takeover') { const binding = { documentId: 'two', tabId: 2 }; const other = h.open(binding); h.controller.claim(other.clientId, binding, other.controllerEpoch); }
    else if (transition === 'close') h.controller.close(editor.clientId, CENTER_BINDING, editor.controllerEpoch);
    else h.controller.releaseTab(1);
    persisted.resolve(); expect(await confirming).toEqual({ state: 'committed', revision: 1, acknowledgement: 'accepted', current: false });
    expect(h.values.get(SETTINGS_KEY)).toMatchObject({ current: { revision: 1, density: 'compact' }, operation: { id: preview.operationId } });
    expect(h.port.set).toHaveBeenCalledTimes(1);
});
it('a changed settings record conflicts with a live editor preview instead of replacing another window’s newer preferences', async () => {
    const h = centerFixture(); const editor = h.open(); const preview = await h.operations.preview(intent, editor.clientId);
    if (preview.state !== 'preview') throw new Error('expected preview');
    await h.repository.update(settings => ({ ...settings, theme: 'dark' }));
    expect(await h.gateway.handle({ version: 1, method: 'center.confirm', clientId: editor.clientId, controllerEpoch: editor.controllerEpoch,
        operationId: preview.operationId, expectedRevision: preview.revision }, { documentId: CENTER_BINDING.documentId!, tab: { id: 1 } })).toEqual({ state: 'conflict' });
    expect(h.values.get(SETTINGS_KEY)).toMatchObject({ current: { revision: 1, theme: 'dark', density: 'comfortable' } });
    expect(h.port.set).toHaveBeenCalledTimes(1);
});
