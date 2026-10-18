import type { SetupRemoteConfiguration } from '../../../../domain/setup';
import type { SetupQuestionnaireState, SetupQuestionnaireContext } from '../../../../domain/setup_questionnaire';
import { createDefaultSetupConfiguration, SETUP_AGENT_TASKS } from '../../../policies/setup_configuration_defaults';
import { buildSetupRepositoryVariables } from '../../../policies/setup_configuration_plan';
import { createSetupReviewState, transitionSetupQuestionnaire } from '../../../policies/setup_questionnaire_policy';
import { SetupWizardUseCase } from '../setup_wizard_use_case';

function fixture(overrides: Partial<SetupRemoteConfiguration> = {}) {
  const source = createDefaultSetupConfiguration();
  source.ai.bugbotCommentLimit = 17;
  source.agents.findings.model = 'gpt-6-luna';
  const remote: SetupRemoteConfiguration = { ownerType: 'Organization', defaultBranch: 'master', repositoryId: 7,
    repositoryVisibility: 'private', repositoryVariables: [], repositoryVariablesAccess: 'available',
    organizationVariables: buildSetupRepositoryVariables(source), organizationVariablesAccess: 'available',
    repositorySecretRevisions: (overrides.repositorySecrets ?? ['PAT']).map(name => ({ name, updatedAt: '2026-10-17T00:00:00Z' })),
    organizationSecretRevisions: (overrides.organizationSecrets ?? []).map(name => ({ name, updatedAt: '2026-10-17T00:00:00Z' })),
    repositorySecrets: ['PAT'], repositorySecretsAccess: 'available', organizationSecrets: [],
    organizationSecretsAccess: 'available', organizationAccess: 'available', ...overrides };
  const collect = jest.fn(async (state: SetupQuestionnaireState, _context: SetupQuestionnaireContext) => createSetupReviewState(state.draft));
  const dependencies = { collector: { collect }, planPresenter: { present: jest.fn() },
    confirmation: { confirm: jest.fn().mockResolvedValue({ kind: 'approved' }) },
    finalPermissionAudit: { audit: jest.fn().mockResolvedValue({ status: 'accepted' }) },
    remoteConfiguration: { inspect: jest.fn().mockResolvedValue(remote) } };
  const request = { mode: 'interactive' as const, configurationSource: 'organization' as const,
    remoteTarget: { owner: 'acme', repository: 'repo', token: 'fixture-operator-token' },
    developmentBranchObservedLocally: true, overrides: { pullRequestApproval: { mode: 'off' as const } } };
  return { source, remote, collect, dependencies, request };
}

describe('organization import in the shared setup wizard', () => {
  it('retains explicitly reviewed mixed storage scopes on the first reuse preview', async () => {
    const f = fixture();
    const result = await new SetupWizardUseCase(f.dependencies).execute({ ...f.request, overrides: {
      ...f.request.overrides, storage: { variables: { defaultScope: 'repository' }, secrets: { defaultScope: 'organization' } } } });
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') throw new Error('Expected a reviewed mixed-scope plan.');
    expect(result.configuration.storage.variables.defaultScope).toBe('repository');
    expect(result.configuration.storage.secrets.defaultScope).toBe('organization');
  });
  it.each(['organization', 'repository'] as const)('shows actual %s fallback names once without proposing task overrides', async scope => {
    const f = fixture();
    f.remote.organizationVariables = f.remote.organizationVariables.filter(variable => !SETUP_AGENT_TASKS.some(task => variable.name.startsWith(`${task.toUpperCase()}_`)));
    if (scope === 'repository') f.remote.repositoryVariables = f.remote.organizationVariables.filter(variable => variable.name.startsWith('AGENT_')).map(variable => ({ ...variable }));
    const result = await new SetupWizardUseCase(f.dependencies).execute(f.request);
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') throw new Error('Expected a reviewed fallback plan.');
    const review = result.plan.organizationReuse!;
    expect(review.repositoryWrites).toEqual([]);
    const names = scope === 'repository' ? review.repositoryVariables : review.organizationVariables;
    expect(names.filter(name => name === 'AGENT_PROVIDER')).toEqual(['AGENT_PROVIDER']);
    expect([...review.organizationVariables, ...review.repositoryVariables].some(name => SETUP_AGENT_TASKS.some(task => name.startsWith(`${task.toUpperCase()}_`)))).toBe(false);
  });
  it('blocks a known personal owner with the specific organization-reuse explanation', async () => {
    const f = fixture({ ownerType: 'User' }); const result = await new SetupWizardUseCase(f.dependencies).execute(f.request);
    expect(result).toMatchObject({ status: 'blocked', errors: [expect.stringContaining('personal repository')] }); expect(f.collect).not.toHaveBeenCalled();
  });
  it('blocks organization reuse without a remote target instead of assuming inventory exists', async () => {
    const f = fixture(); const result = await new SetupWizardUseCase(f.dependencies).execute({ ...f.request, remoteTarget: undefined });
    expect(result).toMatchObject({ status: 'blocked', reason: 'remote-storage-unavailable' }); expect(f.dependencies.remoteConfiguration.inspect).not.toHaveBeenCalled();
    expect(f.collect).not.toHaveBeenCalled();
  });
  it('preserves explicit scope choices and reviewed settings across a revision', async () => {
    const f = fixture(); const wizard = new SetupWizardUseCase(f.dependencies); const initial = await wizard.execute(f.request);
    if (initial.status !== 'completed') throw new Error('Expected reviewed initial configuration');
    const result = await wizard.execute({ ...f.request, revision: { group: 'storage', answeredQuestionIds: [] }, organizationImportSnapshot: initial.organizationImport,
      overrides: { ...initial.configuration, storage: { variables: { ...initial.configuration.storage.variables, defaultScope: 'repository' },
        secrets: { ...initial.configuration.storage.secrets, defaultScope: 'repository' } } } });
    expect(result.status).toBe('completed'); expect(f.collect).toHaveBeenCalledTimes(2);
    if (result.status === 'completed') {
      expect(result.organizationImport).toEqual(initial.organizationImport);
      expect(result.configuration.ai.bugbotCommentLimit).toBe(17);
      expect(result.configuration.storage.variables.defaultScope).toBe('repository');
    }
  });
  it('renders a batch Customize plan without claiming organization settings were imported', async () => {
    const f = fixture(); const result = await new SetupWizardUseCase(f.dependencies).execute({ ...f.request, configurationSource: 'customize', deliveryMode: 'pull-request', previewOnly: true });
    expect(result.status).toBe('completed');
    if (result.status === 'completed') expect(result.plan.organizationReuse).toMatchObject({ imported: 0, needsReview: 0 });
    expect(f.dependencies.finalPermissionAudit.audit).not.toHaveBeenCalled();
  });
  it('blocks missing Secret revision evidence before questions or temporary write probes', async () => {
    const f = fixture({ repositorySecretRevisions: undefined });
    const result = await new SetupWizardUseCase(f.dependencies).execute(f.request);
    expect(result).toMatchObject({ status: 'blocked', errors: [expect.stringContaining('revision metadata is incomplete')] });
    expect(f.collect).not.toHaveBeenCalled(); expect(f.dependencies.finalPermissionAudit.audit).not.toHaveBeenCalled();
  });
  it('uses imported values and omits their questions in both presentation adapters', async () => {
    const f = fixture();
    const result = await new SetupWizardUseCase(f.dependencies).execute(f.request);
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') throw new Error('Expected a reviewed plan.');
    expect(result.configuration.ai.bugbotCommentLimit).toBe(17);
    expect(result.organizationImport?.inventory).toBe('available');
    expect(result.plan.organizationReuse?.organizationVariables.length).toBeGreaterThan(10);
    expect(f.collect.mock.calls[0][1].skipQuestionIds).toContain('storage.variables.defaultScope');
    expect(f.collect.mock.calls[0][1].skipQuestionIds).toEqual(expect.arrayContaining(['ai.bugbotCommentLimit', 'agents.findings.model']));
    expect(f.dependencies.finalPermissionAudit.audit).toHaveBeenCalledTimes(1);
  });

  it('preserves explicit configured values ahead of organization defaults', async () => {
    const f = fixture();
    const result = await new SetupWizardUseCase(f.dependencies).execute({ ...f.request,
      overrides: { ...f.request.overrides, ai: { bugbotCommentLimit: 9 } } });
    expect(result.status).toBe('completed');
    if (result.status === 'completed') expect(result.configuration.ai.bugbotCommentLimit).toBe(9);
  });

  it.each(['organizationVariablesAccess', 'repositoryVariablesAccess'] as const)('stops before prompts or write audits when %s is unknown', async field => {
    const f = fixture({ [field]: 'unknown' });
    const result = await new SetupWizardUseCase(f.dependencies).execute(f.request);
    expect(result).toMatchObject({ status: 'blocked', reason: 'remote-storage-unavailable' });
    expect(f.collect).not.toHaveBeenCalled();
    expect(f.dependencies.finalPermissionAudit.audit).not.toHaveBeenCalled();
  });

  it('keeps an unknown owner distinct from a known personal repository', async () => {
    const f = fixture({ ownerType: 'Unknown' });
    const result = await new SetupWizardUseCase(f.dependencies).execute(f.request);
    expect(result).toMatchObject({ status: 'blocked', errors: [expect.stringContaining('inventory must be available')] });
  });

  it('shows an invalid advanced organization value even in Basic mode', async () => {
    const f = fixture();
    f.remote.organizationVariables = f.remote.organizationVariables.map(variable => variable.name === 'BUGBOT_COMMENT_LIMIT'
      ? { ...variable, value: '101' } : variable);
    const seen: string[] = [];
    f.collect.mockImplementation(async (initial, context) => {
      let state = initial;
      for (let count = 0; state.question && count < 200; count += 1) {
        seen.push(state.question.id);
        state = transitionSetupQuestionnaire(state, { kind: 'answer', value: '' }, context);
      }
      return state;
    });
    const result = await new SetupWizardUseCase(f.dependencies).execute({ ...f.request, presentationMode: 'basic' });
    expect(result.status).toBe('completed');
    expect(seen).toContain('ai.bugbotCommentLimit');
    expect(seen).not.toContain('agents.findings.model');
  });

  it('retains the source snapshot and unrelated answered questions across a plan revision', async () => {
    const f = fixture();
    f.dependencies.confirmation.confirm.mockReset().mockResolvedValueOnce({ kind: 'revise', group: 'repository' })
      .mockResolvedValueOnce({ kind: 'approved' });
    f.collect.mockImplementationOnce(async state => createSetupReviewState(state.draft))
      .mockImplementationOnce(async state => createSetupReviewState({ ...state.draft,
        repository: { ...state.draft.repository, desiredReviewersCount: 3 } }));
    const result = await new SetupWizardUseCase(f.dependencies).execute(f.request);
    expect(result.status).toBe('completed');
    if (result.status !== 'completed') throw new Error('Expected a revised plan.');
    expect(result.configuration.repository.desiredReviewersCount).toBe(3);
    expect(result.configuration.ai.bugbotCommentLimit).toBe(17);
    expect(result.organizationImport?.settings.find(setting => setting.questionId === 'ai.bugbotCommentLimit')?.source).toBe('organization');
    expect(f.collect.mock.calls[1][1].skipQuestionIds).toContain('ai.bugbotCommentLimit');
    expect(f.collect.mock.calls[1][1].skipQuestionIds).not.toContain('repository.desiredReviewersCount');
  });

  it('preserves the legacy wizard when organization reuse was not selected', async () => {
    const f = fixture();
    const result = await new SetupWizardUseCase(f.dependencies).execute({ ...f.request, configurationSource: 'customize' });
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.configuration.ai.bugbotCommentLimit).toBe(createDefaultSetupConfiguration().ai.bugbotCommentLimit);
      expect(result.organizationImport).toBeUndefined();
    }
    expect(f.collect.mock.calls[0][1].skipQuestionIds).not.toContain('ai.bugbotCommentLimit');
  });
});
