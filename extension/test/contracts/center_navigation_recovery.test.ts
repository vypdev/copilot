import { expect, it, vi } from 'vitest';
import { CenterNavigation } from '../../src/application/center_navigation.ts';

it('replaces rejected fragments even when Recovery is already selected, without republishing or retaining their content', () => {
    const port = { replace: vi.fn(), changed: vi.fn() };
    const navigation = new CenterNavigation('#/recovery', port);
    for (const hash of ['#/unknown-private-marker', '#/profiles/%2Fprivate-marker', '#/https://foreign.invalid/private-marker', '#/' + 'x'.repeat(129)]) {
        navigation.navigate(hash);
        expect(port.replace).toHaveBeenLastCalledWith('#/recovery');
    }
    expect(port.replace).toHaveBeenCalledTimes(4); expect(port.changed).not.toHaveBeenCalled();
    expect(navigation.location).toEqual({ route: 'recovery' }); expect(navigation.pendingLocation).toBeNull();
    expect(JSON.stringify(port.replace.mock.calls)).not.toContain('private-marker');
    navigation.navigate('#/recovery'); expect(port.replace).toHaveBeenCalledTimes(4);
});

it('same-route Recovery preserves the guarded destination and editing state until an explicit decision', () => {
    const port = { replace: vi.fn(), changed: vi.fn() }; const navigation = new CenterNavigation('#/recovery', port);
    navigation.dirty(true); navigation.protect(true, false); navigation.navigate('#/data');
    const pending = navigation.pendingLocation; port.replace.mockClear(); port.changed.mockClear();
    navigation.navigate('#/unknown-private-marker');
    expect(port.replace).toHaveBeenCalledExactlyOnceWith('#/recovery'); expect(port.changed).not.toHaveBeenCalled();
    expect(navigation.pendingLocation).toBe(pending); expect(pending).toEqual({ route: 'data' });
    expect(navigation.guarded).toBe(true); expect(navigation.hasDraft).toBe(true);
    expect(navigation.location).toEqual({ route: 'recovery' });
    navigation.navigate('#/recovery');
    expect(port.replace).toHaveBeenCalledTimes(1); expect(port.changed).not.toHaveBeenCalled();
    expect(navigation.pendingLocation).toBe(pending); expect(navigation.hasDraft).toBe(true);
    navigation.stay();
    expect(navigation.pendingLocation).toBeNull(); expect(port.changed).toHaveBeenCalledOnce();
    expect(navigation.hasDraft).toBe(true);
});
