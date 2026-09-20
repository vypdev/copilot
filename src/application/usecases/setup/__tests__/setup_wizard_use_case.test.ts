import { SetupWizardUseCase } from '../setup_wizard_use_case';
import {
  buildSetupCredentialRequirements,
  buildSetupRepositoryVariables,
  createDefaultSetupConfiguration,
} from '../../../policies/setup_configuration_policy';
import { createSetupReviewState } from '../../../policies/setup_questionnaire_policy';

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
    ...overrides,
  };
}

describe('SetupWizardUseCase', () => {
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

    expect(result).toEqual(expect.objectContaining({ status: 'completed', remoteConfiguration: remote }));
    expect(inspect).toHaveBeenCalledWith('owner', 'repo', 'token');
    expect(collect).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      remote,
      variableNames: buildSetupRepositoryVariables(createDefaultSetupConfiguration()).map((item) => item.name),
      secretNames: buildSetupCredentialRequirements(createDefaultSetupConfiguration()).map((item) => item.name),
    }));
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
    const deps = dependencies({ mergeQueueReadiness: readiness });
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
      errors: [expect.stringContaining('organization variables')],
      remoteConfiguration: blockedRemote,
    }));
    expect(deps.planPresenter.present).not.toHaveBeenCalled();
    expect(deps.confirmation.confirm).not.toHaveBeenCalled();
  });
});
