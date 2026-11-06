import { expect, it, vi } from 'vitest';
import { observationContextChanged, readCurrentOperation } from '../../src/application/center_observation_context.ts';
import { deferred } from '../fixtures/runtime.ts';
import type { CenterIdentity } from '../../src/domain/center_reply.ts';

const owner: CenterIdentity = { clientId: 'a'.repeat(32), controllerEpoch: 1, credentialEpoch: 2, role: 'editor' };
it('an absent or stopped native owner cannot perform a metadata request', async () => {
    const request = vi.fn(async () => ({ state: 'empty' })); const current = vi.fn(() => owner);
    expect(await readCurrentOperation(null, false, request, current)).toBeNull();
    expect(await readCurrentOperation(owner, true, request, current)).toBeNull(); expect(request).not.toHaveBeenCalled(); expect(current).not.toHaveBeenCalled();
});
it('metadata sends only the native client selector and requires the same complete context after its response', async () => {
    const value = { state: 'empty' }; const request = vi.fn(async () => value);
    expect(await readCurrentOperation(owner, false, request, () => ({ ...owner }))).toBe(value);
    expect(request).toHaveBeenCalledExactlyOnceWith({ version: 1, method: 'center.operation.read', clientId: owner.clientId });
});
it.each(['clientId', 'controllerEpoch', 'credentialEpoch', 'role', 'removed'] as const)('a pending response after %s movement cannot republish private metadata', async field => {
    const gate = deferred<Record<string, unknown> | null>(); let current: CenterIdentity | null = owner;
    const pending = readCurrentOperation(owner, false, () => gate.promise, () => current);
    current = field === 'removed' ? null : { ...owner, [field]: field === 'role' ? 'observer' : field === 'clientId' ? 'b'.repeat(32) : 3 };
    gate.resolve({ state: 'current', privateLabel: 'not republished' }); expect(await pending).toBeNull();
});
it('context notifications carry no native identifiers and secondary failures cannot break the primary refresh', () => {
    const changed = vi.fn(); observationContextChanged(owner, { ...owner }, changed); expect(changed).not.toHaveBeenCalled();
    observationContextChanged(owner, { ...owner, credentialEpoch: 3 }, changed); expect(changed).toHaveBeenCalledExactlyOnceWith();
    expect(() => observationContextChanged(owner, { ...owner, role: 'observer' })).not.toThrow();
    expect(() => observationContextChanged(owner, { ...owner, role: 'observer' }, () => { throw new Error('secondary'); })).not.toThrow();
});
