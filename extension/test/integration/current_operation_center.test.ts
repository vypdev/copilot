// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://extension.test/runtime.html"}
import { expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { operationCenterFixture as fixture, operationText } from '../fixtures/operation_center.ts';
import { ready, change, button, navigate } from '../fixtures/center_app_dom.ts';
import { deferred } from '../fixtures/runtime.ts';
import { operationCopy } from '../../src/domain/operation_copy.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { privacyCopy } from '../../src/domain/privacy_copy.ts';

it.each(['en', 'es', 'fr', 'pt'])('the actual %s center reports reviewed and canonically saved preferences independently from off history', async locale => {
    const f = await fixture(locale); const previewReply = deferred<void>(); const send = f.app.port.send.getMockImplementation()!;
    f.app.port.send.mockImplementation(async message => {
        const result = await send(message);
        if (message.method === 'center.preview') await previewReply.promise;
        return result;
    });
    change('center-theme', 'dark'); button(f.centerCopy.messages.preview).click();
    await ready(() => operationText().includes(f.opCopy.stages.reviewed)); expect(operationText()).toContain(f.opCopy.retained.untracked);
    expect(document.querySelector('#settings-review-heading')).toBeNull(); previewReply.resolve();
    await ready(() => [...document.querySelectorAll<HTMLButtonElement>('[aria-labelledby="settings-review-heading"] button')]
        .some(control => !control.disabled && control.textContent?.trim() === f.reviewCopy.confirm));
    button(f.reviewCopy.confirm).click(); await ready(() => operationText().includes(f.opCopy.stages.settled)); expect(f.port.set).toHaveBeenCalledOnce();
    expect(f.documents.has('diagnostics')).toBe(false); expect(operationText()).toContain(f.opCopy.target); expect(f.app.browser.api.permissions.request).not.toHaveBeenCalled();
});
it('native store-pending metadata remains readable without completing or retrying the primary confirmation', async () => {
    const f = await fixture(); const gate = deferred<void>(); const begun = deferred<void>(); const set = f.port.set.getMockImplementation()!;
    change('center-theme', 'dark'); button(f.centerCopy.messages.preview).click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    f.port.set.mockImplementationOnce(async (key, value) => { begun.resolve(); await gate.promise; await set(key, value); }); button(f.reviewCopy.confirm).click(); await begun.promise;
    await ready(() => operationText().includes(f.opCopy.stages.submitted)); expect(document.querySelector('#settings-review-heading')).not.toBeNull();
    button(f.opCopy.read).click(); await ready(() => document.querySelector('[data-current-operation]')?.getAttribute('aria-busy') === 'false'); expect(f.port.set).toHaveBeenCalledOnce();
    gate.resolve(); await ready(() => operationText().includes(f.opCopy.stages.settled));
});
it('cancellation reports the cancelled preview and cannot be presented as a write acknowledgement', async () => {
    const f = await fixture(); change('center-theme', 'dark'); button(f.centerCopy.messages.preview).click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    button(f.reviewCopy.cancel).click(); await ready(() => operationText().includes(f.opCopy.stages.cancelled)); expect(f.port.set).not.toHaveBeenCalled();
});
it('private current targets are escaped, retired on blur and excluded from actual retained history', async () => {
    const f = await fixture('en', true); await navigate('profiles'); await ready(() => !!document.querySelector('#profile-id:not(:disabled)'));
    change('profile-id', 'private-profile'); change('profile-name', '<img src=x>'); button(f.centerCopy.messages.preview).click();
    await ready(() => document.querySelector('[data-operation-target]')?.textContent === '<img src=x>'); expect(document.querySelector('img')).toBeNull();
    window.dispatchEvent(new Event('blur')); await tick(); expect(document.querySelector('[data-operation-target]')).toBeNull();
    await f.history.writer.flush(); expect(JSON.stringify(f.documents.get('diagnostics'))).not.toContain('private-profile'); expect(JSON.stringify(f.documents.get('diagnostics'))).not.toContain('img');
});
it('a failed metadata read removes private detail without poisoning ordinary preference availability', async () => {
    const f = await fixture(); change('center-theme', 'dark'); button(f.centerCopy.messages.preview).click(); await ready(() => operationText().includes(f.opCopy.stages.reviewed));
    const send = f.app.port.send.getMockImplementation()!; f.app.port.send.mockImplementation(async m => m.method === 'center.operation.read' ? null : send(m));
    button(f.opCopy.read).click(); await ready(() => operationText().includes(f.opCopy.status.unavailable)); expect(document.querySelector('[data-operation-target]')).toBeNull();
    expect(document.querySelector('#settings-review-heading')).not.toBeNull(); expect(document.body.textContent).not.toContain(f.centerCopy.issues.unavailable);
    button(f.reviewCopy.confirm).click(); await ready(() => document.querySelector('section [role=status]')?.textContent === f.reviewCopy.states.saved); expect(f.port.set).toHaveBeenCalledOnce();
});
it('operation-only notifications neither inspect GitHub nor reread history and do not reset permission state', async () => {
    const f = await fixture(); await navigate('privacy');
    await ready(() => document.querySelector('[data-permission-status]')?.textContent === privacyCopy('en').complete);
    await ready(() => f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.history.read').length === 2);
    const historyReads = f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.history.read').length; const providerReads = vi.mocked(f.sessions.reader.read).mock.calls.length;
    const permissionReads = f.app.browser.api.permissions.contains;
    await f.browser.api.runtime.sendMessage({ version: 1, method: 'center.operation.invalidated' }); await ready(() => document.querySelector('[data-current-operation]')?.getAttribute('aria-busy') === 'false');
    expect(f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.history.read')).toHaveLength(historyReads); expect(f.sessions.reader.read).toHaveBeenCalledTimes(providerReads);
    expect(permissionReads).toHaveBeenCalledTimes(3);
});
it('disposing the actual center cannot publish delayed current metadata or a private target', async () => {
    const f = await fixture(); const gate = deferred<unknown>(); const begun = deferred<void>(); const send = f.app.port.send.getMockImplementation()!;
    f.app.port.send.mockImplementation(async m => { const value = await send(m); if (m.method === 'center.operation.read') { begun.resolve(); await gate.promise; } return value; });
    button(f.opCopy.read).click(); await begun.promise; f.app.stop(); gate.resolve(null); await tick(); expect(document.body.textContent).toBe('');
});
it('an ordinary settings read reconciles an unknown save in both the primary review and the current-operation view', async () => {
    const f = await fixture(); const set = f.port.set.getMockImplementation()!;
    change('center-theme', 'dark'); button(f.centerCopy.messages.preview).click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    f.port.set.mockImplementationOnce(async (key, value) => { await set(key, value); f.port.get.mockRejectedValueOnce(new Error('private')); }); button(f.reviewCopy.confirm).click();
    await ready(() => operationText().includes(f.opCopy.stages.unknown)); expect(operationText()).toContain(f.centerCopy.messages.refresh);
    button(f.centerCopy.messages.refresh).click(); await ready(() => operationText().includes(f.opCopy.stages.settled));
    await ready(() => document.querySelector('section [role=status]')?.textContent === f.reviewCopy.states.saved); expect(f.port.set).toHaveBeenCalledOnce();
    expect(f.app.port.send.mock.calls.filter(([m]) => m.method === 'center.confirm')).toHaveLength(1);
});
it('a failed later metadata read preserves proved completion while removing its private current target', async () => {
    const f = await fixture(); change('center-theme', 'dark'); button(f.centerCopy.messages.preview).click(); await ready(() => !!document.querySelector('#settings-review-heading'));
    button(f.reviewCopy.confirm).click(); await ready(() => operationText().includes(f.opCopy.stages.settled)); const send = f.app.port.send.getMockImplementation()!;
    f.app.port.send.mockImplementation(async m => m.method === 'center.operation.read' ? null : send(m)); button(f.opCopy.read).click();
    await ready(() => operationText().includes(f.opCopy.status.unavailable)); expect(operationText()).toContain(f.opCopy.stages.settled);
    expect(document.querySelector('[data-operation-target]')).toBeNull(); expect(f.port.set).toHaveBeenCalledOnce();
});
it('private target verification is retired when the same native window changes credential context', async () => {
    const f = await fixture(); change('center-theme', 'dark'); button(f.centerCopy.messages.preview).click(); await ready(() => !!document.querySelector('[data-operation-target]'));
    await f.sessions.service.revoke(); button(f.opCopy.read).click(); await ready(() => !!document.querySelector('[data-operation-target-unavailable]'));
    expect(operationText()).toContain(f.opCopy.historical); expect(document.querySelector('[data-operation-target]')).toBeNull();
});
it('current-operation inspection remains independent when current preference data becomes unreadable', async () => {
    const f = await fixture(); change('center-theme', 'dark'); button(f.centerCopy.messages.preview).click(); await ready(() => operationText().includes(f.opCopy.stages.reviewed));
    f.values.set(SETTINGS_KEY, { schemaVersion: 99 }); button(f.centerCopy.messages.refresh).click();
    await ready(() => !document.querySelector('form')); button(f.opCopy.read).click(); await ready(() => operationText().includes(f.opCopy.status.ready));
    expect(operationText()).toContain(f.opCopy.stages.reviewed); expect(f.values.get(SETTINGS_KEY)).toEqual({ schemaVersion: 99 }); expect(f.port.set).not.toHaveBeenCalled();
});
it('a valid native clock outside Date formatting range is disclosed without inventing a timestamp', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(9_000_000_000_000_000); const f = await fixture();
    change('center-theme', 'dark'); button(f.centerCopy.messages.preview).click(); await ready(() => operationText().includes(f.opCopy.stages.reviewed));
    expect(operationText()).toContain(f.copy.text.timeUnavailable); expect(document.querySelector('[data-current-operation] time')).toBeNull();
});
it('packaged locale fallback is atomic even for prototype names and cannot mutate another caller’s copy', () => {
    for (const locale of ['de', '__proto__', 'constructor', 'toString']) expect(operationCopy(locale)).toBe(operationCopy('en'));
    expect(Object.isFrozen(operationCopy('es'))).toBe(true); expect(Object.isFrozen(operationCopy('es').stages)).toBe(true);
});
