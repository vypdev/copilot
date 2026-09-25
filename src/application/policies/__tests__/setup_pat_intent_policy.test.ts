import { createDefaultSetupConfiguration } from '../setup_configuration_policy';
import { fixedSetupPatIntentQuestionIds, setupPatIntentNeedsOwnerKind, setupPatIntentOwnerConflict } from '../setup_pat_intent_policy';
import { buildSetupPatIntentPermissionRequirements, buildSetupPatIntentUncertainty } from '../setup_token_permission_policy';
import { buildSetupPatCreationUrl } from '../setup_pat_creation_url_policy';

const grants = (configuration: ReturnType<typeof createDefaultSetupConfiguration>, owner: 'Organization' | 'User') =>
  buildSetupPatIntentPermissionRequirements(configuration, owner).map(item => `${item.scope}:${item.permission}:${item.level}`);

describe('setup PAT permission intent', () => {
  it('turns selected local operations into exact repository and organization grants', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.projects.ids = 'PVT_example';
    configuration.storage.secrets.defaultScope = 'organization';
    expect(grants(configuration, 'Organization')).toEqual(expect.arrayContaining([
      'repository:Metadata:read', 'repository:Contents:write', 'repository:Secrets:write',
      'repository:Variables:write', 'repository:Issues:write', 'repository:Administration:read',
      'organization:Secrets:write', 'organization:Issue Types:write', 'organization:Projects:write',
    ]));
    expect(grants(configuration, 'Organization')).not.toContain('repository:Actions:write');
    expect(grants(configuration, 'Organization')).not.toContain('repository:Workflows:write');
  });

  it('reduces to metadata and contents read when all optional setup operations are off', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.createInitialTag = false;
    configuration.manageRepositorySecrets = false;
    configuration.manageRepositoryVariables = false;
    configuration.features.issues = false;
    configuration.features.release = false;
    configuration.features.hotfix = false;
    configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'off' };
    expect(grants(configuration, 'User')).toEqual(['repository:Metadata:read', 'repository:Contents:read']);
    expect(setupPatIntentNeedsOwnerKind(configuration)).toBe(false);
  });

  it('separates remote-only credential health and inherited inventory from required grants', () => {
    const configuration = createDefaultSetupConfiguration();
    const unknown = buildSetupPatIntentUncertainty(configuration, 'Organization');
    expect(unknown.join(' ')).toContain('Actions write');
    expect(unknown.join(' ')).toContain('Workflows write');
    expect(unknown.join(' ')).toContain('organization Secrets write');
    expect(unknown.join(' ')).toContain('organization Variables write');
    expect(grants(configuration, 'Organization')).not.toContain('repository:Actions:write');
    expect(grants(configuration, 'Organization')).not.toContain('organization:Secrets:write');
  });

  it('flags contradictory personal ownership and explicit organization targets', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.storage.variables.defaultScope = 'organization';
    expect(setupPatIntentOwnerConflict(configuration, 'User')).toBe(true);
    expect(setupPatIntentOwnerConflict(configuration, 'Organization')).toBe(false);
    configuration.storage.variables.defaultScope = 'repository';
    configuration.projects.ids = 'PVT_example';
    expect(setupPatIntentOwnerConflict(configuration, 'User')).toBe(true);
  });

  it('does not ask choices fixed by config or skip flags', () => {
    const fixed = fixedSetupPatIntentQuestionIds({
      features: { issues: false },
      issueWorkflows: { enabled: [] },
      storage: { variables: { defaultScope: 'organization' } },
      createInitialTag: false,
    }, true, true);
    expect(fixed).toEqual(expect.arrayContaining([
      'features.issues', 'issueWorkflows.enabled', 'storage.variables.defaultScope',
      'createInitialTag', 'manageRepositoryVariables', 'manageRepositorySecrets',
    ]));
  });

  it('projects the reviewed grants to documented URL parameters without selecting a repository', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.features.issues = false;
    configuration.features.release = false;
    configuration.features.hotfix = false;
    configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'off' };
    const requirements = buildSetupPatIntentPermissionRequirements(configuration, 'User');
    const url = new URL(buildSetupPatCreationUrl({ role: 'setup', owner: 'vypdev', repository: 'copilot', expiresIn: 1, requirements }));
    expect(Object.fromEntries(url.searchParams)).toEqual(expect.objectContaining({
      metadata: 'read', contents: 'write', secrets: 'write', actions_variables: 'write',
    }));
    expect(url.searchParams.has('issues')).toBe(false);
    expect(url.searchParams.has('repository')).toBe(false);
  });

  it('prefills the six grants in the reviewed organization example', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.createInitialTag = false;
    configuration.features.release = false;
    configuration.features.hotfix = false;
    configuration.issueWorkflows.enabled = ['feature'];
    configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'off' };
    const requirements = buildSetupPatIntentPermissionRequirements(configuration, 'Organization');
    expect(requirements.map(item => `${item.scope}:${item.permission}:${item.level}`)).toEqual([
      'repository:Metadata:read', 'repository:Contents:read', 'repository:Secrets:write',
      'repository:Variables:write', 'repository:Issues:write', 'organization:Issue Types:write',
    ]);
    const url = new URL(buildSetupPatCreationUrl({ role: 'setup', owner: 'vypdev', repository: 'copilot', expiresIn: 1, requirements }));
    expect(Object.fromEntries([...url.searchParams].filter(([key]) => !['name', 'description', 'target_name', 'expires_in'].includes(key)))).toEqual({
      actions_variables: 'write', contents: 'read', issue_types: 'write', issues: 'write', metadata: 'read', secrets: 'write',
    });
  });
});
