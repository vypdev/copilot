import { createDefaultSetupConfiguration } from '../setup_configuration_policy';
import {
  createSetupQuestionnaire,
  createSetupReviewState,
  enterSetupConfirmation,
  finishSetupQuestionnaire,
  setupQuestionnaireStateLabel,
  transitionSetupQuestionnaire,
} from '../setup_questionnaire_policy';
import type { SetupQuestionnaireContext, SetupQuestionnaireState } from '../../../domain/setup_questionnaire';

describe('setup questionnaire policy', () => {
  it('walks the declared applicable sections in deterministic order', () => {
    const visited: string[] = [];
    let state = createSetupQuestionnaire(createDefaultSetupConfiguration());
    while (state.terminal === 'collecting') {
      if (visited.at(-1) !== state.stateId) visited.push(state.stateId);
      state = transitionSetupQuestionnaire(state, { kind: 'answer', value: '' });
    }

    expect(visited).toEqual([
      'capabilities',
      'agent-runtime',
      'agent-model-defaults',
      'repository',
      'deployment',
      'bugbot',
      'projects',
      'provisioning',
      'storage',
    ]);
    expect(state).toEqual(expect.objectContaining({ stateId: 'review', terminal: 'review' }));
  });

  it('adds per-role model questions only after the explicit independent decision', () => {
    let state = advanceTo(createSetupQuestionnaire(createDefaultSetupConfiguration()), 'agents.configureIndependently');
    state = transitionSetupQuestionnaire(state, { kind: 'answer', value: 'yes' });
    expect(state).toEqual(expect.objectContaining({
      stateId: 'agent-role-overrides',
      question: expect.objectContaining({ id: 'agents.planner.modelProvider' }),
    }));
    state = transitionSetupQuestionnaire(state, { kind: 'answer', value: 'anthropic' });
    expect(state.draft.agents.planner.modelProvider).toBe('anthropic');
    expect(state.draft.agents.findings.modelProvider).toBe('openai');
  });

  it('keeps the same question and prior draft after invalid input', () => {
    const initial = createSetupQuestionnaire(createDefaultSetupConfiguration());
    const invalid = transitionSetupQuestionnaire(initial, { kind: 'answer', value: 'perhaps' });

    expect(invalid.question?.id).toBe(initial.question?.id);
    expect(invalid.validation).toBe('Enter yes or no.');
    expect(invalid.draft).toEqual(initial.draft);
    expect(invalid.draft).not.toBe(initial.draft);
  });

  it('accepts bounded numeric and indexed choice answers and rejects invalid values', () => {
    let state = advanceTo(createSetupQuestionnaire(createDefaultSetupConfiguration()), 'repository.desiredAssigneesCount');
    const invalid = transitionSetupQuestionnaire(state, { kind: 'answer', value: '-1' });
    expect(invalid.validation).toContain('non-negative');
    state = transitionSetupQuestionnaire(invalid, { kind: 'answer', value: '3' });
    expect(state.draft.repository.desiredAssigneesCount).toBe(3);

    state = advanceTo(state, 'repository.releaseReconciliationStrategy');
    const invalidChoice = transitionSetupQuestionnaire(state, { kind: 'answer', value: 'unsupported' });
    expect(invalidChoice.validation).toBe('Select one of the listed options.');
    state = transitionSetupQuestionnaire(state, { kind: 'answer', value: '2' });
    expect(state.draft.repository.releaseReconciliationStrategy).toBe('canonical-gitflow');
  });

  it('accepts explicit text and negative boolean answers', () => {
    let state = advanceTo(createSetupQuestionnaire(createDefaultSetupConfiguration()), 'agents.findings.model');
    state = transitionSetupQuestionnaire(state, { kind: 'answer', value: 'gpt-custom' });
    expect(state.draft.agents.tester.model).toBe('gpt-custom');
    state = advanceTo(state, 'agents.configureIndependently');
    state = transitionSetupQuestionnaire(state, { kind: 'answer', value: 'no' });
    expect(state.stateId).toBe('repository');
    expect(state.configureIndependently).toBe(false);
  });

  it('limits scope overrides to relevant inherited resource names and replaces cleared selections', () => {
    const context: SetupQuestionnaireContext = {
      remote: {
        ownerType: 'Organization',
        repositoryId: 4,
        repositoryVisibility: 'private',
        repositorySecrets: [],
        organizationSecrets: ['PAT', 'UNRELATED_SECRET'],
        repositoryVariables: [{ name: 'UNRELATED_VARIABLE', value: 'repository' }],
        organizationVariables: [
          { name: 'AGENT_PROVIDER', value: 'codex' },
          { name: 'UNRELATED_VARIABLE', value: 'x' },
        ],
        organizationAccess: 'available',
        organizationSecretsAccess: 'available',
        organizationVariablesAccess: 'available',
      },
      variableNames: ['AGENT_PROVIDER'],
      secretNames: ['PAT'],
    };
    let state = advanceTo(
      createSetupQuestionnaire(createDefaultSetupConfiguration(), context),
      'storage.variables.overrides',
      context,
    );
    expect(state.question?.allowedNames).toEqual(['AGENT_PROVIDER']);
    const invalid = transitionSetupQuestionnaire(state, { kind: 'answer', value: 'UNRELATED_VARIABLE' }, context);
    expect(invalid.validation).toContain('Unknown inherited resource');
    state = transitionSetupQuestionnaire(invalid, { kind: 'answer', value: 'AGENT_PROVIDER' }, context);
    expect(state.draft.storage.variables.overrides).toEqual({ AGENT_PROVIDER: 'repository' });
  });

  it('uses remote names when no resource-name filter is supplied and can clear inherited overrides', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.storage.variables.overrides = {
      AGENT_PROVIDER: 'repository',
      CUSTOM: 'organization',
    };
    const context: SetupQuestionnaireContext = {
      remote: {
        ownerType: 'Organization',
        repositoryId: 4,
        repositoryVisibility: 'private',
        repositorySecrets: [],
        organizationSecrets: [],
        repositoryVariables: [{ name: 'ALREADY_LOCAL', value: 'local' }],
        organizationVariables: [
          { name: 'AGENT_PROVIDER', value: 'codex' },
          { name: 'ALREADY_LOCAL', value: 'organization' },
        ],
        organizationAccess: 'available',
        organizationSecretsAccess: 'available',
        organizationVariablesAccess: 'available',
      },
    };
    let state = advanceTo(createSetupQuestionnaire(configuration, context), 'storage.variables.overrides', context);
    expect(state.question?.allowedNames).toEqual(['AGENT_PROVIDER']);
    expect(state.question?.defaultValue).toBe('AGENT_PROVIDER');
    const acceptedDefault = transitionSetupQuestionnaire(state, { kind: 'answer', value: '' }, context);
    expect(acceptedDefault.draft.storage.variables.overrides).toEqual(configuration.storage.variables.overrides);
    state = transitionSetupQuestionnaire(state, { kind: 'answer', value: 'none' }, context);
    expect(state.draft.storage.variables.overrides).toEqual({ CUSTOM: 'organization' });
  });

  it.each([
    ['cancel', 'cancel'],
    ['end-of-input', 'end-of-input'],
  ] as const)('maps %s to a terminal cancelled snapshot', (_label, kind) => {
    const initial = createSetupQuestionnaire(createDefaultSetupConfiguration());
    const cancelled = transitionSetupQuestionnaire(initial, { kind });

    expect(cancelled).toEqual(expect.objectContaining({ stateId: 'cancelled', terminal: 'cancelled' }));
    expect(cancelled.draft).not.toBe(initial.draft);
  });

  it('transitions review through confirmation to completed or cancelled without sharing drafts', () => {
    const review = createSetupReviewState(createDefaultSetupConfiguration());
    const confirmation = enterSetupConfirmation(review);
    const completed = finishSetupQuestionnaire(confirmation, true);
    const cancelled = finishSetupQuestionnaire(confirmation, false);

    expect(confirmation).toEqual(expect.objectContaining({ stateId: 'confirmation', terminal: 'confirmation' }));
    expect(completed).toEqual(expect.objectContaining({ stateId: 'completed', terminal: 'completed' }));
    expect(cancelled).toEqual(expect.objectContaining({ stateId: 'cancelled', terminal: 'cancelled' }));
    expect(completed.draft).not.toBe(confirmation.draft);
  });

  it('rejects invalid review/confirmation transitions', () => {
    const collecting = createSetupQuestionnaire(createDefaultSetupConfiguration());
    const review = createSetupReviewState(createDefaultSetupConfiguration());
    expect(transitionSetupQuestionnaire(review, { kind: 'answer', value: 'yes' })).toBe(review);
    expect(() => enterSetupConfirmation(collecting)).toThrow('requires a reviewed questionnaire');
    expect(() => finishSetupQuestionnaire(collecting, true)).toThrow('only from confirmation');
  });

  it('does not mutate or share nested references with frozen defaults', () => {
    const defaults = deepFreeze(createDefaultSetupConfiguration());
    const state = createSetupQuestionnaire(defaults);

    expect(state.draft).toEqual(defaults);
    expect(state.draft.features).not.toBe(defaults.features);
    expect(state.draft.agents.planner).not.toBe(defaults.agents.planner);
    expect(state.draft.repository.mergeQueueCheckAttestations).not.toBe(defaults.repository.mergeQueueCheckAttestations);
    expect(state.draft.storage.variables.overrides).not.toBe(defaults.storage.variables.overrides);
  });

  it('provides stable labels for terminal and collecting states', () => {
    expect(setupQuestionnaireStateLabel('capabilities')).toBe('Capabilities');
    expect(setupQuestionnaireStateLabel('completed')).toBe('Completed');
    expect(setupQuestionnaireStateLabel('cancelled')).toBe('Cancelled');
  });
});

function advanceTo(
  initial: SetupQuestionnaireState,
  questionId: string,
  context: SetupQuestionnaireContext = {},
): SetupQuestionnaireState {
  let state = initial;
  for (let attempts = 0; attempts < 200 && state.terminal === 'collecting'; attempts += 1) {
    if (state.question?.id === questionId) return state;
    state = transitionSetupQuestionnaire(state, { kind: 'answer', value: '' }, context);
  }
  throw new Error(`Question ${questionId} was not reached.`);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
