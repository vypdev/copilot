import { expect, it } from 'vitest';
import { WELCOME_STAGES, welcomeNext } from '../../src/domain/welcome.ts';
import { welcomeCopy } from '../../src/domain/welcome_copy.ts';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { settingsReviewChanges } from '../../src/domain/center_frame.ts';
import { planSettingsChange } from '../../src/domain/settings_change.ts';
import { DEFAULT_SETTINGS, loadSettings } from '../../src/domain/settings.ts';

it('has a finite ordered progress path with a terminal stage and no implicit wrap or reset', () => {
    expect(WELCOME_STAGES).toEqual(['welcome', 'profile', 'permissions', 'complete']); expect(Object.isFrozen(WELCOME_STAGES)).toBe(true);
    expect(WELCOME_STAGES.map(welcomeNext)).toEqual(['profile', 'permissions', 'complete', null]);
});
it('plans progress through the existing atomic preference contract while preserving profiles, grants and unrelated preferences', () => {
    const initial = { ...DEFAULT_SETTINGS, theme: 'dark' as const, repositories: { '8': { connected: true, paused: true } },
        center: { ...DEFAULT_SETTINGS.center, profiles: [{ id: 'work', name: 'Work', scope: { kind: 'global' as const }, preferences: { shortcuts: true } }], selected: ['work'] } };
    const plan = planSettingsChange(initial, { type: 'center', values: { onboarding: 'profile' } }); expect(plan.state).toBe('ready');
    if (plan.state !== 'ready') throw new Error('expected progress preview');
    expect(plan.settings).toEqual({ ...initial, center: { ...initial.center, onboarding: 'profile' } }); expect(initial.center.onboarding).toBe('welcome');
    expect(planSettingsChange(plan.settings, { type: 'center', values: { onboarding: 'profile' } }).state).toBe('unchanged');
});
it('rejects invalid/future progress and forged authority fields without replacing a complete previous revision', () => {
    for (const onboarding of [null, 0, {}, 'done', 'complete\n', 'https://evil.invalid']) {
        expect(planSettingsChange(DEFAULT_SETTINGS, { type: 'center', values: { onboarding } }).state).toBe('invalid');
    }
    for (const values of [{ onboarding: 'complete', selected: [] }, { onboarding: 'complete', grant: true }, { onboarding: 'complete', url: 'https://evil.invalid' }]) {
        expect(planSettingsChange(DEFAULT_SETTINGS, { type: 'center', values }).state).toBe('invalid');
    }
    expect(loadSettings({ ...DEFAULT_SETTINGS, schemaVersion: 99 }).state).toBe('future'); expect(DEFAULT_SETTINGS.center.onboarding).toBe('welcome');
});
it('a supported legacy settings migration establishes only the default personal welcome stage', () => {
    const { center: _center, ...legacy } = DEFAULT_SETTINGS; const loaded = loadSettings({ ...legacy, schemaVersion: 1 });
    expect(loaded.state).toBe('ready'); expect(loaded.settings.center.onboarding).toBe('welcome'); expect(loaded.settings.center.selected).toEqual([]);
});
it.each(['en', 'es', 'fr', 'pt'] as const)('has complete immutable %s step guidance and localizes semantic progress review deltas', locale => {
    const c = welcomeCopy(locale); expect(Object.keys(c)).toEqual(Object.keys(welcomeCopy('en'))); expect(Object.keys(c.steps)).toEqual([...WELCOME_STAGES]);
    expect(Object.keys(c.guidance)).toEqual([...WELCOME_STAGES]); expect(Object.values(c.guidance).every(text => text.length > 25)).toBe(true);
    expect(Object.isFrozen(c.guidance)).toBe(true);
    const after = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, onboarding: 'profile' as const } };
    expect(settingsReviewChanges(DEFAULT_SETTINGS, after, centerCopy(locale))).toEqual([{ id: 'center/onboarding', label: `center › ${c.progress}`, before: c.steps.welcome, after: c.steps.profile }]);
});
it('does not turn arbitrary supplied text into a translated or executable welcome state', () => {
    const c = centerCopy('en'); const unknown = { center: { onboarding: 'not-a-stage' } };
    expect(settingsReviewChanges({ center: { onboarding: 'welcome' } }, unknown, c)[0]).toMatchObject({ after: 'not-a-stage' });
    expect(settingsReviewChanges({}, { center: { onboarding: 'profile' } }, c)[0]).toMatchObject({ before: 'Not set', after: welcomeCopy('en').steps.profile });
});
