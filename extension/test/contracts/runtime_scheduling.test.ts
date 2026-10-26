import { expect, it } from 'vitest';
import { initialSchedule, rateLimit, reserveRead, scheduleDecision, validSchedule } from '../../src/domain/scheduling.ts';

const active = { visible: true, active: true, online: true, pending: true, manual: false };
it('github-browser-extension-runtime-C05 rejects malformed scheduling state and enforces activity, clock and anonymous/manual rules', () => {
    const state = initialSchedule(1000); expect(validSchedule(state)).toBe(true);
    for (const value of [null, { ...state, extra: 1 }, { ...state, count: -1 }, { ...state, repositories: null }, { ...state, targets: [] },
        { ...state, repositories: { a: -1 } }, { ...state, targets: { a: false } },
        { ...state, repositories: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [i, 1])) },
        { ...state, targets: Object.fromEntries(Array.from({ length: 129 }, (_, i) => [i, 1])) }]) expect(validSchedule(value)).toBe(false);
    for (const activity of [{ ...active, visible: false }, { ...active, active: false }, { ...active, online: false }, { ...active, pending: false }]) {
        expect(scheduleDecision(state, 1000, 'target', 'repo', true, activity)).toBe('inactive');
    }
    expect(scheduleDecision(state, 1000, 'target', 'repo', false, active)).toBe('inactive');
    expect(scheduleDecision(state, 1000, 'target', 'repo', false, { ...active, manual: true, pending: false })).toBe('allowed');
    expect(scheduleDecision(state, 1000, 'target', 'repo', true, active)).toBe('allowed');
});
it('github-browser-extension-runtime-C23 caps total/account/repository/anonymous/target cardinality and preserves nextAllowedAt', () => {
    const state = initialSchedule(1000);
    for (const modified of [{ ...state, count: 600 }, { ...state, repositories: { repo: 120 } },
        { ...state, repositories: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [String(i), 1])) },
        { ...state, targets: Object.fromEntries(Array.from({ length: 128 }, (_, i) => [String(i), 1])) }]) {
        expect(scheduleDecision(modified, 1000, 'target', 'repo', true, active)).toBe('budget');
    }
    expect(scheduleDecision({ ...state, anonymous: 30 }, 1000, 'target', 'repo', false, { ...active, manual: true })).toBe('budget');
    for (const modified of [{ ...state, blockedUntil: 2000 }, { ...state, targets: { target: 2000 } }]) expect(scheduleDecision(modified, 1000, 'target', 'repo', true, active)).toBe('cooldown');
    const manual = reserveRead(state, 1000, 'target', 'repo', false, true);
    expect(manual).toMatchObject({ count: 1, anonymous: 1, repositories: { repo: 1 }, targets: { target: 11000 } });
    expect(reserveRead(manual, 2000, 'target', 'repo', true, false)).toMatchObject({ count: 2, anonymous: 1, repositories: { repo: 2 }, targets: { target: 62000 } });
});
it('github-browser-extension-runtime-C23 honors provider retry guidance, bounded deterministic jitter and three bounded backoff stages', () => {
    let state = initialSchedule(1000);
    state = rateLimit(state, 1000, 0, -1); expect(state.blockedUntil).toBe(61000);
    state = rateLimit(state, 1000, NaN, 500); expect(state.blockedUntil).toBe(121500);
    state = rateLimit(state, 1000, -2, 5000); expect(state.blockedUntil).toBe(302000);
    state = rateLimit(state, 1000, 400, 0); expect(state.blockedUntil).toBe(401000);
    expect(rateLimit(state, 1000, Infinity, 0).failures).toBe(3);
    expect(rateLimit(state, 1000, 100000, 0).blockedUntil).toBe(86401000);
});
