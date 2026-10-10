import type { SetupTokenPermissionRequirement } from '../../domain/setup_token_permissions';

export interface SetupPermissionSummary {
  readonly required: readonly string[];
  readonly conditionalCount: number;
}

/** A lossless required-grant view of the same requirements used for URL creation. */
export function summarizeSetupPermissions(
  requirements: readonly SetupTokenPermissionRequirement[],
): SetupPermissionSummary {
  return {
    required: requirements.filter(item => item.applicability === 'required')
      .map(item => `${item.permission} ${item.level} (${item.scope})`),
    conditionalCount: requirements.filter(item => item.applicability === 'conditional').length,
  };
}
