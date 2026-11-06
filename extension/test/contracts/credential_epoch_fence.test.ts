import { expect, it, vi } from 'vitest';
import { CredentialEpochFence } from '../../src/application/credential_epoch_fence.ts';

it('a native operation starts bound to the exact current credential epoch', () => {
    let epoch = 2; const fence = new CredentialEpochFence(() => epoch); expect(fence.current()).toBe(true); epoch = 3; expect(fence.current()).toBe(false);
});
it('this operation’s synchronous native callbacks can preserve its own exact sequential advances without creating completion authority', () => {
    let epoch = 2; const fence = new CredentialEpochFence(() => epoch); const trace = fence.follow(null);
    epoch = 3; trace.credential(2, 3); expect(fence.current()).toBe(true); epoch = 4; trace.credential(3, 4); expect(fence.current()).toBe(true);
    expect(trace.step('save-active')).toBeNull(); expect(Object.keys(trace).sort()).toEqual(['credential', 'step']);
});
it.each(['external-previous', 'skipped-advance', 'same-epoch', 'backwards'] as const)('a %s callback cannot adopt an unrelated credential generation', kind => {
    let epoch = 2; const fence = new CredentialEpochFence(() => epoch); const trace = fence.follow(null);
    const previous = kind === 'external-previous' ? 3 : 2; const next = kind === 'external-previous' ? 4 : kind === 'skipped-advance' ? 4 : kind === 'same-epoch' ? 2 : 1;
    epoch = kind === 'same-epoch' ? 3 : next; trace.credential(previous, next); expect(fence.current()).toBe(false);
});
it('an unrelated external advance stays retired even if a later genuine callback has its own consecutive epochs', () => {
    let epoch = 2; const fence = new CredentialEpochFence(() => epoch); const trace = fence.follow(null); epoch = 3; expect(fence.current()).toBe(false);
    epoch = 4; trace.credential(3, 4); expect(fence.current()).toBe(false);
});
it('optional observation failure cannot suppress a genuine native advance or escape from its bounded trace adapter', () => {
    let epoch = 2; const observer = { step: vi.fn(() => { throw new Error('private observer'); }), credential: vi.fn(() => { throw new Error('private observer'); }), complete: vi.fn() };
    const fence = new CredentialEpochFence(() => epoch); const trace = fence.follow(observer); epoch = 3; trace.credential(2, 3);
    expect(fence.current()).toBe(true); expect(trace.step('save-active')).toBeNull(); expect(observer.complete).not.toHaveBeenCalled();
});
it('the adapter forwards actual effect observations without constructing or completing another operation', () => {
    const step = { submitted: vi.fn(), settled: vi.fn() }; const observer = { step: vi.fn(() => step), credential: vi.fn(), complete: vi.fn() };
    const trace = new CredentialEpochFence(() => 2).follow(observer); expect(trace.step('save-vault')).toBe(step); trace.credential(2, 3);
    expect(observer.step).toHaveBeenCalledWith('save-vault'); expect(observer.credential).toHaveBeenCalledWith(2, 3); expect(observer.complete).not.toHaveBeenCalled();
});
