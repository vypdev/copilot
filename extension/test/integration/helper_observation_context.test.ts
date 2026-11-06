import { expect, it, vi } from 'vitest';
import { readHelperSample } from '../../src/application/center_observation_context.ts';
import type { CenterIdentity } from '../../src/domain/center_reply.ts';
import { deferred } from '../fixtures/runtime.ts';

const owner: CenterIdentity = { clientId: 'a'.repeat(32), role: 'editor', controllerEpoch: 2, credentialEpoch: 3 };
it.each(['unadmitted', 'stopped'] as const)('an %s private client sends no helper metadata request', async state => {
    const request = vi.fn(); expect(await readHelperSample(state === 'unadmitted' ? null : owner, state === 'stopped', request, () => owner)).toBeNull(); expect(request).not.toHaveBeenCalled();
});
it('helper metadata uses one fixed own-client method without a native tab selector or mutation operand', async () => {
    const value = { state: 'empty' }; const request = vi.fn(async () => value); expect(await readHelperSample(owner, false, request, () => owner)).toBe(value);
    expect(request).toHaveBeenCalledExactlyOnceWith({ version: 1, method: 'center.health.read', clientId: owner.clientId });
});
it.each(['clientId', 'role', 'controllerEpoch', 'credentialEpoch', 'closed'] as const)('a %s change during metadata delivery cannot attribute the old result to the new client context', async field => {
    const gate = deferred<Record<string, unknown>>(); const request = vi.fn(() => gate.promise);
    const after = field === 'closed' ? null : { ...owner, [field]: field === 'clientId' ? 'b'.repeat(32) : field === 'role' ? 'observer' : 99 } as CenterIdentity;
    const pending = readHelperSample(owner, false, request, () => after); gate.resolve({ state: 'empty' }); expect(await pending).toBeNull(); expect(request).toHaveBeenCalledOnce();
});
