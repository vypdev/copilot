import { expect, it, vi } from 'vitest';
import { centerClientFixture } from '../fixtures/center_client.ts';
import { deferred } from '../fixtures/runtime.ts';

const intent = { type: 'preferences', values: { density: 'compact' } };
it('renderer failure and subscription capacity cannot erase committed facts', async () => {
    const h = centerClientFixture(); const observed: string[] = [];
    const release = h.client.subscribe(view => { observed.push(view.phase); if (view.phase === 'committing') throw new Error('renderer-failed'); });
    const unsubscribers = Array.from({ length: 7 }, () => h.client.subscribe(() => undefined));
    expect(() => h.client.subscribe(() => undefined)).toThrow('center-subscriber-capacity');
    await h.client.start(); await h.client.preview(intent, 0); await h.client.confirm();
    expect(h.client.view.review?.state).toBe('saved'); expect(observed).toContain('committing'); release(); unsubscribers.forEach(unsubscribe => unsubscribe());
});
it('unmounting while native open is pending releases its eventual handle and never loads preferences', async () => {
    const h = centerClientFixture(); const wait = deferred<void>(); const begun = deferred<void>(); const send = h.port.send.getMockImplementation()!;
    h.port.send.mockImplementationOnce(async message => { const reply = await send(message); begun.resolve(); await wait.promise; return reply; });
    const opening = h.client.start(); await begun.promise; h.client.stop(); wait.resolve(); await opening;
    expect(h.client.view.phase).toBe('stopped'); expect(h.client.view.data).toBeNull();
    expect(h.port.send.mock.calls.map(([message]) => message.method)).toEqual(['center.open', 'center.close']);
    await h.client.refresh(); await h.client.start(); await h.client.takeControl(); await h.client.preview(intent, 0);
    expect(h.port.send).toHaveBeenCalledTimes(2);
});
it('reentrant disposal before opening, reading, claiming or previewing prevents a native effect', async () => {
    for (const phase of ['loading', 'reading', 'previewing'] as const) {
        const h = centerClientFixture();
        if (phase !== 'loading') await h.client.start();
        const calls = h.port.send.mock.calls.length;
        let loading = 0;
        const release = h.client.subscribe(view => { if (view.phase === phase && (phase !== 'loading' || ++loading > 1)) h.client.stop(); });
        if (phase === 'loading') await h.client.start();
        if (phase === 'reading') await h.client.takeControl();
        if (phase === 'previewing') await h.client.preview(intent, 0);
        expect(h.client.view.phase).toBe('stopped');
        expect(h.port.send.mock.calls.slice(calls).every(([message]) => message.method === 'center.close')).toBe(true); release();
    }
});
it('late reads cannot repaint a retired view, and a completed late takeover releases its new native epoch', async () => {
    for (const method of ['center.read', 'center.claim'] as const) {
        const h = centerClientFixture();
        if (method === 'center.claim') h.native.open({ documentId: 'other-editor', tabId: 3 });
        await h.client.start();
        const wait = deferred<void>(); const begun = deferred<void>(); const send = h.port.send.getMockImplementation()!;
        h.port.send.mockImplementationOnce(async message => { const reply = await send(message); begun.resolve(); await wait.promise; return reply; });
        const pending = method === 'center.read' ? h.client.refresh() : h.client.takeControl();
        await begun.promise; h.client.stop(); wait.resolve(); await pending;
        expect(h.client.view.phase).toBe('stopped');
        if (method === 'center.claim') {
            const closes = h.port.send.mock.calls.filter(([message]) => message.method === 'center.close');
            expect(closes).toHaveLength(2); expect(closes.at(-1)?.[0]).toMatchObject({ controllerEpoch: 2 });
            const reopened = h.native.open({ documentId: 'fresh-window', tabId: 2 }); expect(reopened.role).toBe('editor');
        }
    }
});
it('a late failed transport after disposal does not resurrect visible state or leak error text', async () => {
    const h = centerClientFixture(); const wait = deferred<void>(); const begun = deferred<void>();
    h.port.send.mockImplementationOnce(async () => { begun.resolve(); await wait.promise; throw new Error('private-late-reply'); });
    const opening = h.client.start(); await begun.promise; h.client.stop(); wait.resolve(); await opening;
    expect(h.client.view).toMatchObject({ phase: 'stopped', issue: null, data: null });
});
it('double clicks and dismissal cannot cancel an in-flight confirmation or start a second mutation', async () => {
    const h = centerClientFixture(); await h.client.refresh(); await h.client.preview(intent, 0);
    const pending = deferred<void>(); const begun = deferred<void>();
    vi.mocked(h.native.port.set).mockImplementationOnce(async (key, value) => { begun.resolve(); await pending.promise; h.native.values.set(key, value); });
    const saving = h.client.confirm(); await begun.promise;
    await h.client.dismiss(); await h.client.cancel(); await h.client.confirm(); await h.client.preview(intent, 0); await h.client.takeControl();
    expect(h.client.view.review?.state).toBe('committing'); pending.resolve(); await saving;
    expect(h.native.port.set).toHaveBeenCalledTimes(1); expect(h.client.view.review?.state).toBe('saved');
});
