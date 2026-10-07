import type { SetupResourceScope, SetupRemoteConfiguration } from '../../domain/setup';
import type { SetupTokenPermissionRequirement } from '../../domain/setup_token_permissions';

export function managementPermissions(scope?: SetupResourceScope, ownerType?: SetupRemoteConfiguration['ownerType']): SetupTokenPermissionRequirement[] {
  const requirement = (permission: string, probe: SetupTokenPermissionRequirement['probe'], target: SetupResourceScope,
    level: 'read' | 'write'): SetupTokenPermissionRequirement => ({
    id: `setup:${target}:${probe}:${level}`, role: 'setup', scope: target, permission, probe, level,
    applicability: 'required', reason: scope ? 'Apply the one reviewed runtime setting.' : 'Read the installed configuration without changing it.',
  });
  if (scope) return [requirement('Metadata', 'metadata', 'repository', 'read'),
    ...(['repository', ...(ownerType === 'User' ? [] : ['organization'])] as SetupResourceScope[]).map(target => requirement('Variables', 'variables', target, target === scope ? 'write' : 'read'))];
  return [requirement('Metadata', 'metadata', 'repository', 'read'),
    ...(['repository', 'organization'] as const).flatMap(target => [requirement('Variables', 'variables', target, 'read'),
      requirement('Secrets', 'secrets', target, 'read')])];
}
