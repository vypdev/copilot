import { expect, it } from 'vitest';
import { planClosedTabPauses } from '../../src/domain/closed_tab_pauses.ts';

const before = { schemaVersion: 1, revision: 4, emergency: true, tabs: [3, 7, 9] };
it('expires only actual closed native IDs and preserves emergency and unrelated tab scopes', () => {
    expect(planClosedTabPauses(before, [3, 9, 12])).toEqual({ state: 'ready', before,
        after: { ...before, revision: 5, tabs: [7] } }); expect(before.tabs).toEqual([3, 7, 9]); expect(Object.isFrozen(before)).toBe(false);
});
it('owns an immutable canonical plan independent of later caller edits', () => {
    const value = { ...before, tabs: [9, 3, 7] }; const ids = [3]; const plan = planClosedTabPauses(value, ids);
    value.tabs.push(11); ids.push(7); expect(plan).toMatchObject({ state: 'ready', before: { tabs: [3, 7, 9] }, after: { tabs: [7, 9] } });
    expect(plan.state === 'ready' && Object.isFrozen(plan.after.tabs)).toBe(true);
});
it.each([[], [10], Array.from({ length: 128 }, (_, i) => i + 100)].map(ids => ({ ids })))('an unrelated/empty native closure batch %j does not write', ({ ids }) => {
    expect(planClosedTabPauses(before, ids)).toEqual({ state: 'unchanged' });
});
it.each([null, {}, [-1], ['3'], [3, 3], Array(2), Object.assign([3], { extra: true }), Array.from({ length: 129 }, (_, i) => i)].map(ids => ({ ids })))('rejects an invalid native closure batch %j', ({ ids }) => {
    expect(planClosedTabPauses(before, ids)).toEqual({ state: 'invalid', reason: 'invalid-input' });
});
it('never overwrites unknown data or overflows a native revision', () => {
    expect(planClosedTabPauses({ schemaVersion: 99 }, [3])).toEqual({ state: 'invalid', reason: 'invalid-input' });
    const exhausted = { ...before, revision: Number.MAX_SAFE_INTEGER };
    expect(planClosedTabPauses(exhausted, [3])).toEqual({ state: 'invalid', reason: 'overflow' }); expect(planClosedTabPauses(exhausted, [])).toEqual({ state: 'unchanged' });
});
