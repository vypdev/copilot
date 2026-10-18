import { createDefaultSetupConfiguration } from '../setup_configuration_defaults';
import { cloneSetupConfiguration } from '../setup_configuration_clone_policy';
import { createSetupQuestionnaire, setupQuestionContentInventory, transitionSetupQuestionnaire } from '../setup_questionnaire_policy';
import { applySetupRunnerAnswer, setupRunnerQuestion, setupRunnerQuestions } from '../setup_runner_question_policy';
import { setupRunnerGuidance } from '../setup_runner_guidance_policy';
import { selectSetupRunnerMode, validateSetupRunners } from '../setup_runner_policy';
import { unavailableSetupRemoteConfiguration } from '../setup_remote_facts_policy';
import type { SetupQuestion } from '../../../domain/setup_questionnaire';

const profile = { id: 'shared', group: 'vypdev', labels: ['self-hosted', 'Linux'], validation: 'hosted' };
const value = JSON.stringify({ schemaVersion: 1, profiles: [profile, { ...profile, id: 'other', group: 'other' }] });
const remote = { ...unavailableSetupRemoteConfiguration(), repositoryVariablesAccess: 'available' as const,
  organizationVariablesAccess: 'available' as const, organizationVariables: [{ name: 'COPILOT_RUNNER_PROFILES', value }] };
const question = (field: string): SetupQuestion => ({ id: `runners.${field}`, stateId: 'agent-runtime', kind: 'text', label: field, defaultValue: '' });
const manual = () => ({ ...createDefaultSetupConfiguration(), runners: selectSetupRunnerMode('manual-self-hosted') });

describe('one questionnaire contract for CLI and web runner selection', () => {
  test('unrelated questions keep their original object', () => {
    const original = { ...question('mode'), id: 'projects.ids' }; expect(setupRunnerQuestion(original, {})).toBe(original);
    const intent = question('discover'); expect(setupRunnerQuestion(intent, { remote })).toBe(intent);
  });
  test('unavailable registry keeps manual and hosted selection usable', () => {
    const result = setupRunnerQuestion(question('mode'), {});
    expect(result.choices).toEqual(['retain', 'hosted', 'manual-self-hosted']); expect(result.runnerRegistryStatus).toBe('unavailable');
  });
  test('valid registry exposes exact IDs and provenance', () => {
    expect(setupRunnerQuestion(question('profileId'), { remote }).choices).toEqual(['shared', 'other']);
    expect(setupRunnerQuestion(question('mode'), { remote }).choices).toContain('organization-profile');
    expect(setupRunnerQuestion(question('group'), { remote }).runnerProfiles).toHaveLength(2);
  });
  test.each(['retain', 'hosted', 'manual-self-hosted'])('mode %s clears stale selection metadata', mode => {
    const result = applySetupRunnerAnswer(createDefaultSetupConfiguration(), question('mode'), mode, {});
    expect(result.error).toBeUndefined(); expect(result.configuration?.runners).toEqual(selectSetupRunnerMode(mode as 'retain'));
  });
  test('selecting registry mode snapshots a profile without mutating inventory', () => {
    const result = applySetupRunnerAnswer(createDefaultSetupConfiguration(), question('mode'), 'organization-profile', { remote });
    expect(result.configuration?.runners).toMatchObject({ mode: 'organization-profile', profileId: 'shared', group: 'vypdev', source: { scope: 'organization', value } });
    expect(validateSetupRunners(result.configuration?.runners)).toEqual([]); expect(remote.organizationVariables[0].value).toBe(value);
    const other = applySetupRunnerAnswer(result.configuration!, question('profileId'), 'other', { remote });
    expect(other.configuration?.runners?.group).toBe('other');
    expect(applySetupRunnerAnswer(other.configuration!, question('mode'), 'organization-profile', { remote }).configuration?.runners?.profileId).toBe('other');
    const cloned = cloneSetupConfiguration(other.configuration!);
    expect(cloned.runners?.source).not.toBe(other.configuration!.runners?.source);
    expect(cloned.runners?.labels).not.toBe(other.configuration!.runners?.labels);
  });
  test('a missing registry or stale profile cannot be selected', () => {
    expect(applySetupRunnerAnswer(createDefaultSetupConfiguration(), question('mode'), 'organization-profile', {}).error).toContain('No valid');
    expect(applySetupRunnerAnswer(createDefaultSetupConfiguration(), question('profileId'), 'gone', { remote }).error).toContain('unavailable');
  });
  test('manual group and labels preserve typed boundaries', () => {
    const initial = manual();
    const grouped = applySetupRunnerAnswer(initial, question('group'), 'vypdev', {}).configuration!;
    const labelled = applySetupRunnerAnswer(grouped, question('labels'), 'self-hosted,codex,Linux', {}).configuration!;
    const validated = applySetupRunnerAnswer(labelled, question('validation'), 'agent', {}).configuration!;
    expect(validated.runners).toMatchObject({ group: 'vypdev', labels: ['self-hosted', 'codex', 'Linux'], validation: 'agent' });
    expect(initial.runners.group).toBe(''); expect(initial.runners.labels).toEqual(['self-hosted', 'Linux']);
  });
  test.each(['self-hosted,Windows', 'self-hosted,Linux,linux', '${{ vars.LABEL }}'])('manual labels reject unsupported input %s', input => {
    expect(applySetupRunnerAnswer(manual(), question('labels'), input, {}).error).toContain('unique literal');
  });
  test('manual group rejects expressions and control characters', () => {
    expect(applySetupRunnerAnswer(manual(), question('group'), '${{ vars.GROUP }}', {}).error).toContain('literal runner group');
    expect(applySetupRunnerAnswer({ ...manual(), runners: undefined }, question('group'), 'x\n', {}).error).toBeDefined();
  });
  test('question definitions expose conditional manual fields', () => {
    const definitions = setupRunnerQuestions().filter(question => question.id !== 'runners.discover'); const config = manual();
    expect(definitions[0].read?.(config)).toBe('manual-self-hosted');
    expect(definitions[0].read?.({ ...config, runners: undefined })).toBe('retain');
    expect(definitions[1].applies?.(config)).toBe(false);
    expect(definitions[2].applies?.(config)).toBe(true);
    expect(definitions[3].read?.(config)).toBe('self-hosted,Linux');
  });
  test('the real shared questionnaire validates without discarding previous answers', () => {
    const context = { remote, skipQuestionIds: setupQuestionContentInventory().filter(item => !item.id.startsWith('runners.')).map(item => item.id) };
    let state = createSetupQuestionnaire(createDefaultSetupConfiguration(), context);
    expect(state.question?.id).toBe('runners.discover');
    state = transitionSetupQuestionnaire(state, { kind: 'answer', value: 'false' }, context);
    expect(state.question?.id).toBe('runners.mode');
    state = transitionSetupQuestionnaire(state, { kind: 'answer', value: 'manual-self-hosted' }, context);
    expect(state.question?.id).toBe('runners.group');
    state = transitionSetupQuestionnaire(state, { kind: 'answer', value: 'vypdev' }, context);
    const invalid = transitionSetupQuestionnaire(state, { kind: 'answer', value: 'Linux' }, context);
    expect(invalid.question?.id).toBe('runners.labels'); expect(invalid.validation).toBeDefined(); expect(invalid.draft.runners?.group).toBe('vypdev');
    state = transitionSetupQuestionnaire(invalid, { kind: 'answer', value: 'self-hosted,codex,Linux' }, context);
    state = transitionSetupQuestionnaire(state, { kind: 'answer', value: 'hosted' }, context);
    expect(state.terminal).toBe('review'); expect(validateSetupRunners(state.draft.runners)).toEqual([]);
  });
  test.each(['mode', 'profileId', 'group', 'labels', 'validation', 'discover'])('all four locales explain %s and link stable documentation', field => {
    const presentation = setupRunnerGuidance(question(field));
    for (const locale of ['en', 'es', 'fr', 'pt'] as const) {
      expect(presentation[locale].label).toBeTruthy(); expect(presentation[locale].summary).toBeTruthy();
      expect(presentation[locale].documentation.url).toBe('https://docs.page/vypdev/copilot/configuration#runner-profiles');
      expect(presentation[locale].effect).not.toBe('');
    }
  });
});


describe('optional runner discovery intent', () => {
  test.each([false, true])('explicit discovery=%s survives later manual and shared selection', discover => {
    const definition = setupRunnerQuestions().find(question => question.id === 'runners.discover')!;
    expect(definition.read?.({ ...manual(), runners: undefined })).toBe(false);
    let config = applySetupRunnerAnswer(manual(), question('discover'), String(discover), {}).configuration!;
    expect(definition.read?.(config)).toBe(discover);
    config = applySetupRunnerAnswer(config, question('mode'), 'organization-profile', { remote }).configuration!;
    expect(config.runners?.discover).toBe(discover);
    expect(applySetupRunnerAnswer(config, question('profileId'), 'other', { remote }).configuration?.runners?.discover).toBe(discover);
    expect(validateSetupRunners(config.runners)).toEqual([]);
    expect(validateSetupRunners({ ...config.runners, discover: 'yes' })).not.toEqual([]);
  });
});
