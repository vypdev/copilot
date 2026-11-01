import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS, importedSettings } from '../../src/domain/settings.ts';
import { SETTINGS_KEY } from '../../src/application/settings_repository.ts';
import { SETTINGS_OWNER, settingsOperationsFixture } from '../fixtures/settings_operations.ts';
import type { Settings } from '../../src/domain/settings.ts';

const selected = { ...DEFAULT_SETTINGS.center, profiles: [{ id: 'paused', name: 'Paused repository',
    scope: { kind: 'repository' as const, host: 'github.com' as const, accountId: '7', repositoryId: '42' }, preferences: { paused: true } }], selected: ['paused'] };
const combinations = [ [false, false], [true, false], [false, true], [true, true] ] as const;

it.each(combinations)('import cannot discard a selected profile pause with current global pause %s and incoming global pause %s', (currentPause, incomingPause) => {
    const current = { ...DEFAULT_SETTINGS, paused: currentPause, center: selected };
    const incoming = { ...DEFAULT_SETTINGS, paused: incomingPause };
    const before = JSON.stringify([current, incoming]);
    expect(() => importedSettings(current, incoming)).toThrow('settings-import-releases-profile-pause');
    expect(JSON.stringify([current, incoming])).toBe(before);
});
it.each(combinations)('an import retaining the selected pause may update appearance with current global pause %s and incoming global pause %s', (currentPause, incomingPause) => {
    const current = { ...DEFAULT_SETTINGS, paused: currentPause, center: selected };
    const result = importedSettings(current, { ...DEFAULT_SETTINGS, paused: incomingPause, theme: 'dark', center: selected });
    expect(result).toMatchObject({ paused: currentPause || incomingPause, theme: 'dark', revision: 1, center: selected });
    const resumed = { ...result, paused: false };
    expect(resumed.center.profiles.filter(profile => resumed.center.selected.includes(profile.id)).map(profile => profile.preferences.paused)).toEqual([true]);
});
it.each([false, true])('a rejected actual import writes nothing and an explicit global resumption retains its independent profile pause (incoming global pause %s)', async incomingPause => {
    const h = settingsOperationsFixture(); const current: Settings = { ...DEFAULT_SETTINGS, paused: true, center: selected };
    h.values.set(SETTINGS_KEY, { current }); const before = JSON.stringify(h.values.get(SETTINGS_KEY));
    expect(await h.operations.preview({ type: 'import', settings: { ...DEFAULT_SETTINGS, paused: incomingPause } }, SETTINGS_OWNER))
        .toEqual({ state: 'invalid', reason: 'pause-protected' });
    expect(h.port.set).not.toHaveBeenCalled(); expect(JSON.stringify(h.values.get(SETTINGS_KEY))).toBe(before);
    const resume = await h.operations.preview({ type: 'preferences', values: { paused: false } }, SETTINGS_OWNER);
    if (resume.state !== 'preview') throw new Error('expected independent global resumption');
    expect(await h.operations.confirm(resume.operationId, resume.revision, SETTINGS_OWNER)).toMatchObject({ state: 'committed', revision: 1 });
    expect((await h.repository.read()).settings).toMatchObject({ paused: false, center: selected });
    expect(h.port.set).toHaveBeenCalledOnce();
});
