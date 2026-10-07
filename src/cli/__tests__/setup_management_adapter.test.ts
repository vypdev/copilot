import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSetupBridge } from '../web_setup_bridge';
import { manageWebSetup } from '../setup_management_adapter';
import { remoteConfiguration } from '../../../test-support/setup-management-fixtures';
import type { SetupOperationEffect, SetupRemoteConfiguration } from '../../domain/setup';
const mockInspect = jest.fn();
const mockAudit = jest.fn();
const mockRepoWrite = jest.fn();
const mockOrgWrite = jest.fn();
jest.mock('../../infrastructure/composition/setup_credentials_composition_root', () => ({ createSetupRemoteConfigurationReadPort: () => ({ inspect: mockInspect }) }));
jest.mock('../../infrastructure/composition/github_identity_client_factory', () => ({ createRepositoryVariablesClient: () => ({}) }));
jest.mock('../../data/repository/repository_variables_repository', () => ({ RepositoryVariablesCommandRepository: jest.fn().mockImplementation(() => ({ upsert: mockRepoWrite, upsertScopedVariables: mockOrgWrite })) }));
jest.mock('../../infrastructure/composition/setup_token_permissions_composition_root', () => ({ createSetupTokenPermissionsUseCase: () => ({ inspect: mockAudit }) }));
jest.mock('../../cli_context', () => ({ getCurrentAttachedBranch: () => 'fixture-branch', getCurrentHeadSha: () => 'fixture-head', getGitInfo: () => ({ owner: 'fixture', repo: 'repo' }) }));
const roots: string[] = [];
const denied = { role: 'setup', identityStatus: 'valid', identityMessage: 'checked', checks: [], ready: false, confirmationRequired: false };
function fixture(answers: string[], scope: 'repository' | 'organization' = 'organization') {
 const root = mkdtempSync(join(tmpdir(),'copilot-management-composition-')); roots.push(root); mkdirSync(join(root,'.github','workflows'),{ recursive:true });
 writeFileSync(join(root,'.github','workflows','copilot.yml'), "jobs:\n  job:\n    steps:\n      - uses: vypdev/copilot@v3\n        with:\n          bugbot-comment-limit: ${{ vars.BUGBOT_COMMENT_LIMIT || '20' }}\n          bugbot-review-drafts: ${{ vars.BUGBOT_REVIEW_DRAFTS || 'false' }}\n");
 let remote: SetupRemoteConfiguration = remoteConfiguration();
 if (scope === 'repository') remote = { ...remote, repositoryVariables: [{ name: 'BUGBOT_COMMENT_LIMIT', value: '20' }] };
 mockInspect.mockImplementation(async () => structuredClone(remote));
 mockAudit.mockResolvedValue({ ...denied, ready: true });
 const write = async (target: 'repository' | 'organization', ...args: unknown[]) => {
  const values = args[args.length-1] as { name: string; value: string }[];
  const key = target === 'repository' ? 'repositoryVariables' : 'organizationVariables'; remote = { ...remote, [key]: values };
  return { created: 0, updated: 1, errors: [] };
 };
 mockRepoWrite.mockImplementation((...args) => write('repository',...args)); mockOrgWrite.mockImplementation((...args) => write('organization',...args));
 const bridge = new WebSetupBridge('fixture/repo'); bridge.bootstrap(); const prompts: NonNullable<ReturnType<WebSetupBridge['snapshot']>['prompt']>[] = [];
 bridge.subscribe(view => { if (!view.prompt) return; prompts.push(view.prompt); const answer = answers.shift(); queueMicrotask(() => { if (answer === undefined) bridge.cancel(); else bridge.answer(view.promptRevision!, answer); }); });
 const mutation = jest.fn(); const effects: SetupOperationEffect[] = [];
 return { bridge, prompts, mutation, effects, run: (readOnly?: boolean) => manageWebSetup(bridge,root,'fixture','repo',mutation,effect => effects.push(effect), readOnly) };
}
beforeEach(() => jest.clearAllMocks());
afterEach(() => { roots.splice(0).forEach(root => rmSync(root,{ recursive:true, force:true })); });
describe('web configuration management composition', () => {
 test('the full assistant handoff resets the surface and clears prior inspection feedback', async () => { const f = fixture(['connect','fixture-token','wizard']); expect(await f.run()).toBe('continue'); expect(f.bridge.snapshot().surface).toBe('wizard'); expect(f.bridge.snapshot().message).toBeUndefined(); expect(mockInspect).toHaveBeenCalledTimes(1); });
 test('a blank read-only PAT returns to the panel without provider calls', async () => { const f = fixture(['connect','','close']); expect(await f.run()).toBe('cancelled'); expect(mockInspect).not.toHaveBeenCalled(); expect(f.prompts[1]).toMatchObject({ kind:'secret', copyId:'management.token', optional:true }); });
 test.each(['repository','organization'] as const)('%s edit asks for one approval, writes one Variable and retains a receipt', async scope => {
  const f = fixture(['connect','fixture-token','edit:commentLimit','15','approve','close'],scope); expect(await f.run()).toBe('complete');
  expect(f.prompts.find(prompt => prompt.kind === 'quick-review')).toMatchObject({ change: { scope, before:'20',after:'15' } });
  expect(JSON.stringify(f.prompts)).not.toContain('fingerprint'); expect(JSON.stringify(f.bridge.snapshot())).not.toContain('fixture-token');
  expect(mockAudit.mock.calls[0][0].requirements.filter((item: {level:string}) => item.level === 'write')).toHaveLength(1);
  expect(scope === 'repository' ? mockRepoWrite : mockOrgWrite).toHaveBeenCalledTimes(1); expect(f.effects).toEqual([{ id:'variables',state:'completed',scope }]);
  expect(f.mutation).toHaveBeenCalledTimes(1);
 });
 test('dismissed edit returns to the panel without a probe', async () => { const f = fixture(['connect','fixture-token','edit:commentLimit','cancel','close']); expect(await f.run()).toBe('cancelled'); expect(mockAudit).not.toHaveBeenCalled(); });
 test('denied write permissions offer a link with just scoped Write and necessary cross-scope reads', async () => {
  const f = fixture(['connect','fixture-token','edit:commentLimit','15','approve','connect','replacement-token','close']); mockAudit.mockResolvedValue(denied); expect(await f.run()).toBe('cancelled');
  const prompt = f.prompts.find(prompt => prompt.kind === 'secret' && prompt.copyId === 'management.tokenWrite'); expect(prompt).toMatchObject({ optional:true });
  if (prompt?.kind !== 'secret') throw new Error('Missing corrected PAT prompt'); const url = new URL(prompt.link!);
  expect(url.searchParams.get('organization_actions_variables')).toBe('write'); expect(url.searchParams.get('actions_variables')).toBe('read'); expect(url.searchParams.has('workflows')).toBe(false);
  expect(mockOrgWrite).not.toHaveBeenCalled();
 });
 test.each(['cleanupPending','incident'])('%s blocks installed changes and requires inspection', async field => { const f = fixture(['connect','fixture-token','edit:commentLimit','15','approve']); mockAudit.mockResolvedValue({ ...denied, checks:[{ [field]:true }] }); expect(await f.run()).toBe('partial'); expect(f.mutation).toHaveBeenCalledTimes(1); expect(mockOrgWrite).not.toHaveBeenCalled(); });
 test('an unconfirmed provider write keeps a needs-inspection receipt', async () => { const f = fixture(['connect','fixture-token','edit:commentLimit','15','approve']); mockOrgWrite.mockResolvedValue({ created:0,updated:0,errors:['safe failure'] }); expect(await f.run()).toBe('partial'); expect(f.effects).toEqual([{ id:'variables',state:'needs-inspection',scope:'organization' }]); expect(f.bridge.snapshot().resultDetail?.reasonCode).toBe('provider'); });
 test('skip-variables still supports inspection without editable settings', async () => { const f = fixture(['connect','fixture-token','close']); expect(await f.run(true)).toBe('cancelled'); expect(f.prompts[2]).toMatchObject({ management:{settings:expect.arrayContaining([expect.objectContaining({editable:false})])} }); expect(mockAudit).not.toHaveBeenCalled(); });
 test('takeover during the audit requires a new review', async () => { const f = fixture(['connect','fixture-token','edit:commentLimit','15','approve','close']); mockAudit.mockImplementation(async () => { f.bridge.takeOver(); return { ...denied,ready:true }; }); await f.run(); expect(mockOrgWrite).not.toHaveBeenCalled(); expect(f.bridge.snapshot().message?.managementState).toBe('stale'); });
 test('refreshing does not write or request the PAT again', async () => { const f = fixture(['connect','fixture-token','refresh','close']); await f.run(); expect(f.prompts.filter(prompt => prompt.kind === 'secret')).toHaveLength(1); expect(mockInspect).toHaveBeenCalledTimes(2); expect(mockOrgWrite).not.toHaveBeenCalled(); });
});

test('enum quick adjustments reuse reviewed questionnaire choices', async () => {
 const f = fixture(['connect','fixture-token','edit:drafts','true','approve','close']); expect(await f.run()).toBe('complete'); expect(f.prompts.find(prompt => prompt.kind === 'quick-edit')).toMatchObject({ choices:['true','false'] }); expect(mockRepoWrite).toHaveBeenCalledWith('fixture','repo','fixture-token',[{name:'BUGBOT_REVIEW_DRAFTS',value:'true'}]);
});
