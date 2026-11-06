// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { downloadHistory } from '../../src/infrastructure/history_files.ts';
import { previewHistoryExport } from '../../src/domain/history_export.ts';
import { historyWireExamples } from '../fixtures/history_wire.ts';

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('downloads the exact reviewed nonsecret JSON with a fixed local filename and revokes its object URL', async () => {
    const f = await historyWireExamples(); if (f.active.retained.state !== 'ready') throw new Error('missing'); const review = previewHistoryExport('diagnostics', f.active.retained.snapshot)!;
    const create = vi.fn((_blob: Blob) => 'blob:history'); const revoke = vi.fn(); vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.hidden).toBe(true); expect(this.download).toBe('copilot-diagnostics-history.json'); expect(this.href).toBe('blob:history');
    });
    expect(downloadHistory(document, 'diagnostics', review.content)).toBe(true); expect(document.querySelector('a')).toBeNull();
    const blob = create.mock.calls[0][0] as unknown as Blob;
    const body = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
    expect(body).toBe(review.content); expect(blob.type).toBe('application/json;charset=utf-8');
    await vi.waitFor(() => expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:history'));
});
it('rejects scope swaps, decorated or reordered bytes, malformed/oversized JSON and native download failure', async () => {
    const f = await historyWireExamples(); if (f.off.retained.state !== 'ready') throw new Error('missing'); const content = previewHistoryExport('diagnostics', f.off.retained.snapshot)!.content;
    const create = vi.fn((_blob: Blob) => 'blob:history'); const revoke = vi.fn(); vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    for (const body of ['', '{', 'null', '{}', ' '.repeat(132097), JSON.stringify({ ...JSON.parse(content), credentials: 'excluded' }),
        content.replace('"schemaVersion":1,', ''), JSON.stringify({ history: JSON.parse(content).history, schemaVersion: 1, kind: 'diagnostics' })]) expect(downloadHistory(document, 'diagnostics', body)).toBe(false);
    expect(downloadHistory(document, 'recents', content)).toBe(false); expect(downloadHistory(document, 'invalid' as never, content)).toBe(false);
    expect(downloadHistory(document, 'diagnostics', null as never)).toBe(false); expect(create).not.toHaveBeenCalled();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('private'); });
    expect(downloadHistory(document, 'diagnostics', content)).toBe(false); expect(document.querySelector('a')).toBeNull(); await vi.waitFor(() => expect(revoke).toHaveBeenCalledOnce());
    create.mockImplementation(() => { throw new Error('private'); }); expect(downloadHistory(document, 'diagnostics', content)).toBe(false);
});
