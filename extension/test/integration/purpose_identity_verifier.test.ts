import { expect, it, vi } from 'vitest';
import { purposeIdentityFixture as fixture } from '../fixtures/purpose_identity.ts';
import { deferred, requestResult } from '../fixtures/runtime.ts';
import { SESSION_KEY } from '../../src/application/protected_session.ts';
import { NAMED_SESSIONS_KEY } from '../../src/application/named_sessions.ts';
import type { ReadResult } from '../../src/application/read_ports.ts';
import { initialSchedule } from '../../src/domain/scheduling.ts';

it('a purpose identity uses two closed GETs and the shared budget without activating a read credential or certifying write permissions', async () => {
    const h = fixture(); const result = await h.verify();
    expect(result).toEqual({ state: 'verified', identity: { viewerId: '1', viewerLogin: 'octo', repositoryId: '7', repository: 'octo/example' } });
    expect(h.reader.read).toHaveBeenCalledTimes(2); expect(vi.mocked(h.reader.read).mock.calls.map(([request]) => request)).toEqual([{ type: 'viewer' }, { type: 'repository', name: 'octo/example' }]);
    expect(h.values.has(SESSION_KEY)).toBe(false); expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(false); expect(h.service.status().state).toBe('disconnected');
    expect(JSON.stringify(result)).not.toContain(h.entry.connection.secret); expect(Object.isFrozen(result)).toBe(true);
    expect(vi.mocked(h.port.set).mock.calls.every(([key]) => key === 'copilot.schedule.v1')).toBe(true);
});
it.each(['purpose', 'token-family', 'repository'] as const)('invalid %s is rejected before protection, scheduling or provider access', kind => {
    const h = fixture(); const result = h.verifier.verify(kind === 'purpose' ? 'setup' as 'issues-write' : 'issues-write',
        kind === 'token-family' ? 'ghp_synthetic_classic' : h.entry.connection.secret, kind === 'repository' ? 'https://elsewhere.test/repo' : h.entry.connection.repository, h.current);
    return expect(result).resolves.toEqual({ state: 'invalid' }).then(() => { expect(h.ports.protected).not.toHaveBeenCalled(); expect(h.reader.read).not.toHaveBeenCalled(); });
});
it('an already retired native source cannot inspect protection or a credential', async () => {
    const h = fixture(); h.current.mockReturnValue(false); expect(await h.verify()).toEqual({ state: 'stale' }); expect(h.ports.protected).not.toHaveBeenCalled(); expect(h.port.get).not.toHaveBeenCalled();
});
it('unavailable native cancellation cannot start verification or leave a running owner behind', async () => {
    const h = fixture(); const create = h.ports.cancellation; h.ports.cancellation = () => { throw new Error('private native cancellation failure'); };
    expect(await h.verify()).toEqual({ state: 'unavailable' }); expect(h.reader.read).not.toHaveBeenCalled();
    h.ports.cancellation = create; expect(await h.verify()).toMatchObject({ state: 'verified' });
});
it.each(['protection', 'permission', 'truthy-protection', 'truthy-permission'] as const)('unavailable %s cannot start a provider GET', async kind => {
    const h = fixture(); if (kind.includes('protection')) h.ports.protected.mockResolvedValue((kind.startsWith('truthy') ? 'yes' : false) as boolean);
    else h.ports.permitted.mockResolvedValue((kind.startsWith('truthy') ? 'yes' : false) as boolean);
    expect(await h.verify()).toEqual({ state: 'unavailable' }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('a native source lost while permission is pending cannot begin identity verification', async () => {
    const h = fixture(); const gate = deferred<boolean>(); h.ports.permitted.mockReturnValueOnce(gate.promise); const pending = h.verify();
    await vi.waitFor(() => expect(h.ports.permitted).toHaveBeenCalled()); h.current.mockReturnValue(false); gate.resolve(true);
    expect(await pending).toEqual({ state: 'stale' }); expect(h.reader.read).not.toHaveBeenCalled();
});
it.each(['viewer', 'repository'] as const)('invalidation during the %s GET retires its response and aborts its actual cancellation', async stage => {
    const h = fixture(); const gate = deferred<ReadResult>(); const entered = deferred<void>();
    vi.mocked(h.reader.read).mockImplementation(async request => { if (request.type === stage) { entered.resolve(); return gate.promise; } return requestResult(request); });
    const pending = h.verify(); await entered.promise; const source = vi.mocked(h.reader.read).mock.calls.at(-1)![2]; h.verifier.invalidate();
    expect(source.aborted).toBe(true); gate.resolve({ state: 'ok', bytes: 10, etag: '', data: stage === 'viewer' ? { id: '1', login: 'octo' } : { id: '7', name: 'octo/example' } });
    expect(await pending).toEqual({ state: 'stale' }); expect(h.values.has(SESSION_KEY)).toBe(false);
});
it('another verification cannot evade a running request or free its slot until invalidated native work drains', async () => {
    const h = fixture(); const gate = deferred<ReadResult>(); vi.mocked(h.reader.read).mockReturnValueOnce(gate.promise); const pending = h.verify();
    await vi.waitFor(() => expect(h.reader.read).toHaveBeenCalled()); expect(await h.verify()).toEqual({ state: 'conflict' }); h.verifier.invalidate();
    expect(await h.verify()).toEqual({ state: 'conflict' }); gate.resolve({ state: 'aborted', bytes: 0 }); expect(await pending).toEqual({ state: 'stale' });
    h.advance(61000); expect(await h.verify()).toMatchObject({ state: 'verified' });
});
it.each(['viewer', 'repository'] as const)('an identity source lost after the %s provider reply cannot verify its candidate', async stage => {
    const h = fixture(); vi.mocked(h.reader.read).mockImplementation(async request => { if (request.type === stage) h.current.mockReturnValue(false); return requestResult(request); });
    expect(await h.verify()).toEqual({ state: 'stale' }); expect(h.reader.read).toHaveBeenCalledTimes(stage === 'viewer' ? 1 : 2);
});
it.each(['viewer', 'repository'] as const)('a wrong %s DTO cannot be treated as its expected identity fact', async stage => {
    const h = fixture(); vi.mocked(h.reader.read).mockImplementation(async request => request.type === stage
        ? { state: 'ok', bytes: 10, etag: '', data: stage === 'viewer' ? { id: '7', name: 'octo/example' } : { id: '1', login: 'octo' } } : requestResult(request));
    expect(await h.verify()).toEqual({ state: 'unavailable' });
});
it.each(['unauthorized', 'denied', 'offline', 'invalid', 'partial', 'aborted'] as const)('the provider %s outcome is contained without another credential or purpose fallback', async state => {
    const h = fixture(); vi.mocked(h.reader.read).mockResolvedValueOnce({ state, bytes: 0 }); expect(await h.verify()).toEqual({ state: 'unavailable' }); expect(h.reader.read).toHaveBeenCalledTimes(1);
});
it('GitHub rate limits retain their retry boundary instead of being reported as verified identity', async () => {
    const h = fixture(); vi.mocked(h.reader.read).mockResolvedValueOnce({ state: 'limited', retryAfter: 60, bytes: 0 });
    expect(await h.verify()).toEqual({ state: 'limited', retryAt: 160000 });
});
it.each(['budget', 'cooldown'] as const)('the actual shared %s gate prevents optional identity GETs and retains its deadline', async kind => {
    const h = fixture(); h.values.set('copilot.schedule.v1', { ...initialSchedule(100000), ...(kind === 'budget' ? { count: 600 } : { blockedUntil: 160000 }) });
    expect(await h.verify()).toEqual({ state: kind, retryAt: kind === 'budget' ? 3700000 : 160000 }); expect(h.reader.read).not.toHaveBeenCalled();
});
it('a scheduler refusal without a trustworthy retry boundary stays unavailable for verification and cannot invent a deadline', async () => {
    const h = fixture(); vi.spyOn(h.scheduler, 'run').mockResolvedValueOnce({ state: 'budget', bytes: 0 });
    expect(await h.verify()).toEqual({ state: 'budget' }); expect(h.reader.read).not.toHaveBeenCalled();
});
it.each(['viewer', 'repository'] as const)('a provider failure at %s is not a partially verified candidate', async stage => {
    const h = fixture(); vi.mocked(h.reader.read).mockImplementation(async request => request.type === stage ? { state: 'denied', bytes: 0 } : requestResult(request));
    expect(await h.verify()).toEqual({ state: 'unavailable' }); expect(h.values.has(NAMED_SESSIONS_KEY)).toBe(false);
});
it('the combined identity byte limit cannot be bypassed by two individually bounded replies', async () => {
    const h = fixture(); vi.mocked(h.reader.read).mockImplementation(async request => ({ ...requestResult(request), bytes: 600000 })); expect(await h.verify()).toEqual({ state: 'unavailable' });
});
it.each(['viewerId', 'repositoryId'] as const)('a moved numeric %s cannot reselect a previously saved identity', async field => {
    const h = fixture(); expect(await h.verifier.verify('issues-write', h.entry.connection.secret, 'octo/example', h.current, { ...h.entry.connection, [field]: '2' })).toEqual({ state: 'unavailable' });
});
it('a confirmed canonical rename with matching numeric identities can be retained without promoting grant authority', async () => {
    const h = fixture(); vi.mocked(h.reader.read).mockImplementation(async request => request.type === 'viewer' ? { ...requestResult(request), data: { id: '1', login: 'new-name' } }
        : { ...requestResult(request), data: { id: '7', name: 'new-name/renamed', organizationId: '9' } });
    expect(await h.verifier.verify('issues-write', h.entry.connection.secret, 'new-name/renamed', h.current, h.entry.connection)).toEqual({ state: 'verified', identity: {
        viewerId: '1', viewerLogin: 'new-name', repositoryId: '7', repository: 'new-name/renamed', organizationId: '9' } });
});
it('malformed provider identity fields are rejected even when the semantic DTO kind looks correct', async () => {
    const h = fixture(); vi.mocked(h.reader.read).mockResolvedValueOnce({ state: 'ok', bytes: 10, etag: '', data: { id: '0', login: 'octo' } }); expect(await h.verify()).toEqual({ state: 'unavailable' });
});
it.each(['protection', 'permission', 'source'] as const)('lost final %s prevents publication after both identity reads', async kind => {
    const h = fixture(); if (kind === 'protection') h.ports.protected.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    if (kind === 'permission') h.ports.permitted.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    if (kind === 'source') h.ports.permitted.mockResolvedValueOnce(true).mockImplementationOnce(async () => { h.current.mockReturnValue(false); return true; });
    expect(await h.verify()).toEqual({ state: kind === 'source' ? 'stale' : 'unavailable' }); expect(h.reader.read).toHaveBeenCalledTimes(2);
});
it('provider exceptions expose no native credential or original error and release the verifier slot', async () => {
    const h = fixture(); vi.mocked(h.reader.read).mockRejectedValueOnce(new Error('private provider error')); expect(await h.verify()).toEqual({ state: 'unavailable' });
    h.advance(61000); expect(await h.verify()).toMatchObject({ state: 'verified' });
});
it('two optional purposes and attempts cannot reuse one another’s ETag or cached identity', async () => {
    const h = fixture(); expect(await h.verify()).toMatchObject({ state: 'verified' }); h.advance(61000);
    expect(await h.verifier.verify('actions-write', 'github_pat_other_synthetic_purpose', 'octo/example', h.current)).toMatchObject({ state: 'verified' });
    expect(vi.mocked(h.reader.read).mock.calls.map(([, secret]) => secret)).toEqual([h.entry.connection.secret, h.entry.connection.secret, 'github_pat_other_synthetic_purpose', 'github_pat_other_synthetic_purpose']);
    expect(vi.mocked(h.reader.read).mock.calls.every(([, , , etag]) => etag === undefined)).toBe(true);
});
