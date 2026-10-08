import { buildSetupManagementView, planQuickChange, managementFingerprint } from '../setup_management_policy';
import { quickSetting, validateQuickSetting, SETUP_QUICK_SETTINGS } from '../setup_quick_settings_policy';
import { managementPermissions } from '../setup_management_permissions_policy';
import { setupQuestionContentInventory } from '../setup_questionnaire_policy';
import { buildSetupPatCreationUrl } from '../setup_pat_creation_url_policy';
import { localInstallation, remoteConfiguration } from '../../../../test-support/setup-management-fixtures';
const row = (local = localInstallation(), remote = remoteConfiguration()) => buildSetupManagementView(local, remote).settings.find(item => item.id === 'commentLimit')!;
describe('configuration management policy', () => {
 test('distinguishes unconfigured, detected, incomplete and guidance-only installations', () => {
  const empty = { ...localInstallation(), workflows: [], guidancePresent: false };
  expect(buildSetupManagementView(empty).status).toBe('unconfigured');
  expect(buildSetupManagementView(localInstallation()).status).toBe('detected');
  expect(buildSetupManagementView({ ...empty, guidancePresent: true }).status).toBe('incomplete');
  expect(buildSetupManagementView({ ...empty, unreadable: true }).status).toBe('incomplete');
 });
 test('opening without a PAT never invents GitHub values or credential health', () => {
  const view = buildSetupManagementView(localInstallation());
  expect(view.github).toBe('not-connected'); expect(view.secretInventory).toBe('not-connected');
  expect(view.settings.every(item => !item.editable)).toBe(true); expect(view.secrets).toEqual([]);
 });
 test('organization values have source and shared-scope changes', () => {
  expect(row()).toMatchObject({ value: '20', source: 'organization', editable: true });
  expect(planQuickChange(localInstallation(), remoteConfiguration(), 'commentLimit', '15')).toMatchObject({ before: '20', after: '15', scope: 'organization' });
 });
 test('repository values override organization values and disclose the shadow', () => {
  const remote = { ...remoteConfiguration(), repositoryVariables: [{ name: 'BUGBOT_COMMENT_LIMIT', value: '30' }], repositorySecrets: ['PAT'] };
  const view = buildSetupManagementView(localInstallation(), remote);
  expect(row(localInstallation(), remote)).toMatchObject({ value: '30', source: 'repository' });
  expect(view.variables).toContainEqual({ name: 'BUGBOT_COMMENT_LIMIT', value: '20', scope: 'organization', shadowed: true });
  expect(view.secrets).toContainEqual({ name: 'PAT', scope: 'organization', shadowed: true });
  expect(planQuickChange(localInstallation(), remote, 'commentLimit', '15')?.scope).toBe('repository');
 });
 test('a known fallback without a stored Variable writes repository scope', () => {
  const remote = { ...remoteConfiguration(), organizationVariables: [] };
  expect(row(localInstallation(), remote)).toMatchObject({ value: '20', source: 'workflow', editable: true });
  expect(planQuickChange(localInstallation(), remote, 'commentLimit', '15')?.scope).toBe('repository');
 });
 test('an empty stored Variable follows the workflow fallback', () => {
  expect(row(localInstallation(), { ...remoteConfiguration(), organizationVariables: [{ name: 'BUGBOT_COMMENT_LIMIT', value: '' }] }).value).toBe('20');
 });
 test.each(['unknown', 'unavailable'] as const)('repository inventory %s disables edits without guessing', access => {
  const view = buildSetupManagementView(localInstallation(), { ...remoteConfiguration(), repositoryVariablesAccess: access });
  expect(view.github).toBe('incomplete'); expect(view.settings.every(item => !item.editable)).toBe(true);
 });
 test.each(['unknown', 'unavailable', 'not_applicable'] as const)('organization inventory %s cannot authorize edits', access => {
  expect(row(localInstallation(), { ...remoteConfiguration(), organizationVariablesAccess: access }).editable).toBe(false);
 });
 test('personal accounts need no organization inventory', () => {
  const remote = { ...remoteConfiguration(), ownerType: 'User' as const, organizationVariablesAccess: 'not_applicable' as const, organizationSecretsAccess: 'not_applicable' as const, repositoryVariables: [{ name: 'BUGBOT_COMMENT_LIMIT', value: '10' }], organizationVariables: [] };
  expect(buildSetupManagementView(localInstallation(), remote)).toMatchObject({ github: 'available', secretInventory: 'available' });
  expect(row(localInstallation(), remote).editable).toBe(true);
 });
 test('unknown owner and unavailable Secret inventories remain unverified', () => {
  expect(buildSetupManagementView(localInstallation(), { ...remoteConfiguration(), ownerType: 'Unknown', repositorySecretsAccess: 'unavailable' })).toMatchObject({ github: 'incomplete', secretInventory: 'incomplete' });
 });
 test.each([
  { name: 'bugbot-comment-limit', literal: '40' }, { name: 'bugbot-comment-limit', unsupported: true as const },
  { name: 'bugbot-comment-limit', variable: 'OTHER', fallback: '20' },
 ])('nonstandard binding $name cannot be edited', input => {
  const local = localInstallation(); local.workflows[0].inputs = [input];
  expect(row(local).editable).toBe(false);
 });
 test('consistent literals can be displayed but cannot be overwritten by a Variable', () => {
  const local = localInstallation(); local.workflows[0].inputs = [{ name: 'bugbot-comment-limit', literal: '40' }];
  expect(row(local)).toMatchObject({ value: '40', source: 'workflow', editable: false });
 });
 test('environment-scoped jobs disable quick edits', () => {
  const local = localInstallation(); local.workflows[0].environmentScoped = true;
  expect(row(local).editable).toBe(false);
 });
 test('unreadable files and absent bindings do not produce editable defaults', () => {
  expect(row({ ...localInstallation(), unreadable: true }).editable).toBe(false);
  expect(row({ ...localInstallation(), workflows: [] })).toMatchObject({ source: 'unknown', editable: false });
 });
 test('different fallbacks stay unknown when the Variable is absent', () => {
  const local = localInstallation(); local.workflows = [...local.workflows, { ...local.workflows[0], inputs: [{ name: 'bugbot-comment-limit', variable: 'BUGBOT_COMMENT_LIMIT', fallback: '30' }] }];
  expect(row(local, { ...remoteConfiguration(), organizationVariables: [] })).toMatchObject({ source: 'unknown', editable: false });
 });
 test('a direct Variable with no fallback stays unknown if absent', () => {
  const local = localInstallation(); local.workflows[0].inputs = [{ name: 'bugbot-comment-limit', variable: 'BUGBOT_COMMENT_LIMIT' }];
  expect(row(local, { ...remoteConfiguration(), organizationVariables: [] }).editable).toBe(false);
 });
 test('different fallbacks are harmless when an effective nonempty Variable is known', () => {
  const local = localInstallation(); local.workflows = [...local.workflows, { ...local.workflows[0], inputs: [{ name: 'bugbot-comment-limit', variable: 'BUGBOT_COMMENT_LIMIT', fallback: '30' }] }];
  expect(row(local)).toMatchObject({ value: '20', editable: true });
 });
 test('token-shaped values are redacted and cannot be edited', () => {
  const value = 'github_pat_' + 'a'.repeat(30);
  const remote = { ...remoteConfiguration(), organizationVariables: [{ name: 'BUGBOT_COMMENT_LIMIT', value }, { name: 'UNRELATED', value }] };
  const view = buildSetupManagementView(localInstallation(), remote);
  expect(JSON.stringify(view)).not.toContain(value); expect(view.variables).toHaveLength(1); expect(row(localInstallation(), remote).editable).toBe(false);
 });
 test('long values are bounded without exposing unrelated Variables', () => {
  const remote = { ...remoteConfiguration(), organizationVariables: [{ name: 'BUGBOT_COMMENT_LIMIT', value: 'a'.repeat(5000) }] };
  expect(buildSetupManagementView(localInstallation(), remote).variables[0].value).toHaveLength(4096);
  expect(row(localInstallation(), remote).editable).toBe(false);
 });
 test('fingerprints bind checkout, files, identity, both scopes and access', () => {
  const local = localInstallation(), remote = remoteConfiguration(); const original = managementFingerprint(local, remote, 'BUGBOT_COMMENT_LIMIT');
  for (const changed of [{ ...remote, repositoryId: 2 }, { ...remote, ownerType: 'User' as const }, { ...remote, repositoryVariables: [{ name: 'BUGBOT_COMMENT_LIMIT', value: '9' }] }, { ...remote, organizationVariables: [] }]) expect(managementFingerprint(local, changed, 'BUGBOT_COMMENT_LIMIT')).not.toBe(original);
  expect(managementFingerprint({ ...local, revision: 'new-head' }, remote, 'BUGBOT_COMMENT_LIMIT')).not.toBe(original);
 });
 test.each([['unknown', '20'], ['commentLimit', '0'], ['commentLimit', '101'], ['commentLimit', '1.5'], ['commentLimit', '-1'], ['commentLimit', '1e2'], ['commentLimit', '123456'], ['drafts', 'yes']])('rejects unsupported %s value %s', (id, value) => expect(validateQuickSetting(id, value)).toBeUndefined());
 test.each([['assignees', '0'], ['assignees', '10'], ['reviewers', '15'], ['inactivity', '8760'], ['commentLimit', '1'], ['commentLimit', '100'], ['description', 'preserve'], ['effort', 'default'], ['severity', 'info'], ['drafts', 'false']])('accepts canonical boundary %s value %s', (id, value) => expect(validateQuickSetting(id, value)).toBe(value));
 test('normalizes integer padding without changing semantics', () => expect(validateQuickSetting('commentLimit', ' 015 ')).toBe('15'));
 test('every quick setting has real questionnaire guidance', () => {
  const inventory = setupQuestionContentInventory();
  for (const setting of SETUP_QUICK_SETTINGS) { expect(inventory.some(question => question.id === setting.questionId)).toBe(true); expect(quickSetting(setting.id)).toBe(setting); }
 });
 test('unknown, invalid and ineligible change plans are rejected', () => {
  expect(planQuickChange(localInstallation(), remoteConfiguration(), 'no-such-setting', '20')).toBeUndefined();
  expect(planQuickChange(localInstallation(), remoteConfiguration(), 'commentLimit', '0')).toBeUndefined();
  expect(planQuickChange({ ...localInstallation(), unreadable: true }, remoteConfiguration(), 'commentLimit', '15')).toBeUndefined();
 });
 test.each(['repository', 'organization'] as const)('%s quick permission link keeps cross-scope reads and only the selected write', scope => {
  const requirements = managementPermissions(scope);
  expect(requirements.map(item => item.probe)).toEqual(['metadata', 'variables', 'variables']);
  const link = new URL(buildSetupPatCreationUrl({ role: 'setup', owner: 'fixture-owner', repository: 'repo', expiresIn: 1, requirements }));
  expect(link.searchParams.get(scope === 'repository' ? 'actions_variables' : 'organization_actions_variables')).toBe('write');
  expect(link.searchParams.has('actions')).toBe(false); expect(link.searchParams.has('workflows')).toBe(false); expect(link.searchParams.has('secrets')).toBe(false);
 });
 test('inspection permission links contain reads only', () => expect(managementPermissions().every(item => item.level === 'read')).toBe(true));
});

test('empty stored values with conflicting fallbacks remain unknown', () => {
 const local = localInstallation(); local.workflows.push({ ...local.workflows[0], inputs: [{ name: 'bugbot-comment-limit', variable: 'BUGBOT_COMMENT_LIMIT', fallback: '30' }] });
 expect(row(local, { ...remoteConfiguration(), organizationVariables: [{ name: 'BUGBOT_COMMENT_LIMIT', value: '' }] })).toMatchObject({ source: 'organization', editable: false });
});

test('personal-owner changes do not request organization permissions', () => expect(managementPermissions('repository', 'User').map(item => item.scope)).toEqual(['repository','repository']));


test.each(['unknown','unavailable','not_applicable'] as const)('organization Secret access %s remains incomplete despite readable repository names', organizationSecretsAccess => {
 expect(buildSetupManagementView(localInstallation(), { ...remoteConfiguration(), organizationSecretsAccess }).secretInventory).toBe('incomplete');
});
test('unknown ownership cannot turn readable Secret names into a complete scope inventory', () => {
 expect(buildSetupManagementView(localInstallation(), { ...remoteConfiguration(), ownerType:'Unknown' }).secretInventory).toBe('incomplete');
});
