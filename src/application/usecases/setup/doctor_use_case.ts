import type {
  DoctorCheck,
  DoctorReport,
  SetupConfiguration,
  SetupCredentialCheck,
  SetupCredentialRequirement,
  SetupRemoteConfiguration,
} from '../../../domain/setup';
import {
  buildSetupCredentialRequirements,
  buildSetupRepositoryVariables,
  getSetupResourceStoragePolicy,
  resolveSetupResourceScope,
  setupResourceExists,
  usesOrganizationStorage,
  validateSetupConfiguration,
} from '../../policies/setup_configuration_policy';
import {
  buildDoctorReport,
  doctorCheck,
  normalizedDoctorPathId,
  skippedDoctorCheck,
} from '../../policies/setup_doctor_report_policy';
import { runWithConcurrencyLimit } from '../../policies/bounded_concurrency_policy';
import type {
  SetupCredentialValidationPort,
  SetupMergeQueueReadinessPort,
  SetupRemoteConfigurationReadPort,
  SetupRemoteCredentialHealthPort,
} from '../../ports/setup_wizard_ports';
import type { SetupDoctorWorkspaceQueryPort } from '../../ports/setup_workspace_ports';

export interface DoctorRequest {
  owner: string;
  repository: string;
  setupToken: string;
  configuration: SetupConfiguration;
}

export interface SetupDoctorDependencies {
  validation: Pick<SetupCredentialValidationPort, 'validateSetupPat'>;
  workspace: SetupDoctorWorkspaceQueryPort;
  remoteConfiguration: SetupRemoteConfigurationReadPort;
  remoteHealth: SetupRemoteCredentialHealthPort;
  mergeQueueReadiness: SetupMergeQueueReadinessPort;
}

type RemoteResult =
  | { kind: 'configuration'; value: SetupRemoteConfiguration }
  | { kind: 'configuration-error' }
  | { kind: 'merge-queue'; value: readonly DoctorCheck[] }
  | { kind: 'merge-queue-error' };

export class SetupDoctorUseCase {
  constructor(private readonly dependencies: SetupDoctorDependencies) {}

  async execute(request: DoctorRequest): Promise<DoctorReport> {
    const configurationErrors = validateSetupConfiguration(request.configuration);
    const checks: DoctorCheck[] = [
      configurationCheck(configurationErrors),
      repositoryRootCheck(this.dependencies.workspace),
      ...workflowChecks(request.configuration, configurationErrors, this.dependencies.workspace),
    ];

    const pat = await this.validatePat(request);
    checks.push(pat);
    if (pat.status !== 'pass') {
      checks.push(...skippedRemoteChecks(request.configuration, pat.id));
      return buildDoctorReport(checks);
    }

    const remote = await runWithConcurrencyLimit<RemoteResult>([
      async () => {
        try {
          return {
            kind: 'configuration',
            value: await this.dependencies.remoteConfiguration.inspect(
              request.owner,
              request.repository,
              request.setupToken,
            ),
          };
        } catch {
          return { kind: 'configuration-error' };
        }
      },
      async () => {
        if (configurationErrors.length > 0) {
          return {
            kind: 'merge-queue',
            value: [skippedDoctorCheck(
              'github.merge-queue',
              ['configuration.valid'],
              'Merge-queue readiness was not inspected because setup configuration is invalid.',
              'Fix the reported configuration errors, then run doctor again.',
            )],
          };
        }
        try {
          return {
            kind: 'merge-queue',
            value: await this.dependencies.mergeQueueReadiness.inspect({
              owner: request.owner,
              repository: request.repository,
              token: request.setupToken,
              configuration: request.configuration,
            }),
          };
        } catch {
          return { kind: 'merge-queue-error' };
        }
      },
    ], 4);

    const remoteConfiguration = remote.find((result): result is Extract<RemoteResult, { kind: 'configuration' }> =>
      result.kind === 'configuration')?.value;
    const mergeQueueChecks = remote.find((result): result is Extract<RemoteResult, { kind: 'merge-queue' }> =>
      result.kind === 'merge-queue')?.value ?? [doctorCheck({
        id: 'github.merge-queue',
        status: 'fail',
        summary: 'Merge-queue readiness could not be inspected.',
        action: 'Check branch policy access and run doctor again.',
      })];
    if (!remoteConfiguration) {
      checks.push(remoteScopeFailure(request.configuration));
      checks.push(...mergeQueueChecks, ...skippedResourceChecks(request.configuration, 'github.resource-scopes'));
      return buildDoctorReport(checks);
    }

    checks.push(resourceScopeCheck(request.configuration, remoteConfiguration));
    checks.push(...mergeQueueChecks);
    checks.push(...variableChecks(request.configuration, remoteConfiguration));
    checks.push(secretNamesCheck(remoteConfiguration));
    checks.push(...await this.credentialChecks(request, remoteConfiguration));
    return buildDoctorReport(checks);
  }

  private async validatePat(request: DoctorRequest): Promise<DoctorCheck> {
    try {
      const result = await this.dependencies.validation.validateSetupPat(
        request.owner,
        request.repository,
        request.setupToken,
      );
      return doctorCheck({
        id: 'credentials.setup-pat',
        status: result.status === 'valid' ? 'pass' : 'fail',
        summary: result.message,
        ...(result.status === 'valid' ? {} : { action: 'Replace the setup PAT and run doctor again.' }),
        evidence: {
          credential: 'SETUP_PAT',
          ...(result.account ? { account: result.account } : {}),
        },
      });
    } catch {
      return doctorCheck({
        id: 'credentials.setup-pat',
        status: 'fail',
        summary: 'The setup PAT could not be validated.',
        action: 'Check the setup PAT and network access, then run doctor again.',
        evidence: { credential: 'SETUP_PAT' },
      });
    }
  }

  private async credentialChecks(
    request: DoctorRequest,
    remote: SetupRemoteConfiguration,
  ): Promise<DoctorCheck[]> {
    const requirements = buildSetupCredentialRequirements(request.configuration);
    const remoteSecrets = new Set([...remote.repositorySecrets, ...remote.organizationSecrets]);
    const present = requirements.filter((requirement) => remoteSecrets.has(requirement.name));
    let health: readonly SetupCredentialCheck[] | undefined;
    if (present.length > 0) {
      try {
        health = await this.dependencies.remoteHealth.validateExisting(
          request.owner,
          request.repository,
          request.setupToken,
          request.configuration.repository.mainBranch,
          present,
        );
      } catch {
        health = undefined;
      }
    }
    return buildCredentialChecks(requirements, remoteSecrets, health);
  }
}

function configurationCheck(errors: readonly string[]): DoctorCheck {
  return doctorCheck({
    id: 'configuration.valid',
    status: errors.length === 0 ? 'pass' : 'fail',
    summary: errors.length === 0
      ? 'Setup configuration is valid.'
      : `Setup configuration has ${errors.length} validation error(s).`,
    ...(errors.length === 0 ? {} : { action: 'Fix the setup configuration and run doctor again.' }),
    evidence: { errorCount: errors.length },
  });
}

function repositoryRootCheck(workspace: SetupDoctorWorkspaceQueryPort): DoctorCheck {
  try {
    const valid = workspace.isRepositoryRoot();
    return doctorCheck({
      id: 'workspace.repository-root',
      status: valid ? 'pass' : 'fail',
      summary: valid ? 'Current directory is the repository root.' : 'Current directory is not the repository root.',
      ...(valid ? {} : { action: 'Run doctor from the root of the target Git repository.' }),
    });
  } catch {
    return doctorCheck({
      id: 'workspace.repository-root',
      status: 'fail',
      summary: 'Repository root could not be verified.',
      action: 'Run doctor from the root of the target Git repository.',
    });
  }
}

function workflowChecks(
  configuration: SetupConfiguration,
  configurationErrors: readonly string[],
  workspace: SetupDoctorWorkspaceQueryPort,
): DoctorCheck[] {
  if (configurationErrors.length > 0) {
    return [skippedDoctorCheck(
      'workflow.comparison',
      ['configuration.valid'],
      'Workflow comparison was skipped because setup configuration is invalid.',
      'Fix setup configuration, then run doctor again.',
    )];
  }
  try {
    return [...workspace.compareWorkflows(configuration.features)]
      .sort((left, right) => left.destination.localeCompare(right.destination))
      .map((comparison) => doctorCheck({
        id: `workflow.${normalizedDoctorPathId(comparison.destination)}`,
        status: comparison.status === 'unchanged' ? 'pass' : 'fail',
        summary: comparison.status === 'unchanged'
          ? 'Matches the installed setup template.'
          : `Local workflow is ${comparison.status}.`,
        ...(comparison.status === 'unchanged' ? {} : { action: 'Run setup to repair this managed workflow.' }),
        evidence: { path: comparison.destination, state: comparison.status },
      }));
  } catch {
    return [doctorCheck({
      id: 'workflow.comparison',
      status: 'fail',
      summary: 'Managed workflows could not be compared.',
      action: 'Check local workflow files and run doctor again.',
    })];
  }
}

function remoteScopeFailure(configuration: SetupConfiguration): DoctorCheck {
  return doctorCheck({
    id: 'github.resource-scopes',
    status: usesOrganizationStorage(configuration) ? 'fail' : 'warn',
    summary: 'GitHub Actions resource scopes could not be inspected.',
    action: 'Check setup PAT access to repository and organization Actions metadata, then retry.',
  });
}

function resourceScopeCheck(configuration: SetupConfiguration, remote: SetupRemoteConfiguration): DoctorCheck {
  const unavailable = remote.organizationAccess === 'unavailable'
    || remote.organizationSecretsAccess === 'unavailable'
    || remote.organizationVariablesAccess === 'unavailable';
  const required = usesOrganizationStorage(configuration);
  const status = unavailable ? (required ? 'fail' : 'warn') : 'pass';
  return doctorCheck({
    id: 'github.resource-scopes',
    status,
    summary: status === 'pass'
      ? 'GitHub Actions resource scopes are readable.'
      : 'Some organization-level GitHub Actions resource scopes are unavailable.',
    ...(status === 'pass' ? {} : { action: 'Grant the setup PAT the required organization Actions metadata access.' }),
    evidence: {
      ownerType: remote.ownerType,
      repositoryVisibility: remote.repositoryVisibility,
      organizationAccess: remote.organizationAccess,
    },
  });
}

function variableChecks(configuration: SetupConfiguration, remote: SetupRemoteConfiguration): DoctorCheck[] {
  const remoteVariables = new Map<string, { value: string; source: 'repository' | 'organization' }>();
  for (const variable of remote.organizationVariables) remoteVariables.set(variable.name, { value: variable.value, source: 'organization' });
  for (const variable of remote.repositoryVariables) remoteVariables.set(variable.name, { value: variable.value, source: 'repository' });
  return buildSetupRepositoryVariables(configuration).map((variable) => {
    const observed = remoteVariables.get(variable.name);
    const state = setupResourceExists(remote, 'variable', variable.name);
    const policy = getSetupResourceStoragePolicy(configuration, 'variable');
    const preserveExisting = state.effective !== undefined
      && state.effective !== resolveSetupResourceScope(policy, variable.name)
      && !Object.prototype.hasOwnProperty.call(policy.overrides, variable.name)
      && policy.preserveExisting;
    const matches = observed?.value === variable.value;
    const status = !observed ? 'fail' : matches ? 'pass' : preserveExisting ? 'warn' : 'fail';
    return doctorCheck({
      id: `github.variables.${normalizedDoctorPathId(variable.name)}`,
      status,
      summary: !observed
        ? 'Variable is missing.'
        : matches
          ? `Variable is configured at ${observed.source} scope.`
          : preserveExisting
            ? `Variable differs but is intentionally preserved at ${observed.source} scope.`
            : 'Variable differs from the expected setup configuration.',
      ...(status === 'pass' || status === 'warn' ? {} : { action: 'Run setup to reconcile this Variable.' }),
      evidence: { name: variable.name, present: observed !== undefined, matches, ...(observed ? { scope: observed.source } : {}) },
    });
  });
}

function secretNamesCheck(remote: SetupRemoteConfiguration): DoctorCheck {
  return doctorCheck({
    id: 'github.secret-names',
    status: 'pass',
    summary: 'GitHub Actions Secret metadata is readable.',
    evidence: {
      repositorySecretCount: remote.repositorySecrets.length,
      organizationSecretCount: remote.organizationSecrets.length,
    },
  });
}

function buildCredentialChecks(
  requirements: readonly SetupCredentialRequirement[],
  remoteSecrets: ReadonlySet<string>,
  health: readonly SetupCredentialCheck[] | undefined,
): DoctorCheck[] {
  const healthByName = new Map((health ?? []).map((check) => [check.name, check]));
  const reportedGroups = new Set<string>();
  const checks: DoctorCheck[] = [];
  for (const requirement of requirements) {
    const group = requirement.alternativeGroups?.[0];
    if (group) {
      if (reportedGroups.has(group)) continue;
      reportedGroups.add(group);
      const groupRequirements = requirements.filter((candidate) => candidate.alternativeGroups?.includes(group));
      const available = groupRequirements.filter((candidate) => remoteSecrets.has(candidate.name));
      const runnerAllowed = groupRequirements.some((candidate) => candidate.runnerAuthenticationGroups?.includes(group));
      const healthy = available.some((candidate) => healthByName.get(candidate.name)?.status === 'valid');
      const invalid = available.length > 0 && available.every((candidate) => healthByName.get(candidate.name)?.status === 'invalid');
      const status = available.length === 0 ? (runnerAllowed ? 'warn' : 'fail') : healthy ? 'pass' : invalid ? 'fail' : 'warn';
      checks.push(doctorCheck({
        id: `credential.${normalizedDoctorPathId(group)}`,
        status,
        summary: available.length === 0
          ? runnerAllowed
            ? 'No fallback Secret is configured; runner authentication must satisfy this group.'
            : 'No alternative credential is present.'
          : healthy
            ? 'At least one alternative credential is healthy.'
            : invalid
              ? 'Every available alternative credential is invalid.'
              : 'An alternative credential is present, but remote health is unavailable.',
        ...(status === 'pass' ? {} : { action: 'Configure and validate one credential for this requirement group.' }),
        evidence: { group, availableCount: available.length, runnerAuthenticationAllowed: runnerAllowed },
      }));
      continue;
    }
    const present = remoteSecrets.has(requirement.name);
    const check = healthByName.get(requirement.name);
    const status = !present ? 'fail' : check?.status === 'valid' ? 'pass' : check?.status === 'invalid' ? 'fail' : 'warn';
    checks.push(doctorCheck({
      id: `credential.${normalizedDoctorPathId(requirement.name)}`,
      status,
      summary: !present ? 'Required Secret is missing.' : check?.message ?? 'Secret is present, but remote health is unavailable.',
      ...(status === 'pass' ? {} : { action: `Configure or replace ${requirement.name}, then rerun credential health.` }),
      evidence: { name: requirement.name, present },
    }));
  }
  return checks;
}

function skippedRemoteChecks(configuration: SetupConfiguration, blocker: string): DoctorCheck[] {
  return [
    skippedDoctorCheck('github.resource-scopes', [blocker], 'Resource-scope inspection requires a valid setup PAT.', 'Replace the setup PAT.'),
    skippedDoctorCheck('github.merge-queue', [blocker], 'Merge-queue inspection requires a valid setup PAT.', 'Replace the setup PAT.'),
    ...skippedResourceChecks(configuration, blocker),
  ];
}

function skippedResourceChecks(configuration: SetupConfiguration, blocker: string): DoctorCheck[] {
  return [
    skippedDoctorCheck('github.variables', [blocker], 'Variable checks could not run.', 'Resolve the blocking check and rerun doctor.'),
    skippedDoctorCheck('github.secret-names', [blocker], 'Secret metadata checks could not run.', 'Resolve the blocking check and rerun doctor.'),
    ...buildSetupCredentialRequirements(configuration).map((requirement) => skippedDoctorCheck(
      `credential.${normalizedDoctorPathId(requirement.alternativeGroups?.[0] ?? requirement.name)}`,
      [blocker],
      'Credential health could not run.',
      'Resolve the blocking check and rerun doctor.',
    )).filter((check, index, all) => all.findIndex((candidate) => candidate.id === check.id) === index),
  ];
}
