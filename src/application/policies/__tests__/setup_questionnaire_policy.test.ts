import { createDefaultSetupConfiguration } from '../setup_configuration_policy';
import { validateSetupConfiguration } from '../setup_configuration_validation';
import {
  createSetupQuestionnaire,
  createSetupPermissionIntentQuestionnaire,
  createSetupReviewState,
  refreshSetupQuestionnaireQuestion,
  reopenSetupQuestionnaireGroup,
  setupBasicSkippedQuestionIds,
  setupEditableGroups,
  setupQuestionnaireProgress,
  enterSetupConfirmation,
  finishSetupQuestionnaire,
  setupQuestionnaireStateLabel,
  transitionSetupQuestionnaire,
} from '../setup_questionnaire_policy';
import type { SetupQuestionnaireContext, SetupQuestionnaireState } from '../../../domain/setup_questionnaire';

describe('setup questionnaire policy', () => {
  it('basic presentation omits only advanced defaults, never security or mutation choices', () => {
    const skipped = setupBasicSkippedQuestionIds();
    expect(skipped).toContain('agents.findings.executable');
    expect(skipped).toContain('ai.bugbotCommentLimit');
    expect(skipped.length).toBeGreaterThan(20);
    for (const required of ['features.issues', 'features.pullRequests', 'projects.enabled', 'projects.ids',
      'repository.mainBranch', 'repository.developmentBranch', 'pullRequestApproval.mode',
      'ai.membersOnly', 'ai.bugbotTelemetry', 'ai.bugbotDryRun',
      'manageRepositoryVariables', 'manageRepositorySecrets', 'storage.secrets.defaultScope',
      'storage.variables.defaultScope']) expect(skipped).not.toContain(required);
    const configured = createDefaultSetupConfiguration();
    configured.ai.bugbotCommentLimit = 12;
    expect(setupBasicSkippedQuestionIds(configured)).not.toContain('ai.bugbotCommentLimit');
  });
  it.each([
    { issues: true, enabled: ['release'], expected: true },
    { issues: true, enabled: ['hotfix'], expected: true },
    { issues: true, enabled: ['feature', 'bugfix'], expected: false },
    { issues: false, enabled: ['release', 'hotfix'], expected: false },
  ] as const)('derives the initial version from workflow selection without an initial-tag question: %j', ({ issues, enabled, expected }) => {
    const configuration = createDefaultSetupConfiguration();
    configuration.features.issues = issues;
    configuration.issueWorkflows = { enabled };
    let state = createSetupQuestionnaire(configuration);
    expect(state.draft.createInitialTag).toBe(expected);
    const ids: string[] = [];
    while (state.terminal === 'collecting') {
      ids.push(state.question!.id);
      state = transitionSetupQuestionnaire(state, { kind: 'answer', value: '' });
    }
    expect(ids).not.toContain('createInitialTag');
    expect(state.draft.createInitialTag).toBe(expected);
  });

  it('keeps workflow selection unchanged after invalid input and supports the default and All answers', () => {
    const state = advanceTo(createSetupQuestionnaire(createDefaultSetupConfiguration()), 'issueWorkflows.enabled');
    const invalid = transitionSetupQuestionnaire(state, { kind: 'answer', value: 'unknown-workflow' });
    expect(invalid.validation).toContain('Unknown issue workflow');
    expect(invalid.draft).toEqual(state.draft);
    expect(invalid.question?.id).toBe('issueWorkflows.enabled');
    expect(transitionSetupQuestionnaire(state, { kind: 'answer', value: '' }).draft.issueWorkflows.enabled).toEqual(state.draft.issueWorkflows.enabled);
    expect(transitionSetupQuestionnaire(state, { kind: 'answer', value: 'all' }).draft.issueWorkflows.enabled).toEqual(state.draft.issueWorkflows.enabled);
    const none = createDefaultSetupConfiguration();
    none.issueWorkflows = { enabled: [] };
    const noneState = advanceTo(createSetupQuestionnaire(none), 'issueWorkflows.enabled');
    const kept = transitionSetupQuestionnaire(noneState, { kind: 'answer', value: '' });
    expect(kept.draft.issueWorkflows.enabled).toEqual([]);
    expect(kept.draft.createInitialTag).toBe(false);
  });

  it('recomputes the initial version decision when a saved workflow answer changes', () => {
    let state = advanceTo(createSetupQuestionnaire(createDefaultSetupConfiguration()), 'issueWorkflows.enabled');
    state = transitionSetupQuestionnaire(state, { kind: 'answer', value: 'feature' });
    expect(state.draft.createInitialTag).toBe(false);
    const back = transitionSetupQuestionnaire(state, { kind: 'back' });
    expect(transitionSetupQuestionnaire(back, { kind: 'answer', value: 'feature,hotfix' }).draft.createInitialTag).toBe(true);
  });

  it('reports truthful conditional progress and returns to a saved answer without resetting later values', () => {
    const first = createSetupQuestionnaire(createDefaultSetupConfiguration());
    expect(setupQuestionnaireProgress(first, {})).toMatchObject({ position: 1, groupPosition: 1, group: 'capabilities' });
    const second = transitionSetupQuestionnaire(first, { kind: 'answer', value: 'no' });
    expect(second.question?.id).toBe('features.pullRequests');
    expect(setupQuestionnaireProgress(second, {})?.position).toBe(2);
    const back = transitionSetupQuestionnaire(second, { kind: 'back' });
    expect(back.question?.id).toBe(first.question?.id);
    expect(back.question?.defaultValue).toBe(false);
    expect(back.draft.features.issues).toBe(false);
    expect(transitionSetupQuestionnaire(back, { kind: 'answer', value: 'yes' }).draft.features.issues).toBe(true);
    expect(transitionSetupQuestionnaire(first, { kind: 'back' }).validation).toContain('first question');
  });

  it('does not invent progress or refresh a question after it disappears from the visible pass', () => {
    const initial = createSetupQuestionnaire(createDefaultSetupConfiguration());
    const hidden = { skipQuestionIds: [initial.question!.id] };
    expect(setupQuestionnaireProgress(initial, hidden)).toBeUndefined();
    expect(refreshSetupQuestionnaireQuestion(initial, hidden)).toBe(initial);
    const noQuestion = { ...initial, question: undefined };
    expect(setupQuestionnaireProgress(noQuestion, {})).toBeUndefined();
    expect(refreshSetupQuestionnaireQuestion(noQuestion, {})).toBe(noQuestion);
    const review = createSetupReviewState(initial.draft);
    expect(setupQuestionnaireProgress(review, {})).toBeUndefined();
    expect(refreshSetupQuestionnaireQuestion(review, {})).toBe(review);
    expect(reopenSetupQuestionnaireGroup(initial, 'repository', {})).toBeUndefined();
  });

  it('treats legacy states without a phase as the full questionnaire during refresh and Back', () => {
    const first = createSetupQuestionnaire(createDefaultSetupConfiguration());
    const refreshed = refreshSetupQuestionnaireQuestion({ ...first, phase: undefined }, {});
    expect(refreshed.question?.id).toBe(first.question?.id);
    const second = transitionSetupQuestionnaire(first, { kind: 'answer', value: '' });
    const previous = transitionSetupQuestionnaire({ ...second, phase: undefined }, { kind: 'back' });
    expect(previous.question?.id).toBe(first.question?.id);
    const context: SetupQuestionnaireContext = { projectOwner: 'acme', projectDiscovery: { status: 'unsupported', candidates: [] } };
    const selection = advanceTo(createSetupQuestionnaire(createDefaultSetupConfiguration(), context), 'projects.ids', context);
    const selected = transitionSetupQuestionnaire(selection, { kind: 'answer', value: '5' }, context);
    const attestation = advanceTo(selected, 'projects.statusVerified', context);
    expect(transitionSetupQuestionnaire({ ...attestation, phase: undefined }, { kind: 'answer', value: 'no' }, context)
      .question?.id).toBe('projects.ids');
  });

  it('keeps Basic defaults safe when an optional nested configuration section is absent', () => {
    const configuration = createDefaultSetupConfiguration();
    const incomplete = { ...configuration, ai: undefined } as unknown as typeof configuration;
    expect(setupBasicSkippedQuestionIds(incomplete)).not.toContain('ai.bugbotCommentLimit');
  });

  it('does not restart when answering a question makes that question disappear', () => {
    const initial = createDefaultSetupConfiguration();
    initial.projects.ids = '12';
    const context = { projectsWanted: true };
    const question = advanceTo(createSetupQuestionnaire(initial, context), 'projects.ids', context);
    const next = transitionSetupQuestionnaire(question, { kind: 'answer', value: 'none' }, context);
    expect(next.question?.id).not.toBe('features.issues');
    expect(next.stateId).not.toBe('capabilities');
  });

  it('offers plan correction groups and reopens an existing review without clearing its draft', () => {
    const draft = createDefaultSetupConfiguration();
    expect(setupEditableGroups(draft)).toContain('repository');
    expect(setupEditableGroups(draft)).toContain('projects');
    const review = createSetupReviewState(draft);
    const reopened = reopenSetupQuestionnaireGroup(review, 'repository', {});
    expect(reopened).toMatchObject({ terminal: 'collecting', stateId: 'repository', draft });
    expect(reopened?.question?.id).toBe('repository.mainBranch');
    expect(reopenSetupQuestionnaireGroup(review, 'agent-role-overrides', {})).toBeUndefined();
  });
  it('preserves independent agent overrides on revisit and normalizes them only when explicitly disabled', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.agents.planner.model = 'different-model';
    expect(setupEditableGroups(configuration)).toContain('agent-role-overrides');
    const question = advanceTo(createSetupQuestionnaire(configuration), 'agents.configureIndependently');
    expect(question.question?.defaultValue).toBe(true);
    const disabled = transitionSetupQuestionnaire(question, { kind: 'answer', value: 'no' });
    expect(disabled.draft.agents.planner.model).toBe(disabled.draft.agents.findings.model);
  });
  it('collects only permission-driving questions and reuses their answers in the full wizard', () => {
    const defaults = createDefaultSetupConfiguration();
    const intentContext = { skipQuestionIds: ['createInitialTag', 'manageRepositorySecrets'] };
    let state = createSetupPermissionIntentQuestionnaire(defaults, intentContext);
    const visited: string[] = [];
    while (state.terminal === 'collecting') {
      visited.push(state.question!.id);
      const value = state.question!.id === 'features.pullRequests' ? 'no' : '';
      state = transitionSetupQuestionnaire(state, { kind: 'answer', value }, intentContext);
    }
    expect(visited).toContain('features.issues');
    expect(visited).toContain('issueWorkflows.enabled');
    expect(visited).not.toContain('pullRequestApproval.mode');
    expect(visited).not.toContain('createInitialTag');
    expect(visited).not.toContain('manageRepositorySecrets');
    expect(visited).not.toContain('agents.findings.model');
    expect(state.draft.features.pullRequests).toBe(false);
    const full = createSetupQuestionnaire(state.draft, { skipQuestionIds: [...intentContext.skipQuestionIds, ...(state.answeredQuestionIds ?? [])] });
    expect(full.question?.id).not.toBe('features.issues');
    expect(full.draft.features.pullRequests).toBe(false);
  });

  it('uses the current draft when permission intent is revised', () => {
    const first = createSetupPermissionIntentQuestionnaire(createDefaultSetupConfiguration());
    const changed = transitionSetupQuestionnaire(first, { kind: 'answer', value: 'no' });
    const revised = createSetupPermissionIntentQuestionnaire(changed.draft);
    expect(revised.question?.defaultValue).toBe(false);
    expect(revised.phase).toBe('permission-intent');
  });

  it('drops release and hotfix intent when issue automation is turned off', () => {
    const state = transitionSetupQuestionnaire(
      createSetupPermissionIntentQuestionnaire(createDefaultSetupConfiguration()),
      { kind: 'answer', value: 'no' },
    );
    expect(state.draft.features.issues).toBe(false);
    expect(state.draft.features.release).toBe(false);
    expect(state.draft.features.hotfix).toBe(false);
    expect(state.draft.issueWorkflows.enabled).toEqual([]);
  });

  it('lets either presentation explicitly clear every issue workflow', () => {
    const state = advanceTo(createSetupQuestionnaire(createDefaultSetupConfiguration()), 'issueWorkflows.enabled');
    const cleared = transitionSetupQuestionnaire(state, { kind: 'answer', value: 'none' });
    expect(cleared.draft.issueWorkflows.enabled).toEqual([]);
    expect(validateSetupConfiguration(cleared.draft)).toContain(
      'At least one issue workflow must be enabled when issue automation is enabled.',
    );
  });

  it('explains fixed release/hotfix overrides and rejects conflicting PAT-intent answers without changing them', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.features.release = true;
    configuration.features.hotfix = false;
    configuration.issueWorkflows.enabled = ['feature', 'bugfix', 'release'];
    const context = { fixedWorkflowFeatures: { release: true, hotfix: false } };
    const first = createSetupPermissionIntentQuestionnaire(configuration, context);
    expect(first.question?.fixedWorkflowFeatures).toEqual(context.fixedWorkflowFeatures);
    const disabled = transitionSetupQuestionnaire(first, { kind: 'answer', value: 'no' }, context);
    expect(disabled.validation).toContain('release or hotfix override');
    expect(disabled.draft).toEqual(first.draft);

    const workflows = advanceTo(first, 'issueWorkflows.enabled', context);
    expect(workflows.question?.fixedWorkflowFeatures).toEqual(context.fixedWorkflowFeatures);
    const missingRelease = transitionSetupQuestionnaire(workflows, { kind: 'answer', value: 'feature,bugfix' }, context);
    expect(missingRelease.validation).toContain('release workflow must remain enabled');
    expect(missingRelease.draft).toEqual(workflows.draft);
    const extraHotfix = transitionSetupQuestionnaire(workflows, { kind: 'answer', value: 'feature,release,hotfix' }, context);
    expect(extraHotfix.validation).toContain('hotfix workflow must remain disabled');
    expect(extraHotfix.draft).toEqual(workflows.draft);
    const accepted = transitionSetupQuestionnaire(workflows, { kind: 'answer', value: 'feature,release' }, context);
    expect(accepted.validation).toBeUndefined();
    expect(accepted.draft.features.release).toBe(true);
    expect(accepted.draft.features.hotfix).toBe(false);
  });

  it('enters review immediately when the permission-intent phase has no open questions', () => {
    const ids = [
      'features.issues', 'features.pullRequests', 'issueWorkflows.enabled', 'pullRequestApproval.mode',
      'projects.enabled', 'manageRepositoryVariables', 'manageRepositorySecrets',
      'storage.variables.defaultScope', 'storage.variables.preserveExisting',
      'storage.secrets.defaultScope', 'storage.secrets.preserveExisting',
    ];
    const state = createSetupPermissionIntentQuestionnaire(createDefaultSetupConfiguration(), { skipQuestionIds: ids });
    expect(state).toEqual(expect.objectContaining({ terminal: 'review', phase: 'permission-intent', answeredQuestionIds: [] }));
  });

  it('enters the full review immediately when all questions are already fixed', () => {
    const configuration = createDefaultSetupConfiguration();
    const ids: string[] = [];
    let state = createSetupQuestionnaire(configuration);
    while (state.terminal === 'collecting') {
      ids.push(state.question!.id);
      state = transitionSetupQuestionnaire(state, { kind: 'answer', value: '' });
    }
    expect(createSetupQuestionnaire(configuration, { skipQuestionIds: ids })).toEqual(
      expect.objectContaining({ terminal: 'review', phase: 'full' }),
    );
  });

  it('supports a legacy collecting state without an explicit phase', () => {
    const { phase: _phase, ...legacy } = createSetupQuestionnaire(createDefaultSetupConfiguration());
    const next = transitionSetupQuestionnaire(legacy, { kind: 'answer', value: '' });
    expect(next.question?.id).toBe('features.pullRequests');
  });

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
      'pull-request-approval',
      'projects',
      'provisioning',
      'storage',
    ]);
    expect(state).toEqual(expect.objectContaining({ stateId: 'review', terminal: 'review' }));
  });

  it('asks for recommendation, guarded, or off and requires explicit producer attestation', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'recommend' };
    let state = advanceTo(createSetupQuestionnaire(configuration), 'pullRequestApproval.mode');
    expect(state.question?.choices).toEqual(['recommend', 'guarded', 'off']);
    expect(state.question?.defaultValue).toBe('recommend');
    state = advanceTo(state, 'pullRequestApproval.producerAttested');
    expect(state.question?.defaultValue).toBe(false);
    state = transitionSetupQuestionnaire(state, { kind: 'answer', value: 'yes' });
    expect(state.draft.pullRequestApproval.producerAttested).toBe(true);
  });

  it('asks producer attestation only after the exact coverage check has been selected', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'recommend',
      testChecks: [{ name: 'Tests', sourceAppId: 12, workflowName: 'CI' }] };
    const check = advanceTo(createSetupQuestionnaire(configuration), 'pullRequestApproval.coverage.checkName');
    expect(check.question?.choices).toEqual(['Tests']);
    const next = transitionSetupQuestionnaire(check, { kind: 'answer', value: 'Tests' });
    expect(next.question?.id).toBe('pullRequestApproval.producerAttested');
  });

  it('offers observed CI producers without treating a green check as attestation', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'recommend' };
    const candidate = { name: 'Tests', sourceAppId: 12, workflowName: 'CI',
      runUrl: 'https://github.com/acme/project/actions/runs/42', headSha: 'a'.repeat(40), conclusion: 'success' };
    const context: SetupQuestionnaireContext = { approvalCheckCandidates: [candidate] };
    const first = advanceTo(createSetupQuestionnaire(configuration, context), 'pullRequestApproval.testChecks', context);
    expect(first.question).toMatchObject({ kind: 'producer-select', producerCandidates: [candidate] });
    const invalid = transitionSetupQuestionnaire(first, { kind: 'answer', value: '' }, context);
    expect(invalid.validation).toContain('Select 1–8 observed checks');
    const selected = transitionSetupQuestionnaire(first, { kind: 'answer', value: 'Tests|12|CI' }, context);
    expect(selected.draft.pullRequestApproval.testChecks).toEqual([{ name: 'Tests', sourceAppId: 12, workflowName: 'CI' }]);
    expect(selected.draft.pullRequestApproval.producerAttested).toBe(false);
    const coverage = advanceTo(selected, 'pullRequestApproval.coverage.checkName', context);
    expect(coverage.question?.choices).toEqual(['Tests']);
    expect(coverage.question?.producerCandidates).toEqual([candidate]);
  });

  it('rejects ambiguous trusted check names and preserves previous answers on discovery refresh', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'recommend' };
    const context: SetupQuestionnaireContext = { approvalCheckDiscoveryStatus: 'unavailable',
      discoveryRetryRemaining: { checks: 2, projects: 0 }, approvalCheckCandidates: [] };
    const state = advanceTo(createSetupQuestionnaire(configuration, context), 'pullRequestApproval.testChecks', context);
    const refreshed = refreshSetupQuestionnaireQuestion(state, { ...context, approvalCheckDiscoveryStatus: 'observed',
      discoveryRetryRemaining: { checks: 1, projects: 0 }, approvalCheckCandidates: [{ name: 'Tests', sourceAppId: 12,
        workflowName: 'CI', runUrl: 'https://github.com/acme/repo/actions/runs/5', headSha: 'a'.repeat(40), conclusion: 'success' }] });
    expect(refreshed.question).toMatchObject({ id: state.question?.id, discoveryStatus: 'observed', discoveryRetryRemaining: 1 });
    expect(refreshed.answeredQuestionIds).toEqual(state.answeredQuestionIds);
    expect(refreshed.draft).toEqual(state.draft);
    expect(transitionSetupQuestionnaire(refreshed, { kind: 'answer', value: 'Tests|12|CI;Tests|13|Other' }).validation)
      .toContain('same check name');
  });

  it('does not label a required ruleset check as verified after the target development branch changes', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'recommend' };
    configuration.repository.developmentBranch = 'release';
    const context: SetupQuestionnaireContext = { approvalCheckCandidates: [{ name: 'Tests', sourceAppId: 12,
      workflowName: 'CI', runUrl: 'https://github.com/acme/repo/actions/runs/5', headSha: 'a'.repeat(40), conclusion: 'success',
      requiredByRuleset: { branch: 'develop', sourceUrl: 'https://github.com/acme/repo/rules/3' } }] };
    const state = advanceTo(createSetupQuestionnaire(configuration, context), 'pullRequestApproval.testChecks', context);
    expect(state.question?.producerCandidates?.[0].requiredByRuleset).toBeUndefined();
    configuration.repository.developmentBranch = 'develop';
    const matched = advanceTo(createSetupQuestionnaire(configuration, context), 'pullRequestApproval.testChecks', context);
    expect(matched.question?.producerCandidates?.[0].requiredByRuleset?.branch).toBe('develop');
  });

  it('keeps manual check entry when discovery found no trusted producer', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'recommend' };
    const state = advanceTo(createSetupQuestionnaire(configuration, { approvalCheckCandidates: [] }),
      'pullRequestApproval.testChecks', { approvalCheckCandidates: [] });
    expect(state.question?.kind).toBe('producer-select');
    expect(transitionSetupQuestionnaire(state, { kind: 'answer', value: 'Tests|x|CI' }).validation).toContain('Select 1–8');
  });

  it('normalizes observed producer numbers but rejects repeated or out-of-range selections', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'recommend' };
    const candidate = { name: 'Tests', sourceAppId: 12, workflowName: 'CI', runUrl: 'https://github.com/acme/repo/actions/runs/5',
      headSha: 'a'.repeat(40), conclusion: 'success' };
    const context: SetupQuestionnaireContext = { approvalCheckCandidates: [candidate], approvalCheckDiscoveryStatus: 'observed' };
    const state = advanceTo(createSetupQuestionnaire(configuration, context), 'pullRequestApproval.testChecks', context);
    expect(state.question?.discoveryRetryRemaining).toBe(0);
    expect(transitionSetupQuestionnaire(state, { kind: 'answer', value: '1' }, context).draft.pullRequestApproval.testChecks)
      .toEqual([{ name: 'Tests', sourceAppId: 12, workflowName: 'CI' }]);
    expect(transitionSetupQuestionnaire(state, { kind: 'answer', value: '1,1' }, context).validation)
      .toContain('selected more than once');
    expect(transitionSetupQuestionnaire(state, { kind: 'answer', value: '2' }, context).validation)
      .toContain('Select 1–8 observed checks');
    const noCandidates = { ...state, question: { ...state.question!, producerCandidates: undefined } };
    expect(transitionSetupQuestionnaire(noCandidates, { kind: 'answer', value: '1' }, context).validation)
      .toContain('Select 1–8 observed checks');
  });

  it('asks only Project intent before PAT and selects concrete Projects afterwards', () => {
    const defaults = createDefaultSetupConfiguration();
    const intent = advanceTo(createSetupPermissionIntentQuestionnaire(defaults), 'projects.enabled');
    expect(intent.question?.kind).toBe('boolean');
    const wanted = transitionSetupQuestionnaire(intent, { kind: 'answer', value: 'yes' });
    expect(wanted.projectsWanted).toBe(true);
    expect(wanted.draft.projects.ids).toBe('');
    const context: SetupQuestionnaireContext = { projectsWanted: true, projectOwner: 'acme', projectDiscovery: {
      status: 'observed', candidates: [
        { number: 2, title: 'First', owner: 'acme', url: 'https://github.com/orgs/acme/projects/2', statusOptions: ['Todo', 'In Progress'] },
        { number: 3, title: 'Second', owner: 'acme', url: 'https://github.com/orgs/acme/projects/3', statusOptions: ['In Progress'] },
      ],
    } };
    const select = advanceTo(createSetupQuestionnaire(wanted.draft, context), 'projects.ids', context);
    expect(select.question).toMatchObject({ kind: 'project-select', discoveryStatus: 'observed' });
    const selected = transitionSetupQuestionnaire(select, { kind: 'answer', value: '2,3' }, context);
    expect(selected.draft.projects.ids).toBe('2,3');
    expect(selected.question).toMatchObject({ id: 'projects.issueCreatedColumn', kind: 'choice', choices: ['In Progress'] });
    expect(transitionSetupQuestionnaire(selected, { kind: 'answer', value: '' }, context).validation)
      .toContain('saved Status value');
  });

  it('clears saved Project IDs when the operator changes Project intent to no', () => {
    const defaults = createDefaultSetupConfiguration();
    const selected = { ...defaults, projects: { ...defaults.projects, ids: '42' } };
    const intent = advanceTo(createSetupPermissionIntentQuestionnaire(selected), 'projects.enabled');
    const declined = transitionSetupQuestionnaire(intent, { kind: 'answer', value: 'no' });
    expect(declined.projectsWanted).toBe(false);
    expect(declined.draft.projects.ids).toBe('');
  });

  it('rejects incompatible Projects and GraphQL IDs before leaving the question', () => {
    const context: SetupQuestionnaireContext = { projectOwner: 'acme', projectDiscovery: { status: 'observed', candidates: [
      { number: 2, title: 'First', owner: 'acme', url: 'https://github.com/orgs/acme/projects/2', statusOptions: ['Todo'] },
      { number: 3, title: 'Second', owner: 'acme', url: 'https://github.com/orgs/acme/projects/3', statusOptions: ['Done'] },
    ] } };
    const state = advanceTo(createSetupQuestionnaire(createDefaultSetupConfiguration(), context), 'projects.ids', context);
    expect(transitionSetupQuestionnaire(state, { kind: 'answer', value: '2,3' }, context).validation)
      .toContain('no common Status option');
    expect(transitionSetupQuestionnaire(state, { kind: 'answer', value: 'PVT_fake' }, context).validation)
      .toContain('positive Project number');
  });

  it('does not offer a futile Project retry when the personal-owner listing is unsupported', () => {
    const context: SetupQuestionnaireContext = { projectOwner: 'someone', projectDiscovery: {
      status: 'unsupported', candidates: [],
    }, discoveryRetryRemaining: { checks: 0, projects: 0 } };
    const selection = advanceTo(createSetupQuestionnaire(createDefaultSetupConfiguration(), context), 'projects.ids', context);
    expect(selection.question?.discoveryStatus).toBe('unsupported');
    expect(selection.question?.discoveryRetryRemaining).toBeUndefined();
  });

  it('requires an explicit human check of all four Status values when Project fields were not observed', () => {
    const context: SetupQuestionnaireContext = { projectOwner: 'acme', projectDiscovery: {
      status: 'unsupported', candidates: [],
    } };
    const selection = advanceTo(createSetupQuestionnaire(createDefaultSetupConfiguration(), context), 'projects.ids', context);
    const selected = transitionSetupQuestionnaire(selection, { kind: 'answer', value: '5' }, context);
    const attestation = advanceTo(selected, 'projects.statusVerified', context);
    expect(attestation.question?.projectStatusValues).toEqual([
      { transition: 'issueCreated', value: 'Todo' },
      { transition: 'pullRequestCreated', value: 'In Progress' },
      { transition: 'issueInProgress', value: 'In Progress' },
      { transition: 'pullRequestInProgress', value: 'In Progress' },
    ]);
    const retry = transitionSetupQuestionnaire(attestation, { kind: 'answer', value: 'no' }, context);
    expect(retry.question?.id).toBe('projects.ids');
    expect(retry.validation).toContain('not confirmed');
    expect(retry.draft).toEqual(attestation.draft);
    expect(retry.answeredQuestionIds).not.toContain('projects.statusVerified');
    expect(transitionSetupQuestionnaire(attestation, { kind: 'answer', value: '' }, context).validation)
      .toContain('Open every selected Project');
    expect(transitionSetupQuestionnaire(attestation, { kind: 'answer', value: 'yes' }, context).question?.id)
      .toBe('manageRepositoryVariables');
  });

  it('does not redirect an attestation refusal to a Project question hidden in this pass', () => {
    const context: SetupQuestionnaireContext = { projectOwner: 'acme', projectDiscovery: { status: 'unsupported', candidates: [] } };
    const selection = advanceTo(createSetupQuestionnaire(createDefaultSetupConfiguration(), context), 'projects.ids', context);
    const selected = transitionSetupQuestionnaire(selection, { kind: 'answer', value: '5' }, context);
    const attestation = advanceTo(selected, 'projects.statusVerified', context);
    const hidden: SetupQuestionnaireContext = { ...context, skipQuestionIds: ['projects.ids'] };
    const declined = transitionSetupQuestionnaire(attestation, { kind: 'answer', value: 'no' }, hidden);
    expect(declined.question?.id).toBe('projects.statusVerified');
    expect(declined.validation).toContain('Open every selected Project');
  });

  it('accepts a manual Project number when an older question has no discovery candidate field', () => {
    const context: SetupQuestionnaireContext = { projectOwner: 'acme' };
    const state = advanceTo(createSetupQuestionnaire(createDefaultSetupConfiguration(), context), 'projects.ids', context);
    const legacy = { ...state, question: { ...state.question!, projectCandidates: undefined } };
    expect(transitionSetupQuestionnaire(legacy, { kind: 'answer', value: '5' }, context).draft.projects.ids).toBe('5');
  });

  it('asks for numeric threshold, artifact workflow, and reporter attestation only in numeric mode', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'recommend' };
    let state = advanceTo(createSetupQuestionnaire(configuration), 'pullRequestApproval.coverage.mode');
    state = transitionSetupQuestionnaire(state, { kind: 'answer', value: 'numeric' });
    expect(state.draft.pullRequestApproval.coverage).toMatchObject({ mode: 'numeric', minDiffPercent: 80,
      reporterAttested: false });
    state = advanceTo(state, 'pullRequestApproval.coverage.minDiffPercent');
    state = transitionSetupQuestionnaire(state, { kind: 'answer', value: '85' });
    expect(state.draft.pullRequestApproval.coverage).toMatchObject({ minDiffPercent: 85 });
    state = advanceTo(state, 'pullRequestApproval.coverage.artifactWorkflowName');
    state = transitionSetupQuestionnaire(state, { kind: 'answer', value: 'CI Check' });
    state = advanceTo(state, 'pullRequestApproval.coverage.reporterAttested');
    state = transitionSetupQuestionnaire(state, { kind: 'answer', value: 'yes' });
    expect(state.draft.pullRequestApproval.coverage).toMatchObject({ artifactWorkflowName: 'CI Check', reporterAttested: true });
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
        repositorySecretsAccess: 'available',
        organizationSecrets: ['PAT', 'UNRELATED_SECRET'],
        repositoryVariables: [{ name: 'UNRELATED_VARIABLE', value: 'repository' }],
        repositoryVariablesAccess: 'available',
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
        repositorySecretsAccess: 'available',
        organizationSecrets: [],
        repositoryVariables: [{ name: 'ALREADY_LOCAL', value: 'local' }],
        repositoryVariablesAccess: 'available',
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
    state = transitionSetupQuestionnaire(state, { kind: 'answer', value: state.question?.id === 'pullRequestApproval.testChecks' ? 'Tests|12|CI' : '' }, context);
  }
  throw new Error(`Question ${questionId} was not reached; stopped at ${state.question?.id}: ${state.validation ?? 'no validation error'}.`);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
