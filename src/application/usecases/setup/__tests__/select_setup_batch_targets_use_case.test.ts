import { SelectSetupBatchTargetsUseCase } from '../select_setup_batch_targets_use_case';
import { SetupInteractionCancelledError } from '../../../errors/setup_interaction_cancelled_error';
import type { SetupBatchSelectionView } from '../../../contracts/setup_batch_view';
import type { SetupBatchTarget } from '../../../../domain/setup_batch';
const target = (id = 7, name = 'platform'): SetupBatchTarget => ({ id, ownerId: 3, owner: 'acme', name, defaultBranch: 'master',
  baseSha: 'a'.repeat(40), private: true, archived: false, disabled: false, canPush: true });
function fixture() {
  const discovery = { resolve: jest.fn(async (_organization: string, name: string, _token: string) => target(name === 'copilot' ? 8 : 7, name)),
    list: jest.fn(async () => ({ targets: [target(), target(8, 'copilot')], truncated: false })) };
  const choose = jest.fn<Promise<string | undefined>, [SetupBatchSelectionView]>();
  const requestToken = jest.fn<Promise<string | undefined>, [readonly string[]]>();
  const active = jest.fn(() => true);
  const useCase = new SelectSetupBatchTargetsUseCase({ discovery, choose, requestToken, active });
  const request = { organization: 'acme', currentRepository: 'platform', token: 'fixture-private-operator-token' };
  return { discovery, choose, requestToken, active, useCase, request };
}
describe('credential-limited repository selection', () => {
  it.each([
    { targets: [target(), target(7, 'duplicate-id')] },
    { targets: [target(), target(8, 'PLATFORM')] },
    { targets: [target(), { ...target(8, 'other'), ownerId: 4 }] },
  ])('keeps ambiguous discovery unavailable instead of selecting from it', async result => {
    const f = fixture(); f.discovery.list.mockResolvedValue({ ...result, truncated: false }); f.choose.mockResolvedValue(undefined);
    await expect(f.useCase.execute(f.request)).rejects.toBeInstanceOf(SetupInteractionCancelledError);
    expect(f.choose.mock.calls[0][0]).toMatchObject({ discoveryStatus: 'unavailable', selectedIds: [7] });
  });
  it('marks a selected identity unavailable if its re-resolution changes ID', async () => {
    const f = fixture(); f.discovery.resolve.mockResolvedValueOnce(target()).mockResolvedValueOnce(target(99)); f.choose.mockResolvedValue(undefined);
    await expect(f.useCase.execute(f.request)).rejects.toBeInstanceOf(SetupInteractionCancelledError);
    expect(f.choose.mock.calls[0][0].candidates.find(candidate => candidate.id === 7)?.unavailable).toBe('access-unavailable');
  });
  it.each([{ archived: true, reason: 'archived' }, { disabled: true, reason: 'disabled' }, { canPush: false, reason: 'read-only' }])(
    'discloses an unavailable candidate without selecting it: $reason', async ({ reason, ...change }) => {
      const f = fixture(); f.discovery.list.mockResolvedValue({ targets: [target(), { ...target(8, 'copilot'), ...change }], truncated: false });
      f.choose.mockResolvedValue(undefined); await expect(f.useCase.execute(f.request)).rejects.toBeInstanceOf(SetupInteractionCancelledError);
      expect(f.choose.mock.calls[0][0].candidates.find(candidate => candidate.id === 8)?.unavailable).toBe(reason);
      expect(f.choose.mock.calls[0][0].selectedIds).toEqual([7]);
    });
  it('does not preselect an archived current repository', async () => {
    const f = fixture(); f.discovery.resolve.mockResolvedValue({ ...target(), archived: true }); f.choose.mockResolvedValue(undefined);
    await expect(f.useCase.execute(f.request)).rejects.toBeInstanceOf(SetupInteractionCancelledError);
    expect(f.choose.mock.calls[0][0].selectedIds).toEqual([]);
  });
  it('rejects a lookup that unexpectedly resolves into another organization', async () => {
    const f = fixture(); f.discovery.resolve.mockResolvedValueOnce(target()).mockResolvedValueOnce(target()).mockResolvedValueOnce({ ...target(9, 'foreign'), ownerId: 99 });
    f.choose.mockResolvedValueOnce(JSON.stringify({ action: 'resolve', selectedIds: [7], name: 'foreign' })).mockResolvedValueOnce(undefined);
    await expect(f.useCase.execute(f.request)).rejects.toBeInstanceOf(SetupInteractionCancelledError);
    expect(f.choose.mock.calls[1][0].message).toBe('lookup-unavailable');
  });
  it('keeps the current PAT and discloses unavailable access when replacement is declined', async () => {
    const f = fixture(); f.requestToken.mockResolvedValue(undefined);
    f.choose.mockResolvedValueOnce(JSON.stringify({ action: 'access', selectedIds: [7] })).mockResolvedValueOnce(undefined);
    await expect(f.useCase.execute(f.request)).rejects.toBeInstanceOf(SetupInteractionCancelledError);
    expect(f.choose.mock.calls[1][0].message).toBe('access-unavailable'); expect(f.discovery.list).toHaveBeenCalledTimes(1);
  });
  it('does not offer selection after the shared session becomes inactive', async () => {
    const f = fixture(); f.active.mockReturnValue(false);
    await expect(f.useCase.execute(f.request)).rejects.toBeInstanceOf(SetupInteractionCancelledError); expect(f.choose).not.toHaveBeenCalled();
  });
  it('defaults to the current identity and never selects another visible repository implicitly', async () => {
    const f = fixture(); f.choose.mockResolvedValue(JSON.stringify({ action: 'select', selectedIds: [7] }));
    expect(await f.useCase.execute(f.request)).toEqual({ token: f.request.token, selected: [{ id: 7, name: 'platform' }] });
    expect(f.choose.mock.calls[0][0].selectedIds).toEqual([7]);
    expect(JSON.stringify(f.choose.mock.calls)).not.toContain(f.request.token);
  });
  it('lets an exact-name lookup extend the visible view without selecting that target', async () => {
    const f = fixture();
    f.choose.mockResolvedValueOnce(JSON.stringify({ action: 'resolve', selectedIds: [7], name: 'new-service' }))
      .mockResolvedValueOnce(JSON.stringify({ action: 'select', selectedIds: [7] }));
    f.discovery.resolve.mockImplementation(async (_organization, name) => target(name === 'new-service' ? 9 : 7, name));
    const result = await f.useCase.execute(f.request);
    expect(result.selected).toEqual([{ id: 7, name: 'platform' }]);
    expect(f.choose.mock.calls[1][0].candidates[0]).toMatchObject({ id: 9, name: 'new-service' });
    expect(f.choose.mock.calls[1][0].selectedIds).toEqual([7]);
  });
  it('retains the current target when listing is unavailable and discloses the limited view', async () => {
    const f = fixture(); f.discovery.list.mockRejectedValue(new Error('private provider prose'));
    f.choose.mockResolvedValue(JSON.stringify({ action: 'select', selectedIds: [7] }));
    await f.useCase.execute(f.request);
    expect(f.choose.mock.calls[0][0]).toMatchObject({ discoveryStatus: 'unavailable', selectedIds: [7] });
    expect(JSON.stringify(f.choose.mock.calls)).not.toContain('private provider prose');
  });
  it('does not reinterpret a hidden exact-name target as absent or automatically broaden access', async () => {
    const f = fixture();
    f.discovery.resolve.mockImplementation(async (_organization, name) => { if (name === 'hidden') throw new Error('private details'); return target(); });
    f.choose.mockResolvedValueOnce(JSON.stringify({ action: 'resolve', selectedIds: [7], name: 'hidden' }))
      .mockResolvedValueOnce(JSON.stringify({ action: 'select', selectedIds: [7] }));
    await f.useCase.execute(f.request);
    expect(f.choose.mock.calls[1][0].message).toBe('lookup-unavailable'); expect(f.requestToken).not.toHaveBeenCalled();
  });
  it('revalidates selected IDs after an explicitly requested PAT change without selecting everything newly visible', async () => {
    const f = fixture(); f.requestToken.mockResolvedValue('replacement-private-token');
    f.choose.mockResolvedValueOnce(JSON.stringify({ action: 'access', selectedIds: [7] }))
      .mockResolvedValueOnce(JSON.stringify({ action: 'select', selectedIds: [7] }));
    const result = await f.useCase.execute(f.request);
    expect(result.token).toBe('replacement-private-token'); expect(result.selected).toHaveLength(1);
    expect(f.requestToken).toHaveBeenCalledWith(['platform']);
    expect(f.discovery.resolve).toHaveBeenCalledWith('acme', 'platform', 'replacement-private-token');
    expect(JSON.stringify(f.choose.mock.calls)).not.toContain('replacement-private-token');
  });
  it('keeps access unknown when a replacement PAT cannot refresh discovery', async () => {
    const f = fixture(); f.requestToken.mockResolvedValue('replacement');
    f.discovery.list.mockResolvedValueOnce({ targets: [target()], truncated: false }).mockRejectedValueOnce(new Error('hidden'));
    f.choose.mockResolvedValueOnce(JSON.stringify({ action: 'access', selectedIds: [7] })).mockResolvedValueOnce(undefined);
    await expect(f.useCase.execute(f.request)).rejects.toBeInstanceOf(SetupInteractionCancelledError);
    expect(f.choose.mock.calls[1][0].candidates[0].unavailable).toBe('access-unavailable');
  });
  it('reasks invalid or implicit-all input without issuing provider writes', async () => {
    const f = fixture(); f.choose.mockResolvedValueOnce(JSON.stringify({ action: 'all', selectedIds: [7, 8] }))
      .mockResolvedValueOnce(JSON.stringify({ action: 'select', selectedIds: [7, 8] }));
    expect((await f.useCase.execute(f.request)).selected.map(item => item.id)).toEqual([7, 8]);
    expect(f.choose.mock.calls[1][0].message).toBe('selection-invalid');
  });
  it('treats browser or terminal cancellation as a shared cancellation signal', async () => {
    const f = fixture(); f.choose.mockResolvedValue(undefined);
    await expect(f.useCase.execute(f.request)).rejects.toBeInstanceOf(SetupInteractionCancelledError);
  });
});
