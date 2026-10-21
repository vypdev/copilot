import { createDefaultSetupConfiguration } from '../setup_configuration_defaults';
import { buildSetupPlan, buildSetupActionInputs, buildSetupRepositoryVariables, setupPlanGuardPaths } from '../setup_configuration_plan';
import { createSetupQuestionnaire, transitionSetupQuestionnaire, setupBasicSkippedQuestionIds } from '../setup_questionnaire_policy';
import { setupQuestionPresentation } from '../setup_question_guidance_policy';
import { setupVerificationActionSummary } from '../setup_verification_action_summary_policy';
import { validSetupBatchAssetPath } from '../setup_batch_policy';
import { SETUP_VERIFICATION_ACTION_PATH as asset } from '../../../domain/setup_verification_action';
import { importSetupOrganizationConfiguration } from '../setup_organization_import_policy';
import { unavailableSetupRemoteConfiguration } from '../setup_remote_facts_policy';
import type { SetupConfiguration } from '../../../domain/setup';

function question(configuration = createDefaultSetupConfiguration()) {
  let state = createSetupQuestionnaire(configuration);
  for (let i = 0; i < 200 && state.question?.id !== 'repository.verificationSetup'; i++) {
    if (!state.question) throw new Error('verification setup question is missing');
    state = transitionSetupQuestionnaire(state, { kind: 'answer', value: '' });
  }
  expect(state.question?.id).toBe('repository.verificationSetup'); return state;
}
describe('shared verification onboarding decisions', () => {
  test('VSO-05 new and legacy configuration default to disabled in the shared boolean question', () => {
    const config = createDefaultSetupConfiguration(); delete config.repository.verificationSetup;
    const state = question(config); expect(state.question).toMatchObject({ kind: 'boolean', defaultValue: false });
    expect(setupBasicSkippedQuestionIds()).not.toContain('repository.verificationSetup');
  });
  test.each([true, false])('VSO-05 retains the preselected %s value when accepting the default', value => {
    const config = createDefaultSetupConfiguration(); config.repository.verificationSetup = value;
    const state = question(config); expect(state.question?.defaultValue).toBe(value);
    expect(transitionSetupQuestionnaire(state, { kind: 'answer', value: '' }).draft.repository.verificationSetup).toBe(value);
  });
  test.each([['yes', true], ['no', false]] as const)('VSO-04 answering %s drives the same Variable and Action input', (answer, expected) => {
    const config = transitionSetupQuestionnaire(question(), { kind: 'answer', value: answer }).draft;
    expect(config.repository.verificationSetup).toBe(expected);
    expect(buildSetupRepositoryVariables(config)).toContainEqual({ name: 'VERIFICATION_SETUP', value: String(expected) });
    expect(buildSetupActionInputs(config)['verification-setup']).toBe(String(expected));
  });
  test('VSO-04 invalid activation input stays on the same question and retains the draft', () => {
    const state = question(); const invalid = transitionSetupQuestionnaire(state, { kind: 'answer', value: '/arbitrary/setup' });
    expect(invalid.question?.id).toBe(state.question?.id); expect(invalid.validation).toBeTruthy(); expect(invalid.draft).toEqual(state.draft);
  });
  test('VSO-04 revisiting activation retains the changed answer', () => {
    const answered = transitionSetupQuestionnaire(question(), { kind: 'answer', value: 'yes' });
    const back = transitionSetupQuestionnaire(answered, { kind: 'back' });
    expect(back.question?.id).toBe('repository.verificationSetup'); expect(back.question?.defaultValue).toBe(true);
  });
  test.each(['en', 'es', 'fr', 'pt'] as const)('VSO-06 %s guidance describes creation, customization, trusted main and real verification', locale => {
    const content = setupQuestionPresentation(question().question!)[locale];
    expect(content.label).toBeTruthy(); expect(content.effect).toContain(asset); expect(content.verify).toContain('MAIN_BRANCH');
    expect(content.example).toContain('VERIFICATION_SETUP=false'); expect(content.documentation.url).toContain('#repository-owned-setup');
    expect(content.summary).not.toBe('repository.verificationSetup');
  });
  test('VSO-01 planned files and web drift guards include the exact fixed consumer action', () => {
    const plan = buildSetupPlan(createDefaultSetupConfiguration()); expect(plan.selectedFiles).toContain(asset); expect(setupPlanGuardPaths(plan)).toContain(asset);
  });
  test('VSO-06 older reviews without verification metadata have no fabricated outcome', () => expect(setupVerificationActionSummary()).toEqual([]));
  test.each(['create', 'preserve', 'blocked'] as const)('VSO-06 %s summary states ownership, explicit activation and no readiness claim', action => {
    const text = setupVerificationActionSummary({ action, enabled: true, mainBranch: '<untrusted>@mention' }).join('\n');
    expect(text).toContain(asset); expect(text).toContain('true (enabled)'); expect(text).toContain('MAIN_BRANCH'); expect(text).toContain('does not establish runtime readiness');
    expect(text).not.toContain('<untrusted>');
  });
  test('VSO-06 disabled summary never claims activation', () => {
    expect(setupVerificationActionSummary({ action: 'create', enabled: false, mainBranch: 'main' }).join('\n')).toContain('false (disabled)');
  });
  test('VSO-10 permits only the fixed action entrypoint in batch inventory', () => {
    expect(validSetupBatchAssetPath(asset)).toBe(true);
    for (const other of [asset.replace('action.yml', 'other.sh'), asset.replace('action.yml', 'action.yaml'), '.github/actions/other/action.yml', `${asset}/extra`]) expect(validSetupBatchAssetPath(other)).toBe(false);
  });
  test.each(['organization', 'repository', 'explicit'] as const)('VSO-05 respects %s activation precedence', scope => {
    const config: SetupConfiguration = createDefaultSetupConfiguration(); config.repository.verificationSetup = false;
    const result = importSetupOrganizationConfiguration({ configuration: config,
      explicitQuestionIds: scope === 'explicit' ? ['repository.verificationSetup'] : [],
      remote: { ...unavailableSetupRemoteConfiguration(), ownerType: 'Organization', repositoryVariablesAccess: 'available', organizationVariablesAccess: 'available',
        organizationVariables: [{ name: 'VERIFICATION_SETUP', value: 'true' }], repositoryVariables: scope === 'repository' ? [{ name: 'VERIFICATION_SETUP', value: 'false' }] : [] } });
    expect(result.configuration.repository.verificationSetup).toBe(scope === 'organization');
  });
});
