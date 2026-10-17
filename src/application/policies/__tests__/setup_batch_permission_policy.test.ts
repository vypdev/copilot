import { buildSetupBatchPatPermissionRequirements, buildSetupOrganizationReusePermissionRequirements } from '../setup_token_permission_policy';
import { buildSetupPatCreationUrl } from '../setup_pat_creation_url_policy';
import { createDefaultSetupConfiguration } from '../setup_configuration_defaults';
import { buildSetupRepositoryVariables } from '../setup_configuration_plan';
import type { SetupRemoteConfiguration } from '../../../domain/setup';
const configuration = createDefaultSetupConfiguration();
const remote: SetupRemoteConfiguration = { ownerType: 'Organization', repositoryVisibility: 'private', repositoryId: 7,
  repositoryVariablesAccess: 'available', organizationVariablesAccess: 'available', repositorySecretsAccess: 'available',
  organizationSecretsAccess: 'available', organizationAccess: 'available', repositoryVariables: [],
  organizationVariables: buildSetupRepositoryVariables(configuration), repositorySecrets: [], organizationSecrets: ['PAT'] };
describe('batch setup operator permissions', () => {
  it('uses the real supported GitHub PAT query names for installation capabilities', () => {
    const requirements = buildSetupBatchPatPermissionRequirements(configuration, remote);
    const url = new URL(buildSetupPatCreationUrl({ role: 'setup', owner: 'acme', repository: 'repo', expiresIn: 1, requirements }));
    expect(url.searchParams.get('contents')).toBe('write');
    expect(url.searchParams.get('workflows')).toBe('write');
    expect(url.searchParams.get('pull_requests')).toBe('write');
    expect(url.searchParams.get('organization_secrets')).toBe('read');
    expect(url.searchParams.get('organization_actions_variables')).toBe('read');
    expect(requirements.find(row => row.permission === 'Contents')?.reason).toContain('installation');
  });
  it.each(['secret', 'variable'] as const)('requires a shared %s writer only for a reviewed additive grant', kind => {
    const requirements = buildSetupBatchPatPermissionRequirements(configuration, remote, [{ kind }]);
    expect(requirements.find(row => row.scope === 'organization' && row.permission === (kind === 'secret' ? 'Secrets' : 'Variables'))?.level).toBe('write');
    expect(requirements.find(row => row.scope === 'organization' && row.permission === (kind === 'secret' ? 'Variables' : 'Secrets'))?.level).toBe('read');
  });
  it('does not request Secret health reads when current-repository Secret handling is disabled', () => {
    const requirements = buildSetupOrganizationReusePermissionRequirements({ ...configuration, manageRepositorySecrets: false }, remote);
    expect(requirements.some(row => row.permission === 'Secrets' || row.permission === 'Actions')).toBe(false);
  });
  it('keeps read inventory requirements visible when Secret value management is disabled', () => {
    const requirements = buildSetupBatchPatPermissionRequirements({ ...configuration, manageRepositorySecrets: false }, remote);
    expect(requirements.filter(row => row.permission === 'Secrets').map(row => row.level)).toEqual(['read', 'read']);
  });
});
