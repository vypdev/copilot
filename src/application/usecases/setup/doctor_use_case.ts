import type {
  DoctorCheck,
  DoctorReport,
  SetupConfiguration,
  SetupCredentialCheck,
  SetupCredentialRequirement,
  SetupRemoteConfiguration,
} from '../../../domain/setup';
import { DEFAULT_REPOSITORY_LOCALE, resolveLocaleProfile } from '../../../domain/locale';
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
  buildLocaleDoctorChecks,
} from '../../policies/setup_doctor_report_policy';
import { runWithConcurrencyLimit } from '../../policies/bounded_concurrency_policy';
import type {
  SetupCredentialValidationPort,
  SetupMergeQueueReadinessPort,
  SetupRemoteConfigurationReadPort,
  SetupRemoteCredentialHealthPort,
} from '../../ports/setup_wizard_ports';
import type { SetupDoctorWorkspaceQueryPort } from '../../ports/setup_workspace_ports';
import type { MessageCatalogResolutionPort } from '../../ports/message_catalog_ports';
import {
  resolveSetupDoctorCatalog,
  type SetupDoctorMessageCatalog,
} from '../../policies/setup_doctor_message_catalog';

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
  catalogResolver?: MessageCatalogResolutionPort;
}

export interface SetupDoctorExecutionResult {
  readonly report: DoctorReport;
  readonly catalog: SetupDoctorMessageCatalog;
}

type RemoteResult =
  | { kind: 'configuration'; value: SetupRemoteConfiguration }
  | { kind: 'configuration-error' }
  | { kind: 'merge-queue'; value: readonly DoctorCheck[] }
  | { kind: 'merge-queue-error' };

export class SetupDoctorUseCase {
  constructor(private readonly dependencies: SetupDoctorDependencies) {}

  async execute(request: DoctorRequest): Promise<SetupDoctorExecutionResult> {
    const catalog = await resolveSetupDoctorCatalog(
      doctorCatalogLocale(request.configuration),
      request.configuration.agents.planner,
      this.dependencies.catalogResolver,
    );
    const configurationErrors = validateSetupConfiguration(request.configuration);
    const checks: DoctorCheck[] = [
      configurationCheck(configurationErrors, catalog),
      ...buildLocaleDoctorChecks(request.configuration, catalog),
      repositoryRootCheck(this.dependencies.workspace, catalog),
      ...workflowChecks(request.configuration, configurationErrors, this.dependencies.workspace, catalog),
    ];

    const pat = await this.validatePat(request, catalog);
    checks.push(pat);
    if (pat.status !== 'pass') {
      checks.push(...skippedRemoteChecks(request.configuration, pat.id, catalog));
      return { report: buildDoctorReport(checks), catalog };
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
              catalog.message('doctor.mergeQueue.skipped'),
              catalog.message('doctor.mergeQueue.skippedAction'),
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
              catalog,
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
        summary: catalog.message('doctor.mergeQueue.unverified'),
        action: catalog.message('doctor.mergeQueue.unverifiedAction'),
      })];
    if (!remoteConfiguration) {
      checks.push(remoteScopeFailure(request.configuration, catalog));
      checks.push(...mergeQueueChecks, ...skippedResourceChecks(request.configuration, 'github.resource-scopes', catalog));
      return { report: buildDoctorReport(checks), catalog };
    }

    checks.push(resourceScopeCheck(request.configuration, remoteConfiguration, catalog));
    checks.push(...mergeQueueChecks);
    checks.push(...(configurationErrors.length > 0
      ? [skippedDoctorCheck(
          'github.variables',
          ['configuration.valid'],
          catalog.message('doctor.skipped.variables'),
          catalog.message('doctor.skipped.resourceAction'),
        )]
      : variableChecks(request.configuration, remoteConfiguration, catalog)));
    checks.push(secretNamesCheck(remoteConfiguration, catalog));
    checks.push(...await this.credentialChecks(request, remoteConfiguration, catalog));
    return { report: buildDoctorReport(checks), catalog };
  }

  private async validatePat(
    request: DoctorRequest,
    catalog: SetupDoctorMessageCatalog,
  ): Promise<DoctorCheck> {
    try {
      const result = await this.dependencies.validation.validateSetupPat(
        request.owner,
        request.repository,
        request.setupToken,
      );
      return doctorCheck({
        id: 'credentials.setup-pat',
        status: result.status === 'valid' ? 'pass' : 'fail',
        summary: catalog.message(result.status === 'valid' ? 'doctor.setupPat.valid' : 'doctor.setupPat.invalid'),
        ...(result.status === 'valid' ? {} : { action: catalog.message('doctor.setupPat.replaceAction') }),
        evidence: {
          credential: 'SETUP_PAT',
          ...(result.account ? { account: result.account } : {}),
        },
      });
    } catch {
      return doctorCheck({
        id: 'credentials.setup-pat',
        status: 'fail',
        summary: catalog.message('doctor.setupPat.unverified'),
        action: catalog.message('doctor.setupPat.unverifiedAction'),
        evidence: { credential: 'SETUP_PAT' },
      });
    }
  }

  private async credentialChecks(
    request: DoctorRequest,
    remote: SetupRemoteConfiguration,
    catalog: SetupDoctorMessageCatalog,
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
    return buildCredentialChecks(requirements, remoteSecrets, health, catalog);
  }
}

function configurationCheck(
  errors: readonly string[],
  catalog: SetupDoctorMessageCatalog,
): DoctorCheck {
  return doctorCheck({
    id: 'configuration.valid',
    status: errors.length === 0 ? 'pass' : 'fail',
    summary: errors.length === 0
      ? catalog.message('doctor.configuration.valid')
      : catalog.message('doctor.configuration.invalid', { count: errors.length }),
    ...(errors.length === 0 ? {} : { action: catalog.message('doctor.configuration.action') }),
    evidence: { errorCount: errors.length },
  });
}

function repositoryRootCheck(
  workspace: SetupDoctorWorkspaceQueryPort,
  catalog: SetupDoctorMessageCatalog,
): DoctorCheck {
  try {
    const valid = workspace.isRepositoryRoot();
    return doctorCheck({
      id: 'workspace.repository-root',
      status: valid ? 'pass' : 'fail',
      summary: catalog.message(valid ? 'doctor.repositoryRoot.valid' : 'doctor.repositoryRoot.invalid'),
      ...(valid ? {} : { action: catalog.message('doctor.repositoryRoot.action') }),
    });
  } catch {
    return doctorCheck({
      id: 'workspace.repository-root',
      status: 'fail',
      summary: catalog.message('doctor.repositoryRoot.unverified'),
      action: catalog.message('doctor.repositoryRoot.action'),
    });
  }
}

function workflowChecks(
  configuration: SetupConfiguration,
  configurationErrors: readonly string[],
  workspace: SetupDoctorWorkspaceQueryPort,
  catalog: SetupDoctorMessageCatalog,
): DoctorCheck[] {
  if (configurationErrors.length > 0) {
    return [skippedDoctorCheck(
      'workflow.comparison',
      ['configuration.valid'],
      catalog.message('doctor.workflow.skipped'),
      catalog.message('doctor.workflow.configurationAction'),
    )];
  }
  try {
    return [...workspace.compareWorkflows(configuration.features)]
      .sort((left, right) => left.destination.localeCompare(right.destination))
      .map((comparison) => doctorCheck({
        id: `workflow.${normalizedDoctorPathId(comparison.destination)}`,
        status: comparison.status === 'unchanged' ? 'pass' : 'fail',
        summary: comparison.status === 'unchanged'
          ? catalog.message('doctor.workflow.matches')
          : catalog.message('doctor.workflow.drift', { state: comparison.status }),
        ...(comparison.status === 'unchanged' ? {} : { action: catalog.message('doctor.workflow.repairAction') }),
        evidence: { path: comparison.destination, state: comparison.status },
      }));
  } catch {
    return [doctorCheck({
      id: 'workflow.comparison',
      status: 'fail',
      summary: catalog.message('doctor.workflow.unverified'),
      action: catalog.message('doctor.workflow.unverifiedAction'),
    })];
  }
}

function remoteScopeFailure(
  configuration: SetupConfiguration,
  catalog: SetupDoctorMessageCatalog,
): DoctorCheck {
  return doctorCheck({
    id: 'github.resource-scopes',
    status: usesOrganizationStorage(configuration) ? 'fail' : 'warn',
    summary: catalog.message('doctor.scope.unverified'),
    action: catalog.message('doctor.scope.unverifiedAction'),
  });
}

function resourceScopeCheck(
  configuration: SetupConfiguration,
  remote: SetupRemoteConfiguration,
  catalog: SetupDoctorMessageCatalog,
): DoctorCheck {
  const unavailable = remote.organizationAccess === 'unavailable'
    || remote.organizationSecretsAccess === 'unavailable'
    || remote.organizationVariablesAccess === 'unavailable';
  const required = usesOrganizationStorage(configuration);
  const status = unavailable ? (required ? 'fail' : 'warn') : 'pass';
  return doctorCheck({
    id: 'github.resource-scopes',
    status,
    summary: catalog.message(status === 'pass' ? 'doctor.scope.readable' : 'doctor.scope.unavailable'),
    ...(status === 'pass' ? {} : { action: catalog.message('doctor.scope.grantAction') }),
    evidence: {
      ownerType: remote.ownerType,
      repositoryVisibility: remote.repositoryVisibility,
      organizationAccess: remote.organizationAccess,
    },
  });
}

function variableChecks(
  configuration: SetupConfiguration,
  remote: SetupRemoteConfiguration,
  catalog: SetupDoctorMessageCatalog,
): DoctorCheck[] {
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
        ? catalog.message('doctor.variable.missing')
        : matches
          ? catalog.message('doctor.variable.configured', { scope: observed.source })
          : preserveExisting
            ? catalog.message('doctor.variable.preserved', { scope: observed.source })
            : catalog.message('doctor.variable.different'),
      ...(status === 'pass' || status === 'warn' ? {} : { action: catalog.message('doctor.variable.action') }),
      evidence: { name: variable.name, present: observed !== undefined, matches, ...(observed ? { scope: observed.source } : {}) },
    });
  });
}

function secretNamesCheck(
  remote: SetupRemoteConfiguration,
  catalog: SetupDoctorMessageCatalog,
): DoctorCheck {
  return doctorCheck({
    id: 'github.secret-names',
    status: 'pass',
    summary: catalog.message('doctor.secretMetadata.readable'),
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
  catalog: SetupDoctorMessageCatalog,
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
        summary: catalog.message(available.length === 0
          ? runnerAllowed
            ? 'doctor.credential.group.runnerRequired'
            : 'doctor.credential.group.missing'
          : healthy
            ? 'doctor.credential.group.healthy'
            : invalid
              ? 'doctor.credential.group.invalid'
              : 'doctor.credential.group.unverified'),
        ...(status === 'pass' ? {} : { action: catalog.message('doctor.credential.group.action') }),
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
      summary: !present
        ? catalog.message('doctor.credential.missing')
        : catalog.message(check ? credentialHealthMessageId(check.status) : 'doctor.credential.unverified'),
      ...(status === 'pass' ? {} : {
        action: catalog.message('doctor.credential.action', { name: requirement.name }),
      }),
      evidence: { name: requirement.name, present },
    }));
  }
  return checks;
}

function skippedRemoteChecks(
  configuration: SetupConfiguration,
  blocker: string,
  catalog: SetupDoctorMessageCatalog,
): DoctorCheck[] {
  return [
    skippedDoctorCheck(
      'github.resource-scopes',
      [blocker],
      catalog.message('doctor.skipped.scope'),
      catalog.message('doctor.skipped.scopeAction'),
    ),
    skippedDoctorCheck(
      'github.merge-queue',
      [blocker],
      catalog.message('doctor.mergeQueue.skipped'),
      catalog.message('doctor.skipped.scopeAction'),
    ),
    ...skippedResourceChecks(configuration, blocker, catalog),
  ];
}

function skippedResourceChecks(
  configuration: SetupConfiguration,
  blocker: string,
  catalog: SetupDoctorMessageCatalog,
): DoctorCheck[] {
  return [
    skippedDoctorCheck(
      'github.variables',
      [blocker],
      catalog.message('doctor.skipped.variables'),
      catalog.message('doctor.skipped.resourceAction'),
    ),
    skippedDoctorCheck(
      'github.secret-names',
      [blocker],
      catalog.message('doctor.skipped.secrets'),
      catalog.message('doctor.skipped.resourceAction'),
    ),
    ...buildSetupCredentialRequirements(configuration).map((requirement) => skippedDoctorCheck(
      `credential.${normalizedDoctorPathId(requirement.alternativeGroups?.[0] ?? requirement.name)}`,
      [blocker],
      catalog.message('doctor.skipped.credentials'),
      catalog.message('doctor.skipped.resourceAction'),
    )).filter((check, index, all) => all.findIndex((candidate) => candidate.id === check.id) === index),
  ];
}

function credentialHealthMessageId(
  status: SetupCredentialCheck['status'],
): 'doctor.credential.valid' | 'doctor.credential.invalid' | 'doctor.credential.unverifiable' | 'doctor.credential.unverified' {
  if (status === 'valid') return 'doctor.credential.valid';
  if (status === 'invalid') return 'doctor.credential.invalid';
  if (status === 'unverifiable') return 'doctor.credential.unverifiable';
  return 'doctor.credential.unverified';
}

function doctorCatalogLocale(configuration: SetupConfiguration): string {
  try {
    return resolveLocaleProfile(
      configuration.repository.repositoryLocale,
      configuration.repository.issueLocale,
      configuration.repository.pullRequestLocale,
    ).repository;
  } catch {
    return DEFAULT_REPOSITORY_LOCALE;
  }
}
