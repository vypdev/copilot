import type { SetupConfiguration } from '../../domain/setup';
import type { SetupConfigurationOverrides } from './setup_configuration_policy';
import { buildSetupPatIntentPermissionRequirements } from './setup_token_permission_policy';

/** Local inputs with explicit precedence are decisions, not questions. */
export function fixedSetupPatIntentQuestionIds(
  overrides: SetupConfigurationOverrides,
  skipVariables: boolean,
  skipSecrets: boolean,
): string[] {
  const fixed: string[] = [];
  for (const feature of ['issues', 'pullRequests'] as const) {
    if (overrides.features?.[feature] !== undefined) fixed.push(`features.${feature}`);
  }
  if (overrides.issueWorkflows?.enabled !== undefined) fixed.push('issueWorkflows.enabled');
  if (overrides.pullRequestApproval?.mode !== undefined) fixed.push('pullRequestApproval.mode');
  if (overrides.projects?.ids !== undefined) fixed.push('projects.ids');
  if (overrides.createInitialTag !== undefined) fixed.push('createInitialTag');
  if (skipVariables || overrides.manageRepositoryVariables !== undefined) fixed.push('manageRepositoryVariables');
  if (skipSecrets || overrides.manageRepositorySecrets !== undefined) fixed.push('manageRepositorySecrets');
  for (const kind of ['variables', 'secrets'] as const) {
    if (overrides.storage?.[kind]?.defaultScope !== undefined) fixed.push(`storage.${kind}.defaultScope`);
    if (overrides.storage?.[kind]?.preserveExisting !== undefined) fixed.push(`storage.${kind}.preserveExisting`);
  }
  return fixed;
}

export function setupPatIntentNeedsOwnerKind(configuration: Readonly<SetupConfiguration>): boolean {
  return buildSetupPatIntentPermissionRequirements(configuration, 'Organization')
    .some(requirement => requirement.scope === 'organization')
    || (configuration.manageRepositorySecrets && configuration.storage.secrets.preserveExisting)
    || (configuration.manageRepositoryVariables && configuration.storage.variables.preserveExisting);
}

export function setupPatIntentOwnerConflict(configuration: Readonly<SetupConfiguration>, ownerKind: 'Organization' | 'User'): boolean {
  return ownerKind === 'User' && (
    (configuration.manageRepositorySecrets && (
      configuration.storage.secrets.defaultScope === 'organization'
      || Object.values(configuration.storage.secrets.overrides).includes('organization')
    ))
    || (configuration.manageRepositoryVariables && (
      configuration.storage.variables.defaultScope === 'organization'
      || Object.values(configuration.storage.variables.overrides).includes('organization')
    ))
    || configuration.projects.ids.trim().length > 0
  );
}
