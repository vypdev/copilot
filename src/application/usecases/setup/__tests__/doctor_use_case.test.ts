import { SetupDoctorUseCase } from '../doctor_use_case';
import {
  buildSetupCredentialRequirements,
  buildSetupRepositoryVariables,
  createDefaultSetupConfiguration,
} from '../../../policies/setup_configuration_policy';
import type { SetupConfiguration, SetupRemoteConfiguration } from '../../../../domain/setup';

function completeRemote(configuration: SetupConfiguration): SetupRemoteConfiguration {
  return {
    ownerType: 'Organization',
    repositoryId: 42,
    repositoryVisibility: 'private',
    repositorySecrets: buildSetupCredentialRequirements(configuration).map((requirement) => requirement.name),
    organizationSecrets: [],
    repositoryVariables: buildSetupRepositoryVariables(configuration),
    organizationVariables: [],
    organizationAccess: 'available',
    organizationSecretsAccess: 'available',
    organizationVariablesAccess: 'available',
  };
}

function dependencies(configuration: SetupConfiguration, overrides: Record<string, unknown> = {}) {
  const required = buildSetupCredentialRequirements(configuration);
  return {
    validation: { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'valid', message: 'Valid.' }) },
    workspace: { isRepositoryRoot: jest.fn(() => true), compareWorkflows: jest.fn(() => []) },
    remoteConfiguration: { inspect: jest.fn().mockResolvedValue(completeRemote(configuration)) },
    remoteHealth: {
      validateExisting: jest.fn().mockResolvedValue(required.map((requirement) => ({
        name: requirement.name,
        status: 'valid',
        message: 'Healthy.',
      }))),
    },
    mergeQueueReadiness: { inspect: jest.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

describe('SetupDoctorUseCase', () => {
  it('continues local diagnosis and skips every remote dependant after PAT failure', async () => {
    const configuration = createDefaultSetupConfiguration();
    const deps = dependencies(configuration, {
      validation: { validateSetupPat: jest.fn().mockResolvedValue({ name: 'SETUP_PAT', status: 'invalid', message: 'Rejected.' }) },
      workspace: {
        isRepositoryRoot: jest.fn(() => true),
        compareWorkflows: jest.fn(() => [
          { file: 'release.yml', destination: '.github/workflows/release.yml', status: 'changed' },
        ]),
      },
    });
    const report = await new SetupDoctorUseCase(deps).execute(request(configuration));

    expect(report.healthy).toBe(false);
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'workflow.github-workflows-release-yml', status: 'fail' }),
      expect.objectContaining({ id: 'credentials.setup-pat', status: 'fail' }),
      expect.objectContaining({
        id: 'github.resource-scopes',
        status: 'skipped',
        blockedBy: ['credentials.setup-pat'],
      }),
    ]));
    expect(deps.remoteConfiguration.inspect).not.toHaveBeenCalled();
  });

  it('returns an ordered healthy report when all required facts match', async () => {
    const configuration = createDefaultSetupConfiguration();
    const report = await new SetupDoctorUseCase(dependencies(configuration)).execute(request(configuration));

    expect(report.healthy).toBe(true);
    expect(report.checks.slice(0, 4).map((check) => check.id)).toEqual([
      'configuration.valid',
      'workspace.repository-root',
      'credentials.setup-pat',
      'github.resource-scopes',
    ]);
    expect(report.totals.fail).toBe(0);
  });

  it('preserves an independent merge-queue result when resource inspection fails', async () => {
    const configuration = createDefaultSetupConfiguration();
    const queueCheck = {
      id: 'github.merge-queue.production',
      status: 'pass' as const,
      summary: 'Ready.',
      evidence: {},
      blockedBy: [],
    };
    const deps = dependencies(configuration, {
      remoteConfiguration: { inspect: jest.fn().mockRejectedValue(new Error('forbidden')) },
      mergeQueueReadiness: { inspect: jest.fn().mockResolvedValue([queueCheck]) },
    });
    const report = await new SetupDoctorUseCase(deps).execute(request(configuration));

    expect(report.checks).toEqual(expect.arrayContaining([
      queueCheck,
      expect.objectContaining({ id: 'github.resource-scopes', status: 'warn' }),
      expect.objectContaining({ id: 'github.variables', status: 'skipped' }),
    ]));
  });

  it('maps a merge-queue provider failure to one check without hiding resource checks', async () => {
    const configuration = createDefaultSetupConfiguration();
    const deps = dependencies(configuration, {
      mergeQueueReadiness: { inspect: jest.fn().mockRejectedValue(new Error('provider details')) },
    });
    const report = await new SetupDoctorUseCase(deps).execute(request(configuration));

    expect(report.checks.find((check) => check.id === 'github.merge-queue')).toEqual(expect.objectContaining({
      status: 'fail',
      summary: 'Merge-queue readiness could not be inspected.',
    }));
    expect(report.checks.some((check) => check.id.startsWith('github.variables.'))).toBe(true);
  });

  it('fails required organization access', async () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.storage.variables.defaultScope = 'organization';
    const unavailable = {
      ...completeRemote(configuration),
      organizationAccess: 'unavailable' as const,
      organizationVariablesAccess: 'unavailable' as const,
    };
    const report = await new SetupDoctorUseCase(dependencies(configuration, {
      remoteConfiguration: { inspect: jest.fn().mockResolvedValue(unavailable) },
    })).execute(request(configuration));

    expect(report.checks.find((check) => check.id === 'github.resource-scopes')?.status).toBe('fail');
    expect(report.healthy).toBe(false);
  });

  it('reports unavailable health as warnings rather than passes', async () => {
    const configuration = createDefaultSetupConfiguration();
    const report = await new SetupDoctorUseCase(dependencies(configuration, {
      remoteHealth: { validateExisting: jest.fn().mockRejectedValue(new Error('unavailable')) },
    })).execute(request(configuration));

    const credentials = report.checks.filter((check) => check.id.startsWith('credential.'));
    expect(credentials.some((check) => check.status === 'warn')).toBe(true);
    expect(credentials.every((check) => check.status !== 'pass')).toBe(true);
  });

  it('reports unchanged workflow comparisons as passing facts', async () => {
    const configuration = createDefaultSetupConfiguration();
    const report = await new SetupDoctorUseCase(dependencies(configuration, {
      workspace: {
        isRepositoryRoot: jest.fn(() => true),
        compareWorkflows: jest.fn(() => [
          { file: 'issue.yml', destination: '.github/workflows/issue.yml', status: 'unchanged' },
        ]),
      },
    })).execute(request(configuration));

    expect(report.checks.find((check) => check.id === 'workflow.github-workflows-issue-yml'))
      .toEqual(expect.objectContaining({ status: 'pass', summary: 'Matches the installed setup template.' }));
  });

  it('keeps declared report order when remote probes resolve out of order', async () => {
    const configuration = createDefaultSetupConfiguration();
    let releaseRemote!: (value: SetupRemoteConfiguration) => void;
    let releaseQueue!: (value: never[]) => void;
    const remotePromise = new Promise<SetupRemoteConfiguration>((resolve) => { releaseRemote = resolve; });
    const queuePromise = new Promise<never[]>((resolve) => { releaseQueue = resolve; });
    const deps = dependencies(configuration, {
      remoteConfiguration: { inspect: jest.fn(() => remotePromise) },
      mergeQueueReadiness: { inspect: jest.fn(() => queuePromise) },
    });
    const pending = new SetupDoctorUseCase(deps).execute(request(configuration));
    releaseQueue([]);
    releaseRemote(completeRemote(configuration));
    const report = await pending;

    expect(report.checks.findIndex((check) => check.id === 'github.resource-scopes'))
      .toBeLessThan(report.checks.findIndex((check) => check.id.startsWith('github.variables.')));
  });

  it('keeps independent root and PAT checks when configuration is invalid', async () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.repository.mainBranch = '';
    const deps = dependencies(configuration);
    const report = await new SetupDoctorUseCase(deps).execute(request(configuration));

    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'configuration.valid', status: 'fail' }),
      expect.objectContaining({ id: 'workflow.comparison', status: 'skipped', blockedBy: ['configuration.valid'] }),
      expect.objectContaining({ id: 'credentials.setup-pat', status: 'pass' }),
      expect.objectContaining({ id: 'github.merge-queue', status: 'skipped', blockedBy: ['configuration.valid'] }),
    ]));
    expect(deps.workspace.compareWorkflows).not.toHaveBeenCalled();
    expect(deps.remoteConfiguration.inspect).toHaveBeenCalled();
  });

  it('maps local probe exceptions and non-root workspaces to bounded failures', async () => {
    const configuration = createDefaultSetupConfiguration();
    const report = await new SetupDoctorUseCase(dependencies(configuration, {
      workspace: {
        isRepositoryRoot: jest.fn(() => false),
        compareWorkflows: jest.fn(() => { throw new Error('/private/path'); }),
      },
    })).execute(request(configuration));

    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'workspace.repository-root', status: 'fail' }),
      expect.objectContaining({ id: 'workflow.comparison', status: 'fail', summary: 'Managed workflows could not be compared.' }),
    ]));

    const thrownRoot = await new SetupDoctorUseCase(dependencies(configuration, {
      workspace: {
        isRepositoryRoot: jest.fn(() => { throw new Error('private'); }),
        compareWorkflows: jest.fn(() => []),
      },
    })).execute(request(configuration));
    expect(thrownRoot.checks.find((check) => check.id === 'workspace.repository-root')?.status).toBe('fail');
  });

  it('maps a thrown PAT validation to a safe failure', async () => {
    const configuration = createDefaultSetupConfiguration();
    const report = await new SetupDoctorUseCase(dependencies(configuration, {
      validation: { validateSetupPat: jest.fn().mockRejectedValue(new Error('github_pat_private')) },
    })).execute(request(configuration));

    expect(report.checks.find((check) => check.id === 'credentials.setup-pat')).toEqual(expect.objectContaining({
      status: 'fail',
      summary: 'The setup PAT could not be validated.',
    }));
    expect(JSON.stringify(report)).not.toContain('github_pat_private');
  });

  it('distinguishes missing, mismatched, and intentionally preserved variables', async () => {
    const configuration = createDefaultSetupConfiguration();
    const expected = buildSetupRepositoryVariables(configuration);
    const repositoryVariables = expected
      .filter((variable) => !['AGENT_PROVIDER', 'AGENT_MODEL'].includes(variable.name))
      .map((variable) => variable.name === 'MAIN_BRANCH' ? { ...variable, value: 'wrong' } : variable);
    const remote = {
      ...completeRemote(configuration),
      repositoryVariables,
      organizationVariables: [{ name: 'AGENT_PROVIDER', value: 'different' }],
    };
    const report = await new SetupDoctorUseCase(dependencies(configuration, {
      remoteConfiguration: { inspect: jest.fn().mockResolvedValue(remote) },
    })).execute(request(configuration));

    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'github.variables.agent-provider', status: 'warn' }),
      expect.objectContaining({ id: 'github.variables.agent-model', status: 'fail', summary: 'Variable is missing.' }),
      expect.objectContaining({ id: 'github.variables.main-branch', status: 'fail' }),
    ]));
  });

  it('does not invoke credential health when no required Secret is present', async () => {
    const configuration = createDefaultSetupConfiguration();
    for (const task of Object.values(configuration.agents)) task.provider = 'cursor';
    const remoteHealth = { validateExisting: jest.fn() };
    const report = await new SetupDoctorUseCase(dependencies(configuration, {
      remoteConfiguration: {
        inspect: jest.fn().mockResolvedValue({ ...completeRemote(configuration), repositorySecrets: [] }),
      },
      remoteHealth,
    })).execute(request(configuration));

    expect(remoteHealth.validateExisting).not.toHaveBeenCalled();
    expect(report.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'credential.pat', status: 'fail' }),
      expect.objectContaining({ id: 'credential.cursor-api-key', status: 'fail' }),
    ]));
  });

  it('fails every invalid alternative and a group with no allowed runner authentication', async () => {
    const configuration = createDefaultSetupConfiguration();
    for (const task of Object.values(configuration.agents)) task.provider = 'opencode';
    const requirements = buildSetupCredentialRequirements(configuration);
    const report = await new SetupDoctorUseCase(dependencies(configuration, {
      remoteConfiguration: { inspect: jest.fn().mockResolvedValue(completeRemote(configuration)) },
      remoteHealth: {
        validateExisting: jest.fn().mockResolvedValue(requirements.map((requirement) => ({
          name: requirement.name,
          status: 'invalid',
          message: 'Invalid.',
        }))),
      },
    })).execute(request(configuration));

    expect(report.checks.find((check) => check.id.startsWith('credential.agent-opencode-'))).toEqual(expect.objectContaining({
      status: 'fail',
      summary: 'Every available alternative credential is invalid.',
    }));
  });
});

function request(configuration: SetupConfiguration) {
  return { owner: 'owner', repository: 'repo', setupToken: 'token', configuration };
}
