import { expect, it } from 'vitest';
import { centerCopy } from '../../src/domain/center_copy.ts';
import { centerFrame, settingsReviewChanges } from '../../src/domain/center_frame.ts';
import { CENTER_ROUTES } from '../../src/domain/center_routes.ts';
import { DEFAULT_SETTINGS } from '../../src/domain/settings.ts';
import { planSettingsChange } from '../../src/domain/settings_change.ts';
import { CenterNavigation } from '../../src/application/center_navigation.ts';

it.each(['en', 'es', 'fr', 'pt'])('provides one complete immutable %s resource with the same route and message inventory', locale => {
    const copy = centerCopy(locale); const baseline = centerCopy('en');
    expect(Object.keys(copy.routes)).toEqual([...CENTER_ROUTES]); expect(copy.locale).toBe(locale);
    expect(Object.keys(copy.messages)).toEqual(Object.keys(baseline.messages)); expect(Object.keys(copy.issues)).toEqual(Object.keys(baseline.issues));
    expect(Object.values(copy.messages).every(value => value.trim().length > 0)).toBe(true);
    expect(Object.isFrozen(copy.messages)).toBe(true); expect(centerCopy('auto', `${locale}-XX`)).toBe(copy);
});
it('falls back as a complete resource rather than interpolating a supplied locale', () => {
    expect(centerCopy(null)).toBe(centerCopy('en')); expect(centerCopy('__proto__')).toBe(centerCopy('en'));
    expect(centerCopy('auto', 7)).toBe(centerCopy('en')); expect(centerCopy('auto')).toBe(centerCopy('en'));
});
it('shows only actual changed leaves, including removed values, without translating authored profile names', () => {
    const before = { ...DEFAULT_SETTINGS, center: { ...DEFAULT_SETTINGS.center, profiles: [{ id: 'light', name: 'light', scope: { kind: 'global' }, preferences: { density: 'compact' } }] } };
    expect(settingsReviewChanges(DEFAULT_SETTINGS, structuredClone(DEFAULT_SETTINGS), centerCopy('es'))).toEqual([]);
    const rows = settingsReviewChanges(before, DEFAULT_SETTINGS, centerCopy('es'));
    expect(rows.find(row => row.id.endsWith('/name'))).toMatchObject({ before: 'light', after: 'Sin definir' });
    expect(rows.find(row => row.id.endsWith('/density'))).toMatchObject({ before: 'Compacta', after: 'Sin definir' });
    expect(settingsReviewChanges({ features: {} }, {}, centerCopy('en'))).toMatchObject([{ before: 'Inherit', after: 'Not set' }]);
});
it('renders an observer review as read-only and preserves loading or future states without synthesizing editable settings', () => {
    const client = { phase: 'ready' as const, data: null, issue: null, review: null };
    expect(centerFrame(client, { route: 'overview' }, null, 'pt-BR').copy.locale).toBe('pt');
    const before = DEFAULT_SETTINGS; const after = { ...before, paused: true };
    const frame = centerFrame({ ...client, data: { state: 'ready', settings: before, role: 'observer', rollbackAvailable: false, lastOperation: null },
        review: { state: 'preview', revision: 0, expiresAt: 1000, action: 'preferences', before, after } }, { route: 'data' }, { route: 'help' }, 'en', 4);
    expect(frame.review?.editable).toBe(false); expect(frame.review?.changes).toHaveLength(1); expect(frame.draftEpoch).toBe(4);
});
it('plans the entire appearance form atomically and rejects unsupported or incomplete values', () => {
    const values = { theme: 'dark', density: 'compact', text: 'large', motion: 'reduced', contrast: 'high' };
    expect(planSettingsChange(DEFAULT_SETTINGS, { type: 'appearance', values })).toMatchObject({ state: 'ready', action: 'appearance', settings: { revision: 0, theme: 'dark', center: { appearance: { text: 'large' } } } });
    for (const invalid of [{ ...values, extra: true }, { theme: 'dark' }, { ...values, theme: 'remote' }, { ...values, text: 'tiny' }]) {
        expect(planSettingsChange(DEFAULT_SETTINGS, { type: 'appearance', values: invalid }).state).toBe('invalid');
    }
});
it('protects drafts and reviews across navigation and never leaves during an in-flight persistence operation', () => {
    const replaced: string[] = []; let changed = 0;
    const navigation = new CenterNavigation('#/appearance', { replace: hash => { replaced.push(hash); }, changed: () => { changed++; } });
    navigation.navigate('#/appearance'); expect(changed).toBe(0); navigation.dirty(true); navigation.navigate('#/language');
    expect(navigation.location.route).toBe('appearance'); expect(navigation.pendingLocation?.route).toBe('language'); expect(replaced.at(-1)).toBe('#/appearance');
    navigation.stay(); expect(navigation.pendingLocation).toBeNull(); navigation.navigate('#/data'); navigation.protect(true, true); navigation.leave();
    expect(navigation.location.route).toBe('appearance'); navigation.protect(false, false); navigation.leave(); expect(navigation.location.route).toBe('data');
    expect(navigation.guarded).toBe(false); navigation.leave(); navigation.navigate('#/https://evil.invalid'); expect(navigation.location.route).toBe('recovery');
    expect(new CenterNavigation('invalid', { replace() {}, changed() {} }).location.route).toBe('recovery');
});
