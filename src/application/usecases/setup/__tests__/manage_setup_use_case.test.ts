import { ManageSetupUseCase } from '../manage_setup_use_case';
import type { SetupManagementPorts } from '../../../ports/setup_management_ports';
import { localInstallation, remoteConfiguration } from '../../../../../test-support/setup-management-fixtures';
function fixture(choices: string[] = ['connect', 'edit:commentLimit', 'close']) {
 let remote = remoteConfiguration(); let active = true;
 const ports = { inspectLocal: jest.fn(localInstallation), inspectRemote: jest.fn(async () => structuredClone(remote)), choose: jest.fn(async () => choices.shift() ?? 'close'), requestToken: jest.fn(async () => 'fixture-pat'), requestValue: jest.fn(async () => '15'), confirm: jest.fn(async () => true), audit: jest.fn(async () => 'accepted'),
 write: jest.fn(async change => { remote = { ...remote, organizationVariables: remote.organizationVariables.map(item => item.name === change.variable ? { ...item, value: change.after } : item) }; return { created: 0, updated: 1, errors: [] }; }), notify: jest.fn(), approvalCurrent: jest.fn(() => true), active: jest.fn(() => active), possibleMutation: jest.fn(), recordWrite: jest.fn() } as unknown as jest.Mocked<SetupManagementPorts>;
 return { ports, useCase: new ManageSetupUseCase(ports), setRemote: (value: typeof remote) => { remote = value; }, stop: () => { active = false; } };
}
describe('manage setup transaction', () => {
 test('inspection closes without requesting credentials or writing', async () => {
  const f = fixture(['close']); expect(await f.useCase.execute()).toBe('complete'); expect(f.ports.requestToken).not.toHaveBeenCalled(); expect(f.ports.audit).not.toHaveBeenCalled(); expect(f.ports.write).not.toHaveBeenCalled();
 });
 test('hands off explicitly to the full assistant', async () => expect(await fixture(['wizard']).useCase.execute()).toBe('continue'));
 test('connect and refresh read only, reusing the in-memory token', async () => {
  const f = fixture(['connect', 'refresh', 'close']); await f.useCase.execute(); expect(f.ports.requestToken).toHaveBeenCalledTimes(1); expect(f.ports.inspectRemote).toHaveBeenCalledTimes(2); expect(f.ports.write).not.toHaveBeenCalled();
 });
 test('a blank or dismissed token returns to the panel', async () => {
  const f = fixture(['connect', 'close']); f.ports.requestToken.mockResolvedValue(undefined); expect(await f.useCase.execute()).toBe('complete'); expect(f.ports.inspectRemote).not.toHaveBeenCalled();
 });
 test('a rejected connection forgets the token and permits a fresh one', async () => {
  const f = fixture(['connect', 'connect', 'close']); f.ports.inspectRemote.mockRejectedValueOnce(new Error('private provider text')); await f.useCase.execute(); expect(f.ports.requestToken).toHaveBeenCalledTimes(2); expect(f.ports.notify).toHaveBeenCalledWith('blocked');
 });
 test('a forged edit before connecting never requests a value', async () => {
  const f = fixture(['edit:commentLimit', 'close']); await f.useCase.execute(); expect(f.ports.requestValue).not.toHaveBeenCalled();
 });
 test('an unknown edit after connecting never writes', async () => {
  const f = fixture(['connect', 'edit:forged', 'close']); await f.useCase.execute(); expect(f.ports.requestValue).not.toHaveBeenCalled(); expect(f.ports.write).not.toHaveBeenCalled();
 });
 test('an inaccessible inventory disables the edit', async () => {
  const f = fixture(); f.setRemote({ ...remoteConfiguration(), repositoryVariablesAccess: 'unavailable' }); await f.useCase.execute(); expect(f.ports.requestValue).not.toHaveBeenCalled();
 });
 test('cancelled value entry returns without a probe', async () => {
  const f = fixture(); f.ports.requestValue.mockResolvedValue(undefined); await f.useCase.execute(); expect(f.ports.audit).not.toHaveBeenCalled();
 });
 test('an invalid value retains the configuration', async () => {
  const f = fixture(); f.ports.requestValue.mockResolvedValue('invalid'); await f.useCase.execute(); expect(f.ports.notify).toHaveBeenCalledWith('invalid'); expect(f.ports.audit).not.toHaveBeenCalled();
 });
 test('an unchanged value does not require approval or probes', async () => {
  const f = fixture(); f.ports.requestValue.mockResolvedValue('20'); await f.useCase.execute(); expect(f.ports.notify).toHaveBeenCalledWith('unchanged'); expect(f.ports.confirm).not.toHaveBeenCalled();
 });
 test('declined review retains existing resources', async () => {
  const f = fixture(); f.ports.confirm.mockResolvedValue(false); await f.useCase.execute(); expect(f.ports.audit).not.toHaveBeenCalled(); expect(f.ports.write).not.toHaveBeenCalled();
 });
 test('permission denial permits reconnection and requires a fresh review', async () => {
  const f = fixture(['connect', 'edit:commentLimit', 'connect', 'edit:commentLimit', 'close']); f.ports.audit.mockResolvedValueOnce('blocked'); expect(await f.useCase.execute()).toBe('complete'); expect(f.ports.requestToken).toHaveBeenCalledTimes(2); expect(f.ports.confirm).toHaveBeenCalledTimes(2); expect(f.ports.write).toHaveBeenCalledTimes(1);
 });
 test('unconfirmed cleanup stops before any installed Variable write', async () => {
  const f = fixture(); f.ports.audit.mockResolvedValue('cleanup-pending'); expect(await f.useCase.execute()).toBe('partial'); expect(f.ports.possibleMutation).toHaveBeenCalledTimes(1); expect(f.ports.write).not.toHaveBeenCalled();
 });
 test('a thrown audit conservatively requires inspection', async () => {
  const f = fixture(); f.ports.audit.mockRejectedValue(new Error('probe uncertainty')); expect(await f.useCase.execute()).toBe('partial'); expect(f.ports.write).not.toHaveBeenCalled();
 });
 test('failed final inspection prevents a write', async () => {
  const f = fixture(); f.ports.inspectRemote.mockResolvedValueOnce(remoteConfiguration()).mockRejectedValueOnce(new Error('unavailable')); await f.useCase.execute(); expect(f.ports.write).not.toHaveBeenCalled();
 });
 test('remote drift invalidates approval and refreshes values', async () => {
  const f = fixture(); f.ports.audit.mockImplementation(async () => { f.setRemote({ ...remoteConfiguration(), repositoryVariables: [{ name: 'BUGBOT_COMMENT_LIMIT', value: '30' }] }); return 'accepted'; }); await f.useCase.execute(); expect(f.ports.notify).toHaveBeenCalledWith('stale'); expect(f.ports.write).not.toHaveBeenCalled();
 });
 test('checkout drift invalidates approval before writing', async () => {
  const f = fixture(); f.ports.inspectLocal.mockReturnValueOnce(localInstallation()).mockReturnValueOnce(localInstallation()).mockReturnValue({ ...localInstallation(), revision: 'changed-head' }); await f.useCase.execute(); expect(f.ports.notify).toHaveBeenCalledWith('stale'); expect(f.ports.write).not.toHaveBeenCalled();
 });
 test('success requires exactly one write and read-back of both value and scope', async () => {
  const f = fixture(); expect(await f.useCase.execute()).toBe('complete'); expect(f.ports.recordWrite).toHaveBeenCalledWith(true, 'organization'); expect(f.ports.write).toHaveBeenCalledWith(expect.objectContaining({ before: '20', after: '15', scope: 'organization' }), 'fixture-pat', expect.any(Object)); expect(f.ports.notify).toHaveBeenCalledWith('updated');
 });
 test('a provider error receipt is partial even when a write reached GitHub', async () => {
  const f = fixture(); f.ports.write.mockResolvedValue({ created: 0, updated: 0, errors: ['redacted'] }); expect(await f.useCase.execute()).toBe('partial'); expect(f.ports.recordWrite).toHaveBeenCalledWith(false, 'organization');
 });
 test('a successful response with mismatched read-back stays partial', async () => {
  const f = fixture(); f.ports.write.mockResolvedValue({ created: 0, updated: 1, errors: [] }); expect(await f.useCase.execute()).toBe('partial');
 });
 test('a write exception stops without automatic retry or rollback', async () => {
  const f = fixture(); f.ports.write.mockRejectedValue(new Error('uncertain')); expect(await f.useCase.execute()).toBe('partial'); expect(f.ports.write).toHaveBeenCalledTimes(1); expect(f.ports.notify).toHaveBeenCalledWith('partial');
 });
 test('a read-back exception after a successful write stays partial', async () => {
  const f = fixture(); f.ports.inspectRemote.mockResolvedValueOnce(remoteConfiguration()).mockResolvedValueOnce(remoteConfiguration()).mockRejectedValueOnce(new Error('gone')); expect(await f.useCase.execute()).toBe('partial'); expect(f.ports.recordWrite).toHaveBeenCalledWith(false, 'organization');
 });
 test('multiple edits each require approval, including restoring the original value', async () => {
  const f = fixture(['connect', 'edit:commentLimit', 'edit:commentLimit', 'close']); f.ports.requestValue.mockResolvedValueOnce('15').mockResolvedValueOnce('20'); expect(await f.useCase.execute()).toBe('complete'); expect(f.ports.confirm).toHaveBeenCalledTimes(2); expect(f.ports.write).toHaveBeenCalledTimes(2); const last = f.ports.choose.mock.calls[f.ports.choose.mock.calls.length - 1][0]; expect(last.changed).toBe(true); expect(last.variables).not.toContainEqual(expect.objectContaining({ name: 'UNRELATED' }));
 });
 test('cannot replay one management session', async () => {
  const f = fixture(['close']); await f.useCase.execute(); await expect(f.useCase.execute()).rejects.toThrow('only once');
 });
 test.each(['review', 'audit', 'final-read'])('cancellation at %s prevents a new write', async stage => {
  const f = fixture(); if (stage === 'review') f.ports.confirm.mockImplementation(async () => { f.stop(); return true; });
  if (stage === 'audit') f.ports.audit.mockImplementation(async () => { f.stop(); return 'accepted'; });
  if (stage === 'final-read') f.ports.inspectRemote.mockImplementationOnce(async () => remoteConfiguration()).mockImplementation(async () => { f.stop(); return remoteConfiguration(); });
  expect(await f.useCase.execute()).toBe('cancelled'); expect(f.ports.write).not.toHaveBeenCalled();
 });
 test('session cancellation before the panel is shown requests nothing', async () => {
  const f = fixture(); f.stop(); expect(await f.useCase.execute()).toBe('cancelled'); expect(f.ports.choose).not.toHaveBeenCalled();
 });
 test('closing a previously updated session preserves completion', async () => {
  const f = fixture(); f.ports.choose.mockImplementationOnce(async () => 'connect').mockImplementationOnce(async () => 'edit:commentLimit').mockImplementation(async () => { f.stop(); return 'close'; }); expect(await f.useCase.execute()).toBe('complete');
 });
});

describe('management lifecycle boundaries', () => {
 test('skip-variables makes every edit unavailable even with an authorized PAT', async () => {
  const f = fixture(); expect(await new ManageSetupUseCase(f.ports, true).execute()).toBe('complete');
  expect(f.ports.choose.mock.calls[1][0].settings.every(setting => !setting.editable)).toBe(true); expect(f.ports.audit).not.toHaveBeenCalled();
 });
 test('a controller takeover invalidates the previous approval', async () => {
  const f = fixture(); f.ports.approvalCurrent.mockReturnValue(false); await f.useCase.execute(); expect(f.ports.notify).toHaveBeenCalledWith('stale'); expect(f.ports.write).not.toHaveBeenCalled();
 });
 test('a second write failure remains partial after a confirmed first adjustment', async () => {
  const f = fixture(['connect','edit:commentLimit','edit:commentLimit','close']); const realWrite = f.ports.write.getMockImplementation()!;
  f.ports.write.mockImplementationOnce(realWrite).mockRejectedValueOnce(new Error('second write unknown')); f.ports.requestValue.mockResolvedValueOnce('15').mockResolvedValueOnce('20');
  expect(await f.useCase.execute()).toBe('partial'); expect(f.ports.recordWrite.mock.calls).toEqual([[true,'organization'],[false,'organization']]);
 });
 test.each(['audit', 'final-read', 'loop'] as const)('ending at %s after a confirmed adjustment retains completion', async stage => {
  const f = fixture(['connect','edit:commentLimit','edit:commentLimit','close']);
  f.ports.requestValue.mockResolvedValueOnce('15').mockResolvedValueOnce('20');
  if (stage === 'audit') f.ports.audit.mockResolvedValueOnce('accepted').mockImplementationOnce(async () => { f.stop(); return 'accepted'; });
  if (stage === 'final-read') { const realRead = f.ports.inspectRemote.getMockImplementation()!; f.ports.inspectRemote.mockImplementationOnce(realRead).mockImplementationOnce(realRead).mockImplementationOnce(realRead).mockImplementationOnce(async () => { f.stop(); return remoteConfiguration(); }); }
  if (stage === 'loop') f.ports.notify.mockImplementation(state => { if (state === 'updated') f.stop(); });
  expect(await f.useCase.execute()).toBe('complete'); expect(f.ports.write).toHaveBeenCalledTimes(1);
 });
});
