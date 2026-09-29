import { buildInitialSetupConfiguration, SetupWizardUseCase } from '../setup_wizard_use_case';
import {
  buildSetupCredentialRequirements,
  buildSetupRepositoryVariables,
  createDefaultSetupConfiguration,
} from '../../../policies/setup_configuration_policy';
import { createSetupReviewState, setupQuestionContentInventory } from '../../../policies/setup_questionnaire_policy';
import type { SetupQuestionnaireContext, SetupQuestionnaireState } from '../../../../domain/setup_questionnaire';

const remote = {
  ownerType: 'Organization' as const,
  repositoryId: 7,
  repositoryVisibility: 'private' as const,
  repositorySecrets: ['PAT'],
  organizationSecrets: [] as string[],
  repositorySecretsAccess: 'available' as const,
  repositoryVariables: [] as { name: string; value: string }[],
  repositoryVariablesAccess: 'available' as const,
  organizationVariables: [] as { name: string; value: string }[],
  organizationAccess: 'available' as const,
  organizationSecretsAccess: 'available' as const,
  organizationVariablesAccess: 'available' as const,
};

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    planPresenter: { present: jest.fn() },
    confirmation: { confirm: jest.fn().mockResolvedValue({ kind: 'approved' }) },
    finalPermissionAudit: { audit: jest.fn().mockResolvedValue({ status: 'accepted' }) },
    ...overrides,
  };
}

describe('SetupWizardUseCase', () => {
  it('suggests an observed GitHub default branch without overriding an explicit configured branch', async () => {
    const collect = jest.fn(async (state: SetupQuestionnaireState, _context: SetupQuestionnaireContext) => createSetupReviewState(state.draft));
    const deps = dependencies({ collector: { collect }, remoteConfiguration: { inspect: jest.fn().mockResolvedValue({ ...remote, defaultBranch: 'main' }) } });
    const request = { mode: 'interactive' as const, remoteTarget: { owner: 'acme', repository: 'repo', token: 'setup-token' },
      overrides: { pullRequestApproval: { mode: 'off' as const } } };
    await new SetupWizardUseCase(deps).execute(request);
    expect(collect.mock.calls[0][0].question?.id).toBe('features.issues');
    expect(collect.mock.calls[0][0].draft.repository.mainBranch).toBe('main');
    expect(collect.mock.calls[0][1].branchSources?.main).toBe('github');
    expect(collect.mock.calls[0][1].branchSources?.development).toBe('default');
    collect.mockClear();
    await new SetupWizardUseCase(deps).execute({ ...request, developmentBranchObservedLocally: true });
    expect(collect.mock.calls[0][1].branchSources?.development).toBe('local');
    collect.mockClear();
    await new SetupWizardUseCase(deps).execute({ ...request, overrides: { ...request.overrides, repository: { mainBranch: 'production' } } });
    expect(collect.mock.calls[0][0].draft.repository.mainBranch).toBe('production');
    expect(collect.mock.calls[0][1].branchSources?.main).toBe('configuration');
  });
  it('re-enters a chosen plan section, retains other answers and rebuilds the plan before approval', async () => {
    let pass = 0;
    const collect = jest.fn(async (state, _context) => {
      pass += 1;
      return pass === 1
        ? { ...createSetupReviewState(state.draft), answeredQuestionIds: setupQuestionContentInventory().map(item => item.id) }
        : createSetupReviewState({ ...state.draft, repository: { ...state.draft.repository, mainBranch: 'main' } });
    });
    const confirmation = { confirm: jest.fn().mockResolvedValueOnce({ kind: 'revise', group: 'repository' })
      .mockResolvedValueOnce({ kind: 'approved' }) };
    const deps = dependencies({ collector: { collect }, confirmation });
    const result = await new SetupWizardUseCase(deps).execute({ mode: 'interactive',
      overrides: { pullRequestApproval: { mode: 'off' } } });
    expect(result.status).toBe('completed');
    if (result.status === 'completed') expect(result.configuration.repository.mainBranch).toBe('main');
    expect(collect).toHaveBeenCalledTimes(2);
    expect(collect.mock.calls[1][0].question?.id).toBe('repository.mainBranch');
    expect(collect.mock.calls[1][1].skipQuestionIds).toContain('features.issues');
    expect(confirmation.confirm).toHaveBeenCalledTimes(2);
    expect(deps.planPresenter.present).toHaveBeenCalledTimes(2);
  });
  it('starts the main questionnaire from reviewed permission intent and skips its answered questions', async () => {
    const draft = buildInitialSetupConfiguration({ mode: 'interactive', overrides: { pullRequestApproval: { mode: 'off' } } });
    draft.createInitialTag = false;
    draft.manageRepositorySecrets = false;
    const collect = jest.fn(async (state, _context) => createSetupReviewState(state.draft));
    const result = await new SetupWizardUseCase(dependencies({ collector: { collect } })).execute({
      mode: 'interactive', overrides: { pullRequestApproval: { mode: 'off' } },
      permissionIntent: { draft, answeredQuestionIds: ['createInitialTag', 'manageRepositorySecrets', 'features.issues'] },
    });
    expect(result.status).toBe('completed');
    if (result.status === 'completed') {
      expect(result.configuration.createInitialTag).toBe(false);
      expect(result.configuration.manageRepositorySecrets).toBe(false);
    }
    expect(collect.mock.calls[0][0].question?.id).not.toBe('features.issues');
    expect(collect.mock.calls[0][1].skipQuestionIds).toEqual(['createInitialTag', 'manageRepositorySecrets', 'features.issues']);
  });

  it('lets interactive setup repair legacy duplicate check names before final validation', async () => {
    const producer = { name: 'Tests', sourceAppId: 12, workflowName: 'CI' };
    const collect = jest.fn(async state => createSetupReviewState({ ...state.draft,
      pullRequestApproval: { ...state.draft.pullRequestApproval, testChecks: [producer] },
    }));
    const result = await new SetupWizardUseCase(dependencies({ collector: { collect } })).execute({
      mode: 'interactive', overrides: { pullRequestApproval: { mode: 'recommend', coverage: { mode: 'check', checkName: 'Tests' },
        testChecks: [producer, { name: 'Tests', sourceAppId: 13, workflowName: 'Other CI' }] } },
    });
    expect(collect).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('completed');
  });

  it('requires an explicit exact CI producer in non-interactive guarded setup', async () => {
    await expect(new SetupWizardUseCase(dependencies()).execute({ mode: 'non-interactive' }))
      .rejects.toThrow('guarded/recommend mode requires 1–8 exact test checks');
  });

  it('validates, previews, confirms, and returns an isolated non-interactive configuration', async () => {
    const deps = dependencies();
    const result = await new SetupWizardUseCase(deps).execute({ mode: 'non-interactive', overrides: { pullRequestApproval: { mode: 'off' } } });

    expect(result).toEqual(expect.objectContaining({ status: 'completed', exitCode: 0 }));
    expect(deps.planPresenter.present).toHaveBeenCalledTimes(1);
    expect(deps.confirmation.confirm).toHaveBeenCalledTimes(1);
    if (result.status === 'completed') {
      const defaults = createDefaultSetupConfiguration();
      expect(result.configuration).toEqual({
        ...defaults,
        repositoryAgentGuidance: { enabled: true, agentsPointer: 'create-if-missing' },
      });
      expect(result.configuration).not.toBe(defaults);
      expect(result.configuration.agents).not.toBe(defaults.agents);
    }
  });

  it('honors an explicit non-interactive pointer policy', async () => {
    const result = await new SetupWizardUseCase(dependencies()).execute({
      mode: 'non-interactive',
      overrides: { repositoryAgentGuidance: { agentsPointer: 'prompt' }, pullRequestApproval: { mode: 'off' } },
    });

    expect(result.status === 'completed' && result.configuration.repositoryAgentGuidance.agentsPointer)
      .toBe('prompt');
  });

  it('keeps guidance disabled while applying the safe non-interactive pointer default', async () => {
    const result = await new SetupWizardUseCase(dependencies()).execute({
      mode: 'non-interactive',
      overrides: { repositoryAgentGuidance: { enabled: false }, pullRequestApproval: { mode: 'off' } },
    });

    expect(result.status === 'completed' && result.configuration.repositoryAgentGuidance)
      .toEqual({ enabled: false, agentsPointer: 'create-if-missing' });
  });

  it('enforces explicit skip flags after merging overrides', async () => {
    const result = await new SetupWizardUseCase(dependencies()).execute({
      mode: 'non-interactive',
      overrides: { manageRepositoryVariables: true, manageRepositorySecrets: true, pullRequestApproval: { mode: 'off' } },
      skipRepositoryVariables: true,
      skipRepositorySecrets: true,
    });

    expect(result.status === 'completed' && result.configuration.manageRepositoryVariables).toBe(false);
    expect(result.status === 'completed' && result.configuration.manageRepositorySecrets).toBe(false);
  });

  it('does not install guarded mode when its runtime policy Variable would be skipped', async () => {
    await expect(new SetupWizardUseCase(dependencies()).execute({
      mode: 'non-interactive',
      skipRepositoryVariables: true,
      overrides: { pullRequestApproval: {
        mode: 'guarded',
        producerAttested: true,
        testChecks: [{ name: 'CI Check', sourceAppId: 15368, workflowName: 'CI Check' }],
        coverage: { mode: 'check', checkName: 'CI Check' },
      } },
    })).rejects.toThrow('--skip-variables would leave the runtime policy unverified');
  });

  it('turns the suggested approval mode off when PR automation was disabled before its stage', async () => {
    const result = await new SetupWizardUseCase(dependencies()).execute({
      mode: 'non-interactive', overrides: { features: { pullRequests: false } },
    });
    expect(result.status === 'completed' && result.configuration.pullRequestApproval.mode).toBe('off');
  });

  it('rejects underscore-separated locale tags without a migration path', async () => {
    const deps = dependencies();
    await expect(new SetupWizardUseCase(deps).execute({
      mode: 'non-interactive',
      overrides: { repository: { repositoryLocale: 'pt_BR', issueLocale: 'es_MX', pullRequestLocale: '' } },
    })).rejects.toMatchObject({ code: 'configuration.invalid' });
    expect(deps.planPresenter.present).not.toHaveBeenCalled();
  });

  it('returns exit zero and no configuration when confirmation is declined', async () => {
    const result = await new SetupWizardUseCase(dependencies({
      confirmation: { confirm: jest.fn().mockResolvedValue({ kind: 'declined' }) },
    })).execute({ mode: 'non-interactive', overrides: { pullRequestApproval: { mode: 'off' } } });

    expect(result).toEqual(expect.objectContaining({
      status: 'cancelled',
      reason: 'confirmation-declined',
      exitCode: 0,
    }));
    expect(result).not.toHaveProperty('configuration');
  });

  it('returns exit 130 when terminal input is interrupted during confirmation', async () => {
    const result = await new SetupWizardUseCase(dependencies({
      confirmation: { confirm: jest.fn().mockResolvedValue({ kind: 'cancelled' }) },
    })).execute({ mode: 'non-interactive', overrides: { pullRequestApproval: { mode: 'off' } } });

    expect(result).toEqual(expect.objectContaining({
      status: 'cancelled',
      reason: 'confirmation-cancelled',
      exitCode: 130,
    }));
  });

  it('returns exit 130 and no plan when interactive collection is cancelled', async () => {
    const deps = dependencies({
      collector: {
        collect: jest.fn(async (state) => ({ ...state, stateId: 'cancelled', terminal: 'cancelled' })),
      },
    });
    const result = await new SetupWizardUseCase(deps).execute({ mode: 'interactive' });

    expect(result).toEqual(expect.objectContaining({
      status: 'cancelled',
      reason: 'questionnaire-cancelled',
      exitCode: 130,
    }));
    expect(deps.planPresenter.present).not.toHaveBeenCalled();
  });

  it('supplies remote resource facts to the interactive questionnaire', async () => {
    const inspect = jest.fn().mockResolvedValue(remote);
    const collect = jest.fn(async (state) => createSetupReviewState(state.draft));
    const result = await new SetupWizardUseCase(dependencies({
      collector: { collect },
      remoteConfiguration: { inspect },
    })).execute({
      mode: 'interactive',
      overrides: { pullRequestApproval: { mode: 'off' } },
      remoteTarget: { owner: 'owner', repository: 'repo', token: 'token' },
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'completed', remoteConfiguration: { ...remote, credentialHealthWorkflow: 'unavailable' },
    }));
    expect(inspect).toHaveBeenCalledWith('owner', 'repo', 'token');
    expect(collect).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      remote,
      variableNames: buildSetupRepositoryVariables(createDefaultSetupConfiguration()).map((item) => item.name),
      secretNames: buildSetupCredentialRequirements(createDefaultSetupConfiguration()).map((item) => item.name),
    }), expect.objectContaining({ refresh: expect.any(Function) }));
  });

  it('discovers Projects with the entered setup PAT only after intent and passes the inventory to the questionnaire', async () => {
    const events: string[] = [];
    const draft = buildInitialSetupConfiguration({ mode: 'interactive', overrides: { pullRequestApproval: { mode: 'off' } } });
    const inspect = jest.fn(async () => { events.push('inspect'); return remote; });
    const discover = jest.fn(async () => {
      events.push('projects');
      return { status: 'observed' as const, candidates: [{ number: 12, title: 'Roadmap', owner: 'owner',
        url: 'https://github.com/orgs/owner/projects/12', statusOptions: ['Todo', 'In Progress'] }] };
    });
    const collect = jest.fn(async (state) => { events.push('collect'); return createSetupReviewState(state.draft); });
    await new SetupWizardUseCase(dependencies({
      collector: { collect }, remoteConfiguration: { inspect }, projectDiscovery: { discover },
    })).execute({ mode: 'interactive', overrides: { pullRequestApproval: { mode: 'off' } },
      permissionIntent: { draft, answeredQuestionIds: ['projects.enabled'], projectsWanted: true },
      remoteTarget: { owner: 'owner', repository: 'repo', token: 'setup-token' } });
    expect(events).toEqual(['inspect', 'projects', 'collect']);
    expect(discover).toHaveBeenCalledWith('owner', 'Organization', 'setup-token');
    expect(collect).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      projectsWanted: true, projectDiscovery: expect.objectContaining({ status: 'observed' }),
    }), expect.objectContaining({ refresh: expect.any(Function) }));
  });

  it('discovers Projects when the operator enables them while revising a plan that originally skipped them', async () => {
    const draft = buildInitialSetupConfiguration({ mode: 'interactive', overrides: { pullRequestApproval: { mode: 'off' } } });
    const discover = jest.fn().mockResolvedValue({ status: 'empty', candidates: [] });
    const collect = jest.fn(async state => createSetupReviewState(state.draft));
    await new SetupWizardUseCase(dependencies({ collector: { collect },
      remoteConfiguration: { inspect: jest.fn().mockResolvedValue(remote) },
      projectDiscovery: { discover } })).execute({ mode: 'interactive', overrides: { pullRequestApproval: { mode: 'off' } },
      permissionIntent: { draft, answeredQuestionIds: ['projects.enabled'], projectsWanted: false },
      revision: { group: 'projects', answeredQuestionIds: ['projects.enabled'] },
      remoteTarget: { owner: 'owner', repository: 'repo', token: 'setup-token' } });
    expect(discover).toHaveBeenCalledWith('owner', 'Organization', 'setup-token');
    expect(collect).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      projectsWanted: true, projectDiscovery: expect.objectContaining({ status: 'empty' }),
    }), expect.anything());
  });

  it('bounds explicit Project discovery retries and never requests another PAT', async () => {
    const draft = buildInitialSetupConfiguration({ mode: 'interactive', overrides: { pullRequestApproval: { mode: 'off' } } });
    const discover = jest.fn().mockResolvedValueOnce({ status: 'unavailable', candidates: [] })
      .mockResolvedValueOnce({ status: 'observed', candidates: [{ number: 4, owner: 'owner', title: 'Roadmap',
        url: 'https://github.com/orgs/owner/projects/4', statusOptions: ['Todo', 'In Progress'] }] })
      .mockResolvedValueOnce({ status: 'empty', candidates: [] });
    const collect = jest.fn(async (state, context, refresh) => {
      expect(context.discoveryRetryRemaining.projects).toBe(2);
      expect((await refresh.refresh('projects'))?.projectDiscovery?.status).toBe('observed');
      expect((await refresh.refresh('projects'))?.projectDiscovery?.status).toBe('empty');
      expect(await refresh.refresh('projects')).toBeUndefined();
      return createSetupReviewState(state.draft);
    });
    await new SetupWizardUseCase(dependencies({ collector: { collect }, remoteConfiguration: { inspect: jest.fn().mockResolvedValue(remote) },
      projectDiscovery: { discover } })).execute({ mode: 'interactive', overrides: { pullRequestApproval: { mode: 'off' } },
      permissionIntent: { draft, answeredQuestionIds: ['projects.enabled'], projectsWanted: true },
      remoteTarget: { owner: 'owner', repository: 'repo', token: 'setup-token' } });
    expect(discover).toHaveBeenCalledTimes(3);
    expect(discover).toHaveBeenNthCalledWith(3, 'owner', 'Organization', 'setup-token');
  });

  it('keeps provider failures explicit during initial CI/Project discovery and bounded retries', async () => {
    const draft = buildInitialSetupConfiguration({ mode: 'interactive', overrides: { pullRequestApproval: { mode: 'recommend' } } });
    const approvalDiscover = jest.fn().mockRejectedValue(new Error('CI provider unavailable'));
    const projectDiscover = jest.fn().mockRejectedValue(new Error('Projects provider unavailable'));
    const collect = jest.fn(async (state, context, refresh) => {
      expect(context.approvalCheckDiscoveryStatus).toBe('unavailable');
      expect(context.projectDiscovery?.status).toBe('unavailable');
      expect((await refresh.refresh('checks'))?.approvalCheckDiscoveryStatus).toBe('unavailable');
      expect((await refresh.refresh('projects'))?.projectDiscovery?.status).toBe('unavailable');
      return { ...state, terminal: 'cancelled' as const };
    });
    const result = await new SetupWizardUseCase(dependencies({ collector: { collect },
      remoteConfiguration: { inspect: jest.fn().mockResolvedValue(remote) },
      approvalCheckDiscovery: { discover: approvalDiscover }, projectDiscovery: { discover: projectDiscover } })).execute({
      mode: 'interactive', overrides: { pullRequestApproval: { mode: 'recommend' } },
      permissionIntent: { draft, answeredQuestionIds: ['projects.enabled'], projectsWanted: true },
      remoteTarget: { owner: 'owner', repository: 'repo', token: 'setup-token' },
    });
    expect(result.status).toBe('cancelled');
    expect(approvalDiscover).toHaveBeenCalledTimes(2);
    expect(projectDiscover).toHaveBeenCalledTimes(2);
  });

  it('adds live merge-queue readiness to the setup plan', async () => {
    const check = {
      id: 'github.merge-queue.production',
      status: 'pass' as const,
      summary: 'Ready.',
      evidence: {},
      blockedBy: [],
    };
    const readiness = { inspect: jest.fn().mockResolvedValue([check]) };
    const deps = dependencies({ mergeQueueReadiness: readiness, remoteConfiguration: { inspect: jest.fn().mockResolvedValue(remote) } });
    await new SetupWizardUseCase(deps).execute({
      mode: 'non-interactive',
      overrides: { pullRequestApproval: { mode: 'off' } },
      remoteTarget: { owner: 'owner', repository: 'repo', token: 'token' },
    });

    expect(readiness.inspect).toHaveBeenCalledWith(expect.objectContaining({
      owner: 'owner',
      repository: 'repo',
      catalog: expect.objectContaining({ locale: 'en-US', resolutionSource: 'exact' }),
    }));
    expect(deps.planPresenter.present).toHaveBeenCalledWith(expect.objectContaining({ mergeQueueReadiness: [check] }));
  });

  it('rejects interactive mode when no collector is composed', async () => {
    await expect(new SetupWizardUseCase(dependencies()).execute({ mode: 'interactive' }))
      .rejects.toThrow('Interactive setup requires a questionnaire collector');
  });

  it('rejects invalid non-interactive overrides before presenting a plan', async () => {
    const deps = dependencies();
    await expect(new SetupWizardUseCase(deps).execute({
      mode: 'non-interactive',
      overrides: { repository: { mainBranch: '' } },
    })).rejects.toThrow('Invalid setup configuration');
    expect(deps.planPresenter.present).not.toHaveBeenCalled();
  });

  it('returns the final configuration when remote storage validation blocks presentation', async () => {
    const blockedRemote = { ...remote, organizationVariablesAccess: 'unavailable' as const };
    const deps = dependencies({
      remoteConfiguration: { inspect: jest.fn().mockResolvedValue(blockedRemote) },
    });

    const result = await new SetupWizardUseCase(deps).execute({
      mode: 'non-interactive',
      overrides: {
        pullRequestApproval: { mode: 'off' },
        storage: { variables: { overrides: { AGENT_PROVIDER: 'organization' } } },
      },
      remoteTarget: { owner: 'owner', repository: 'repo', token: 'token' },
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'blocked',
      reason: 'remote-storage-unavailable',
      exitCode: 1,
      configuration: expect.objectContaining({ manageRepositoryVariables: true }),
      errors: expect.arrayContaining([expect.stringContaining('organization variables')]),
      remoteConfiguration: { ...blockedRemote, credentialHealthWorkflow: 'unavailable' },
    }));
    expect(deps.planPresenter.present).not.toHaveBeenCalled();
    expect(deps.confirmation.confirm).not.toHaveBeenCalled();
    expect(deps.finalPermissionAudit.audit).toHaveBeenCalledWith(
      expect.objectContaining({ manageRepositoryVariables: true }),
      { ...blockedRemote, credentialHealthWorkflow: 'unavailable' },
    );
  });

  it('returns the normalized configuration and bounded facts when the final permission audit rejects', async () => {
    const blockedRemote = { ...remote, repositoryVariablesAccess: 'unavailable' as const };
    const deps = dependencies({
      remoteConfiguration: { inspect: jest.fn().mockResolvedValue(blockedRemote) },
      finalPermissionAudit: { audit: jest.fn().mockResolvedValue({
        status: 'blocked', errors: ['Grant the required setup PAT access.'],
      }) },
    });
    const result = await new SetupWizardUseCase(deps).execute({
      mode: 'non-interactive',
      overrides: { pullRequestApproval: { mode: 'off' } },
      remoteTarget: { owner: 'owner', repository: 'repo', token: 'token' },
    });

    expect(result).toMatchObject({
      status: 'blocked', reason: 'setup-permissions-unavailable', exitCode: 1,
      configuration: expect.objectContaining({ repository: expect.any(Object) }),
      errors: ['Grant the required setup PAT access.'],
      remoteConfiguration: { ...blockedRemote, credentialHealthWorkflow: 'unavailable' },
    });
    expect(deps.planPresenter.present).not.toHaveBeenCalled();
    expect(deps.confirmation.confirm).not.toHaveBeenCalled();
  });

  it('does not disguise unexpected audit transport failures as an ordinary denied permission', async () => {
    const deps = dependencies({
      finalPermissionAudit: { audit: jest.fn().mockRejectedValue(new Error('provider transport unavailable')) },
    });
    await expect(new SetupWizardUseCase(deps).execute({
      mode: 'non-interactive', overrides: { pullRequestApproval: { mode: 'off' } },
    })).rejects.toThrow('provider transport unavailable');
    expect(deps.planPresenter.present).not.toHaveBeenCalled();
  });

  it('replaces provisional workflow status using the selected main branch before the final audit', async () => {
    const initial = { ...remote, credentialHealthWorkflow: 'installed' as const };
    const inspectCredentialHealthWorkflow = jest.fn().mockResolvedValue('missing');
    const deps = dependencies({ remoteConfiguration: {
      inspect: jest.fn().mockResolvedValue(initial), inspectCredentialHealthWorkflow,
    } });
    const result = await new SetupWizardUseCase(deps).execute({
      mode: 'non-interactive',
      overrides: { pullRequestApproval: { mode: 'off' }, repository: { mainBranch: 'release/main' } },
      remoteTarget: { owner: 'owner', repository: 'repo', token: 'token' },
    });

    expect(inspectCredentialHealthWorkflow).toHaveBeenCalledWith('owner', 'repo', 'token', 'release/main');
    expect(deps.finalPermissionAudit.audit).toHaveBeenCalledWith(
      expect.objectContaining({ repository: expect.objectContaining({ mainBranch: 'release/main' }) }),
      { ...initial, credentialHealthWorkflow: 'missing' },
    );
    expect(result.status === 'completed' && result.remoteConfiguration?.credentialHealthWorkflow).toBe('missing');
  });

  it('does not inherit default-branch presence when the selected-ref lookup fails', async () => {
    const initial = { ...remote, credentialHealthWorkflow: 'installed' as const };
    const deps = dependencies({ remoteConfiguration: {
      inspect: jest.fn().mockResolvedValue(initial),
      inspectCredentialHealthWorkflow: jest.fn().mockRejectedValue(new Error('private provider body')),
    } });
    const result = await new SetupWizardUseCase(deps).execute({
      mode: 'non-interactive', overrides: { pullRequestApproval: { mode: 'off' } },
      remoteTarget: { owner: 'owner', repository: 'repo', token: 'token' },
    });
    expect(deps.finalPermissionAudit.audit).toHaveBeenCalledWith(
      expect.anything(), { ...initial, credentialHealthWorkflow: 'unavailable' },
    );
    expect(JSON.stringify(result)).not.toContain('private provider body');
  });

  it('blocks unavailable required repository inventory inside the wizard boundary', async () => {
    const blockedRemote = { ...remote, repositoryVariablesAccess: 'unavailable' as const };
    const deps = dependencies({
      remoteConfiguration: { inspect: jest.fn().mockResolvedValue(blockedRemote) },
    });

    const result = await new SetupWizardUseCase(deps).execute({
      mode: 'non-interactive',
      overrides: { pullRequestApproval: { mode: 'off' } },
      skipRepositorySecrets: true,
      remoteTarget: { owner: 'owner', repository: 'repo', token: 'token' },
    });

    expect(result).toEqual(expect.objectContaining({
      status: 'blocked',
      reason: 'remote-storage-unavailable',
      exitCode: 1,
      errors: [expect.stringContaining('Repository Variable inventory is unavailable')],
      remoteConfiguration: { ...blockedRemote, credentialHealthWorkflow: 'unavailable' },
    }));
    expect(deps.finalPermissionAudit.audit).toHaveBeenCalledTimes(1);
    expect(deps.planPresenter.present).not.toHaveBeenCalled();
    expect(deps.confirmation.confirm).not.toHaveBeenCalled();
  });

  it.each(['rejected', 'missing'] as const)('maps %s pre-plan inspection to bounded unavailable facts before the final audit', async kind => {
    const collect = jest.fn(async state => createSetupReviewState(state.draft));
    const deps = dependencies({
      collector: { collect },
      ...(kind === 'rejected' ? { remoteConfiguration: {
        inspect: jest.fn().mockRejectedValue(new Error('sensitive provider body')),
      } } : {}),
    });
    const result = await new SetupWizardUseCase(deps).execute({
      mode: 'interactive', overrides: { pullRequestApproval: { mode: 'off' } },
      remoteTarget: { owner: 'owner', repository: 'repo', token: 'token' },
    });
    expect(result).toMatchObject({
      status: 'blocked', reason: 'remote-storage-unavailable', exitCode: 1,
      remoteConfiguration: { ownerType: 'Unknown', repositorySecretsAccess: 'unavailable',
        repositoryVariablesAccess: 'unavailable', credentialHealthWorkflow: 'unavailable' },
    });
    expect(collect).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      remote: expect.objectContaining({ repositoryVariablesAccess: 'unavailable' }),
    }), expect.objectContaining({ refresh: expect.any(Function) }));
    expect(deps.finalPermissionAudit.audit).toHaveBeenCalledTimes(1);
    expect(deps.planPresenter.present).not.toHaveBeenCalled();
    expect(deps.confirmation.confirm).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('sensitive provider body');
  });

  it('reports unknown ownership as an inspection failure, not as a personal repository', async () => {
    const result = await new SetupWizardUseCase(dependencies({
      remoteConfiguration: { inspect: jest.fn().mockRejectedValue(new Error('private provider body')) },
    })).execute({
      mode: 'non-interactive',
      overrides: { pullRequestApproval: { mode: 'off' }, storage: {
        variables: { defaultScope: 'organization', preserveExisting: false },
      } },
      remoteTarget: { owner: 'owner', repository: 'repo', token: 'token' },
    });
    expect(result).toMatchObject({ status: 'blocked',
      errors: expect.arrayContaining([expect.stringContaining('Repository ownership is unavailable')]) });
    expect(JSON.stringify(result)).not.toContain('private provider body');
  });

  it('blocks organization-only resources when repository shadow inventory is unavailable', async () => {
    const organizationOnlyRemote = { ...remote, repositoryVariablesAccess: 'unavailable' as const };
    const deps = dependencies({
      remoteConfiguration: { inspect: jest.fn().mockResolvedValue(organizationOnlyRemote) },
    });

    const result = await new SetupWizardUseCase(deps).execute({
      mode: 'non-interactive',
      overrides: {
        pullRequestApproval: { mode: 'off' },
        storage: { variables: { defaultScope: 'organization', preserveExisting: false } },
      },
      skipRepositorySecrets: true,
      remoteTarget: { owner: 'owner', repository: 'repo', token: 'token' },
    });

    expect(result).toMatchObject({ status: 'blocked', exitCode: 1,
      errors: expect.arrayContaining([expect.stringContaining('Repository Variable inventory is unavailable')]) });
    expect(deps.finalPermissionAudit.audit).toHaveBeenCalledTimes(1);
    expect(deps.planPresenter.present).not.toHaveBeenCalled();
    expect(deps.confirmation.confirm).not.toHaveBeenCalled();
  });
});
