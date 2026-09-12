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
  repositoryVariables: [] as { name: string; value: string }[],
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
  it('validates, previews, confirms, and returns an isolated non-interactive configuration', async () => {
    const deps = dependencies();
    const result = await new SetupWizardUseCase(deps).execute({ mode: 'non-interactive' });

    expect(result).toEqual(expect.objectContaining({ status: 'completed', exitCode: 0 }));
    expect(deps.planPresenter.present).toHaveBeenCalledTimes(1);
    expect(deps.confirmation.confirm).toHaveBeenCalledTimes(1);
    if (result.status === 'completed') {
      const defaults = createDefaultSetupConfiguration();
      expect(result.configuration).toEqual(defaults);
      expect(result.configuration).not.toBe(defaults);
      expect(result.configuration.agents).not.toBe(defaults.agents);
    }
  });

  it('enforces explicit skip flags after merging overrides', async () => {
    const result = await new SetupWizardUseCase(dependencies()).execute({
      mode: 'non-interactive',
      overrides: { manageRepositoryVariables: true, manageRepositorySecrets: true },
      skipRepositoryVariables: true,
      skipRepositorySecrets: true,
    });

    expect(result.status === 'completed' && result.configuration.manageRepositoryVariables).toBe(false);
    expect(result.status === 'completed' && result.configuration.manageRepositorySecrets).toBe(false);
  });

  it('returns exit zero and no configuration when confirmation is declined', async () => {
    const result = await new SetupWizardUseCase(dependencies({
      confirmation: { confirm: jest.fn().mockResolvedValue({ kind: 'declined' }) },
    })).execute({ mode: 'non-interactive' });

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
    })).execute({ mode: 'non-interactive' });

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
      remoteTarget: { owner: 'owner', repository: 'repo', token: 'token' },
    });

    expect(readiness.inspect).toHaveBeenCalledWith(expect.objectContaining({ owner: 'owner', repository: 'repo' }));
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
});
