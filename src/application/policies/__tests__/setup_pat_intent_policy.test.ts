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
      'organization:Secrets:write', 'organization:Issue Types:write', 'organization:Projects:read',
    ]));
    expect(buildSetupPatIntentPermissionRequirements(configuration, 'Organization')).toEqual(expect.arrayContaining([
      expect.objectContaining({ permission: 'Actions', level: 'write', applicability: 'conditional' }),
      expect.objectContaining({ permission: 'Workflows', level: 'write', applicability: 'conditional' }),
    ]));
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

  it('discloses prefilled health prerequisites while leaving inherited inventory unresolved', () => {
    const configuration = createDefaultSetupConfiguration();
    const unknown = buildSetupPatIntentUncertainty(configuration, 'Organization');
    expect(unknown.join(' ')).toContain('Actions write');
    expect(unknown.join(' ')).toContain('Workflows write');
    expect(unknown.join(' ')).toContain('organization Secrets write');
    expect(unknown.join(' ')).toContain('organization Variables write');
    expect(unknown.join(' ')).toContain('prefilled');
    expect(buildSetupPatIntentPermissionRequirements(configuration, 'Organization').filter(item => item.applicability === 'required'))
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ permission: 'Actions', level: 'write' })]));
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
    }, true, true);
    expect(fixed).toEqual(expect.arrayContaining([
      'features.issues', 'issueWorkflows.enabled', 'storage.variables.defaultScope',
      'manageRepositoryVariables', 'manageRepositorySecrets',
    ]));
  });

  it('records explicit release and hotfix feature overrides as fixed intent inputs', () => {
    expect(fixedSetupPatIntentQuestionIds({ features: { release: false, hotfix: true } }, false, false))
      .toEqual(expect.arrayContaining(['features.release', 'features.hotfix']));
  });

  it('recognizes fixed approval, Projects, and preservation values without treating defaults as fixed', () => {
    expect(fixedSetupPatIntentQuestionIds({}, false, false)).toEqual([]);
    expect(fixedSetupPatIntentQuestionIds({
      pullRequestApproval: { mode: 'off' }, projects: { ids: '' },
      storage: { secrets: { preserveExisting: false }, variables: { preserveExisting: true } },
    }, false, false)).toEqual(expect.arrayContaining([
      'pullRequestApproval.mode', 'projects.enabled', 'projects.ids',
      'storage.secrets.preserveExisting', 'storage.variables.preserveExisting',
    ]));
  });

  it('asks owner kind for possible inherited resources even with no definite organization grant', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.features.issues = false;
    configuration.features.release = false;
    configuration.features.hotfix = false;
    configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'off' };
    expect(grants(configuration, 'Organization').some(item => item.startsWith('organization:'))).toBe(false);
    expect(setupPatIntentNeedsOwnerKind(configuration)).toBe(true);
    configuration.manageRepositorySecrets = false;
    expect(setupPatIntentNeedsOwnerKind(configuration)).toBe(true);
    configuration.storage.variables.preserveExisting = false;
    expect(setupPatIntentNeedsOwnerKind(configuration)).toBe(false);
    configuration.storage.variables.preserveExisting = true;
    configuration.manageRepositoryVariables = false;
    expect(setupPatIntentNeedsOwnerKind(configuration)).toBe(false);
  });

  it('asks owner kind for Projects even when all other organization grants are disabled', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.createInitialTag = false;
    configuration.features.issues = false;
    configuration.features.release = false;
    configuration.features.hotfix = false;
    configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'off' };
    configuration.manageRepositorySecrets = false;
    configuration.manageRepositoryVariables = false;
    configuration.projects.ids = 'PVT_example';

    expect(grants(configuration, 'Organization').filter(item => item.startsWith('organization:')))
      .toEqual(['organization:Projects:read']);
    expect(setupPatIntentNeedsOwnerKind(configuration)).toBe(true);
    expect(setupPatIntentOwnerConflict(configuration, 'User')).toBe(true);
    expect(setupPatIntentOwnerConflict(configuration, 'Organization')).toBe(false);

    configuration.projects.ids = '   ';
    expect(setupPatIntentNeedsOwnerKind(configuration)).toBe(false);
  });

  it('omits unresolved remote conditions when management is disabled or owner is personal', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.manageRepositorySecrets = false;
    expect(buildSetupPatIntentUncertainty(configuration, 'User')).toEqual([]);
    expect(buildSetupPatIntentUncertainty(configuration, 'Organization')).toEqual([
      expect.stringContaining('organization Variables write'),
    ]);
    configuration.manageRepositoryVariables = false;
    expect(buildSetupPatIntentUncertainty(configuration, 'Organization')).toEqual([]);
  });

  it('does not predict organization inventory for explicitly organization-scoped defaults', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.storage.secrets.defaultScope = 'organization';
    configuration.storage.variables.preserveExisting = false;
    expect(buildSetupPatIntentUncertainty(configuration, 'Organization')).toEqual([
      expect.stringContaining('Actions write'),
    ]);
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
      metadata: 'read', contents: 'read', secrets: 'write', actions_variables: 'write',
    }));
    expect(url.searchParams.has('issues')).toBe(false);
    expect(url.searchParams.has('repository')).toBe(false);
  });

  it('prefills the eight grants in the reviewed organization example including health prerequisites', () => {
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
      'repository:Contents:write', 'repository:Actions:write', 'repository:Workflows:write',
    ]);
    const url = new URL(buildSetupPatCreationUrl({ role: 'setup', owner: 'vypdev', repository: 'copilot', expiresIn: 1,
      requirements, includeConditionalSetupGrants: true }));
    expect(Object.fromEntries([...url.searchParams].filter(([key]) => !['name', 'description', 'target_name', 'expires_in'].includes(key)))).toEqual({
      actions: 'write', actions_variables: 'write', contents: 'write', issue_types: 'write', issues: 'write',
      metadata: 'read', secrets: 'write', workflows: 'write',
    });
  });

  it('keeps approval-only Actions at read and omits health writes when Secret management is disabled', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'recommend' };
    configuration.manageRepositorySecrets = false;
    configuration.features.release = false;
    configuration.features.hotfix = false;
    const requirements = buildSetupPatIntentPermissionRequirements(configuration, 'User');
    const url = new URL(buildSetupPatCreationUrl({ role: 'setup', owner: 'owner', repository: 'repo', expiresIn: 1,
      requirements, includeConditionalSetupGrants: true }));
    expect(url.searchParams.get('actions')).toBe('read');
    expect(url.searchParams.get('contents')).toBe('read');
    expect(url.searchParams.has('workflows')).toBe(false);
    expect(requirements.some(item => item.applicability === 'conditional')).toBe(false);
  });

  it('gives local reads and conditional writes distinct identities without duplicating required Contents write', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'recommend' };
    const requirements = buildSetupPatIntentPermissionRequirements(configuration, 'User');
    expect(new Set(requirements.map(item => item.id)).size).toBe(requirements.length);
    expect(requirements.filter(item => item.permission === 'Contents')).toEqual([
      expect.objectContaining({ level: 'write', applicability: 'required' }),
    ]);
    expect(requirements.filter(item => item.permission === 'Actions')).toEqual([
      expect.objectContaining({ level: 'read', applicability: 'required' }),
      expect.objectContaining({ level: 'write', applicability: 'conditional' }),
    ]);
  });
});
