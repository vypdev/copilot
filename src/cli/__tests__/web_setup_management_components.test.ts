import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { buildSetupManagementView } from '../../application/policies/setup_management_policy';
import { localInstallation, remoteConfiguration } from '../../../test-support/setup-management-fixtures';
import { managementCopy, settingName, settingValue, managementCatalogs } from '../../../web/src/i18n/managementCopy';
import { localizedMessage } from '../../../web/src/i18n/messageCopy';
import { localizedPromptCopy } from '../../../web/src/i18n/promptCopy';
import type { SetupLocale } from '../../../web/src/i18n/catalog';
import { SETUP_QUICK_SETTINGS } from '../../application/policies/setup_quick_settings_policy';
function markup(name: string, props: Record<string, unknown>, locale: SetupLocale = 'en') { return execFileSync(process.execPath, [resolve(__dirname, '../../../scripts/render-web-setup-component.cjs'), name, JSON.stringify(props), locale], { encoding: 'utf8' }); }
const controls = { controller: true, busy: false };
describe('human configuration management views', () => {
 test.each(['en','es','fr','pt'] as const)('%s new checkout explains the missing installation with one start action', locale => {
  const copy = managementCopy(locale); const view = buildSetupManagementView({ ...localInstallation(), workflows: [], guidancePresent: false });
  const html = markup('SetupManagementPanel', { ...controls, view }, locale); expect(html).toContain(copy.unconfigured); expect(html).toContain(copy.startHelp); expect(html).toContain(copy.start); expect(html).not.toContain(copy.local); expect(html).not.toContain(copy.connect); expect(html).not.toContain('type="password"');
 });
 test.each(['en','es','fr','pt'] as const)('%s existing checkout shows source, credential limitation and progressive disclosure', locale => {
  const copy = managementCopy(locale); const html = markup('SetupManagementPanel', { ...controls, view: buildSetupManagementView(localInstallation(), remoteConfiguration()) }, locale);
  expect(html).toContain(settingName('commentLimit', locale)); expect(html).toContain(copy.organization); expect(html).toContain(copy.secretHelp); expect(html).toContain(copy.quickHelp); expect(html).toContain('<summary>'); expect(html).toContain(copy.finish);
 });
 test.each(['en','es','fr','pt'] as const)('%s organization preview discloses shared impact before Apply', locale => {
  const copy = managementCopy(locale); const html = markup('QuickSettingPrompt', { ...controls, prompt: { kind: 'quick-review', title: '', change: { id: 'commentLimit', variable: 'BUGBOT_COMMENT_LIMIT', before: '20', after: '15', scope: 'organization' } } }, locale);
  expect(html.indexOf(copy.orgImpact)).toBeLessThan(html.indexOf(copy.apply)); expect(html).toContain(copy.effect); expect(html).toContain(copy.back); expect(html).toContain('role="note"');
 });
 test.each(['en','es','fr','pt'] as const)('%s numeric edit uses a labelled bounded native form', locale => {
  const copy = managementCopy(locale); const html = markup('QuickSettingPrompt', { ...controls, prompt: { kind: 'quick-edit', title: '', id: 'commentLimit', current: '20', min: 1, max: 100 } }, locale);
  expect(html).toContain('for="setting-value"'); expect(html).toContain('type="number"'); expect(html).toContain('min="1"'); expect(html).toContain('max="100"'); expect(html).toContain('type="submit"'); expect(html).toContain(copy.preview);
 });
 test.each(['en','es','fr','pt'] as const)('%s notifications and masked PAT prompts are localized', locale => {
  for (const state of ['checking','connected','invalid','unchanged','stale','blocked','updated','partial'] as const) expect(localizedMessage({ tone: 'warning', text: 'raw implementation detail', managementState: state }, locale)).toBe(managementCopy(locale)[state]);
  for (const copyId of ['management.token','management.tokenWrite'] as const) {
   const prompt = { kind: 'secret' as const, title: '', copyId, optional: true }; const copy = localizedPromptCopy(prompt, locale)!;
   const html = markup('PromptCard', { ...controls, prompt, revision: 1, promptRevision: 1 }, locale); expect(html).toContain(copy.title); expect(html).toContain('type="password"'); expect(html).toContain('autocomplete="off"');
  }
 });
 test('literal settings cannot be changed and unknown scopes stay unknown', () => {
  const html = markup('SetupManagementPanel', { ...controls, view: buildSetupManagementView(localInstallation()) }); expect(html).toContain(managementCopy('en').local); expect(html).toContain('disabled'); expect(html).toContain(managementCopy('en').unknown);
 });
 test('read-only and busy presenters cannot submit edits or approvals', () => {
  for (const flags of [{ controller: false, busy: false }, { controller: true, busy: true }]) {
   const html = markup('QuickSettingPrompt', { ...flags, prompt: { kind: 'quick-review', title: '', change: { id: 'commentLimit', before: '20', after: '15', scope: 'repository' } } }); expect(html.match(/disabled/gu)).toHaveLength(2);
  }
 });
 test('enum edits have native selects and associated labels', () => {
  const html = markup('QuickSettingPrompt', { ...controls, prompt: { kind: 'quick-edit', title: '', id: 'drafts', current: 'true', choices: ['true','false'] } }); expect(html).toContain('<select'); expect(html).toContain('for="setting-value"'); expect(html).toContain('value="false"');
 });
 test('dynamic names and values are escaped', () => {
  const local = localInstallation(); local.workflows[0].file = '<script>attack</script>'; const remote = remoteConfiguration(); remote.repositorySecrets = ['<script>secret</script>'];
  const html = markup('SetupManagementPanel', { ...controls, view: buildSetupManagementView(local, remote) }); expect(html).not.toContain('<script>attack'); expect(html).not.toContain('<script>secret'); expect(html).toContain('&lt;script');
 });
 test('unknown input expressions and inventories have textual fallbacks', () => {
  const local = localInstallation(); local.workflows[0].inputs = [{ name: 'dynamic', unsupported: true }, { name: 'literal', literal: 'value' }];
  const html = markup('ManagementInventory', { view: buildSetupManagementView(local) }); expect(html).toContain(managementCopy('en').unknown); expect(html).toContain('value'); expect(html).toContain(managementCopy('en').empty);
 });
 test('all common settings have translated human labels and complete catalogs', () => {
  for (const locale of ['en','es','fr','pt'] as const) { expect(Object.keys(managementCatalogs[locale]).sort()).toEqual(Object.keys(managementCatalogs.en).sort()); for (const setting of SETUP_QUICK_SETTINGS) expect(settingName(setting.id,locale)).not.toBe(setting.id); }
  expect(settingName('future-setting','en')).toBe('future-setting');
 });
});

test('display values translate known options without changing their submitted values', () => {
 for (const locale of ['en','es','fr','pt'] as const) for (const value of ['true','false','replace','append','preserve','disabled','info','low','medium','high','smart','default']) expect(settingValue(value,locale)).not.toBe(value);
 expect(settingValue('20','es')).toBe('20');
});

test.each(['en','es','fr','pt'] as const)('%s management results distinguish an adjustment from a full installation', locale => {
 const copy=managementCopy(locale);
 for (const [outcome,key] of [['complete','finished'],['cancelled','inspectionStopped'],['blocked','inspectionStopped'],['partial','inspectAdjustment']] as const) {
  const html=markup('ResultPanel',{management:true,outcome,controller:true,detail:{effects:[{id:'variables',state:'completed',scope:'organization'}]}},locale);expect(html).toContain(copy[key]);expect(html).not.toContain('Verify installed resources');
 }
 const inspection=markup('ResultPanel',{management:true,outcome:'complete',controller:true},locale);expect(inspection).toContain(copy.inspectionFinished);expect(inspection).toContain(copy.inspectionBody);expect(inspection).not.toContain('This setup was cancelled');
});

test('an unknown source does not repeat the same uncertainty label', () => { const html=markup('SetupManagementPanel',{...controls,view:buildSetupManagementView(localInstallation())});expect(html).not.toContain('Not verified · Not verified'); });
