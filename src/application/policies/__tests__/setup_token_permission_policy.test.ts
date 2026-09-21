import { createDefaultSetupConfiguration } from '../setup_configuration_policy';
import {
    buildConfiguredSetupPatPermissionRequirements,
    buildSetupPatPermissionRequirements,
    buildWorkflowPatPermissionRequirements,
    normalizePermissionRequirements,
} from '../setup_token_permission_policy';
import type { SetupRemoteConfiguration } from '../../../domain/setup';
import type { SetupTokenPermissionRequirement } from '../../../domain/setup_token_permissions';

const organization: SetupRemoteConfiguration = {
    ownerType: 'Organization', repositoryId: 42, repositoryVisibility: 'private',
    repositorySecrets: [], repositorySecretsAccess: 'available', organizationSecrets: [],
    repositoryVariables: [], repositoryVariablesAccess: 'available', organizationVariables: [],
    organizationAccess: 'available', organizationSecretsAccess: 'available', organizationVariablesAccess: 'available',
};

function disabledRuntimeConfiguration() {
    const configuration = createDefaultSetupConfiguration();
    for (const feature of Object.keys(configuration.features)) configuration.features[feature] = false;
    configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'off' };
    return configuration;
}

describe('setup token permission policy', () => {
    it('describes the complete setup PAT permission catalog before the prompt', () => {
        const requirements = buildSetupPatPermissionRequirements();
        expect(requirements.map(item => `${item.scope}:${item.permission}:${item.level}`)).toEqual([
            'repository:Metadata:read', 'repository:Contents:read', 'repository:Secrets:write',
            'repository:Variables:write', 'repository:Issues:write', 'repository:Actions:write',
            'repository:Administration:read', 'repository:Workflows:write',
            'organization:Secrets:write', 'organization:Variables:write',
            'organization:Issue Types:write', 'organization:Projects:write',
        ]);
    });

    it('marks bootstrap repository inspection permissions as required', () => {
        const requirements = buildSetupPatPermissionRequirements();
        expect(requirements.filter(item => item.applicability === 'required').map(item => item.permission)).toEqual([
            'Metadata', 'Contents',
        ]);
    });

    it('keeps feature-dependent setup grants conditional with visible conditions', () => {
        const administration = buildSetupPatPermissionRequirements().find(item => item.permission === 'Administration');
        expect(administration).toMatchObject({ applicability: 'conditional', condition: expect.stringContaining('Release') });
    });

    it('recomputes only repository setup mutations selected by the approved configuration', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.createInitialTag = false;
        configuration.manageRepositorySecrets = false;
        configuration.issueWorkflows.enabled = [];
        configuration.features.release = false;
        configuration.features.hotfix = false;
        configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'off' };

        expect(buildConfiguredSetupPatPermissionRequirements(configuration, {
            ...organization,
            ownerType: 'User',
        }).map(item => `${item.scope}:${item.permission}:${item.level}`)).toEqual([
            'repository:Metadata:read',
            'repository:Contents:read',
            'repository:Variables:write',
        ]);
    });

    it('omits managed resource grants and resolves issue-driven administration without remote facts', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.manageRepositorySecrets = false;
        configuration.manageRepositoryVariables = false;
        configuration.createInitialTag = false;
        configuration.features.release = false;
        configuration.features.hotfix = false;
        configuration.issueWorkflows.enabled = ['release'];

        const permissions = buildConfiguredSetupPatPermissionRequirements(configuration);

        expect(permissions.map(item => item.permission)).toEqual([
            'Metadata', 'Contents', 'Issues', 'Administration',
        ]);

        configuration.issueWorkflows.enabled = ['hotfix'];
        expect(buildConfiguredSetupPatPermissionRequirements(configuration)
            .some(item => item.permission === 'Administration')).toBe(true);
    });

    it('detects repository credential health and selected organization Projects in the final setup plan', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.projects.ids = 'PVT_kwDOExample';
        const configuredRemote = {
            ...organization,
            repositorySecrets: ['PAT'],
            credentialHealthWorkflow: 'missing' as const,
        };

        const permissions = buildConfiguredSetupPatPermissionRequirements(configuration, configuredRemote)
            .map(item => `${item.scope}:${item.permission}:${item.level}`);

        expect(permissions).toEqual(expect.arrayContaining([
            'repository:Actions:write',
            'repository:Workflows:write',
            'organization:Projects:write',
        ]));
    });

    it('omits bootstrap-only workflow writes when credential health is already installed', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.createInitialTag = false;
        const configuredRemote = {
            ...organization,
            repositorySecrets: ['PAT'],
            credentialHealthWorkflow: 'installed' as const,
        };

        const permissions = buildConfiguredSetupPatPermissionRequirements(configuration, configuredRemote)
            .map(item => `${item.permission}:${item.level}`);

        expect(permissions).toContain('Actions:write');
        expect(permissions).not.toContain('Contents:write');
        expect(permissions).not.toContain('Workflows:write');
    });

    it.each(['unavailable', 'unknown'] as const)('never requests bootstrap mutation grants for %s workflow status', state => {
        const configuration = createDefaultSetupConfiguration();
        configuration.createInitialTag = false;
        const permissions = buildConfiguredSetupPatPermissionRequirements(configuration, {
            ...organization, repositorySecrets: ['PAT'], credentialHealthWorkflow: state,
        }).map(item => `${item.permission}:${item.level}`);
        expect(permissions).toContain('Actions:write');
        expect(permissions).not.toContain('Contents:write');
        expect(permissions).not.toContain('Workflows:write');
    });

    it('includes organization-only storage without unrelated repository grants when preservation is disabled', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.storage.secrets.defaultScope = 'organization';
        configuration.storage.secrets.preserveExisting = false;
        configuration.storage.variables.defaultScope = 'organization';
        configuration.storage.variables.preserveExisting = false;
        const configuredRemote = {
            ...organization,
            organizationSecrets: ['PAT'],
            credentialHealthWorkflow: 'missing' as const,
        };

        const permissions = buildConfiguredSetupPatPermissionRequirements(configuration, configuredRemote)
            .map(item => `${item.scope}:${item.permission}:${item.level}`);

        expect(permissions).toEqual(expect.arrayContaining([
            'repository:Actions:write',
            'repository:Contents:write',
            'repository:Workflows:write',
            'organization:Secrets:write',
            'organization:Variables:write',
            'organization:Issue Types:write',
        ]));
        expect(permissions).not.toEqual(expect.arrayContaining([
            'repository:Secrets:write',
            'repository:Variables:write',
        ]));
    });

    it('retains repository inventory grants when organization defaults preserve existing resources', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.storage.secrets.defaultScope = 'organization';
        configuration.storage.variables.defaultScope = 'organization';

        const permissions = buildConfiguredSetupPatPermissionRequirements(configuration, organization)
            .map(item => `${item.scope}:${item.permission}:${item.level}`);

        expect(permissions).toEqual(expect.arrayContaining([
            'repository:Secrets:write',
            'repository:Variables:write',
            'organization:Secrets:write',
            'organization:Variables:write',
        ]));
    });

    it('includes organization inventory grants when repository defaults preserve existing resources', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.storage.secrets.defaultScope = 'repository';
        configuration.storage.variables.defaultScope = 'repository';
        const configuredRemote = {
            ...organization,
            repositoryVariables: [{ name: 'EXISTING_REPOSITORY_VARIABLE', value: 'kept' }],
        };

        const permissions = buildConfiguredSetupPatPermissionRequirements(configuration, configuredRemote)
            .map(item => `${item.scope}:${item.permission}:${item.level}`);

        expect(permissions).toEqual(expect.arrayContaining([
            'repository:Secrets:write',
            'repository:Variables:write',
            'organization:Secrets:write',
            'organization:Variables:write',
        ]));
    });

    it('keeps only Actions read for queue safety without a dispatch capability', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.features.release = false;
        configuration.features.hotfix = false;
        configuration.issueWorkflows.enabled = ['help'];
        configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'off' };
        configuration.projects.ids = '';
        expect(buildWorkflowPatPermissionRequirements(configuration).map(item => item.permission)).toEqual([
            'Metadata', 'Actions', 'Contents', 'Issues', 'Pull requests',
        ]);
        expect(buildWorkflowPatPermissionRequirements(configuration)
            .find(item => item.permission === 'Actions')?.level).toBe('read');
    });

    it('keeps only Metadata when all runtime routes are disabled despite stale issue and project selections', () => {
        const configuration = disabledRuntimeConfiguration();
        configuration.projects.ids = 'PVT_kwDOExample';
        expect(buildWorkflowPatPermissionRequirements(configuration, organization)
            .map(item => `${item.scope}:${item.permission}:${item.level}`)).toEqual([
            'repository:Metadata:read',
        ]);
    });

    it.each([
        ['managed issues', 'issues', ['Metadata', 'Actions', 'Contents', 'Issues']],
        ['issue comments', 'issueComments', ['Metadata', 'Actions', 'Contents', 'Issues', 'Pull requests']],
        ['pull requests', 'pullRequests', ['Metadata', 'Actions', 'Pull requests']],
        ['PR comments', 'pullRequestComments', ['Metadata', 'Actions', 'Contents', 'Pull requests']],
        ['commit progress and Bugbot', 'commits', ['Metadata', 'Actions', 'Issues', 'Pull requests']],
        ['release dispatch', 'release', ['Metadata', 'Actions', 'Contents', 'Issues', 'Pull requests', 'Administration']],
        ['inactive issue closure', 'inactiveIssueClosure', ['Metadata', 'Actions', 'Issues']],
    ] as const)('projects only the writes consumed by %s', (_label, feature, expected) => {
        const configuration = disabledRuntimeConfiguration();
        configuration.issueWorkflows.enabled = ['help'];
        configuration.features[feature] = true;
        const requirements = buildWorkflowPatPermissionRequirements(configuration);
        expect(requirements.map(item => item.permission)).toEqual(expected);
        expect(requirements.find(item => item.permission === 'Actions')?.level)
            .toBe(feature === 'release' ? 'write' : 'read');
    });

    it('does not require Contents write for issue automation with managed branches disabled', () => {
        const configuration = disabledRuntimeConfiguration();
        configuration.features.issues = true;
        configuration.repository.issueManagedBranches = false;
        configuration.issueWorkflows.enabled = ['help'];
        expect(buildWorkflowPatPermissionRequirements(configuration).map(item => item.permission)).toEqual([
            'Metadata', 'Actions', 'Issues',
        ]);
    });

    it('retains shared write grants when one of several consuming routes is disabled', () => {
        const configuration = disabledRuntimeConfiguration();
        configuration.features.issueComments = true;
        configuration.features.pullRequestComments = true;
        configuration.features.issueComments = false;
        expect(buildWorkflowPatPermissionRequirements(configuration).map(item => item.permission)).toEqual([
            'Metadata', 'Actions', 'Contents', 'Pull requests',
        ]);
    });

    it('adds guarded approval PR writes without unrelated Actions, Contents, or Issues writes', () => {
        const configuration = disabledRuntimeConfiguration();
        configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'guarded' };
        expect(buildWorkflowPatPermissionRequirements(configuration).map(item => item.permission)).toEqual([
            'Metadata', 'Actions', 'Pull requests', 'Administration', 'Checks', 'Variables',
        ]);
    });

    it('adds Administration read for release or hotfix automation', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'off' };
        const requirement = buildWorkflowPatPermissionRequirements(configuration)
            .find(item => item.permission === 'Administration');
        expect(requirement).toMatchObject({ level: 'read', scope: 'repository' });
    });

    it('derives Administration read from hotfix and issue-workflow choices independently', () => {
        const hotfixConfiguration = createDefaultSetupConfiguration();
        hotfixConfiguration.features.release = false;
        hotfixConfiguration.features.hotfix = true;
        hotfixConfiguration.issueWorkflows.enabled = ['help'];
        hotfixConfiguration.pullRequestApproval = { ...hotfixConfiguration.pullRequestApproval, mode: 'off' };
        expect(buildWorkflowPatPermissionRequirements(hotfixConfiguration)
            .some(item => item.permission === 'Administration')).toBe(true);

        const issueConfiguration = createDefaultSetupConfiguration();
        issueConfiguration.features.release = false;
        issueConfiguration.features.hotfix = false;
        issueConfiguration.issueWorkflows.enabled = ['hotfix'];
        issueConfiguration.pullRequestApproval = { ...issueConfiguration.pullRequestApproval, mode: 'off' };
        expect(buildWorkflowPatPermissionRequirements(issueConfiguration)
            .some(item => item.permission === 'Administration')).toBe(true);
    });

    it('adds Checks and Variables read for guarded approval', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'guarded' };
        const permissions = buildWorkflowPatPermissionRequirements(configuration).map(item => `${item.permission}:${item.level}`);
        expect(permissions).toEqual(expect.arrayContaining(['Checks:read', 'Variables:read']));
    });

    it('adds organization permissions only for selected organization capabilities', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'guarded' };
        configuration.projects.ids = '2';
        configuration.storage.variables.defaultScope = 'organization';
        const organizationPermissions = buildWorkflowPatPermissionRequirements(configuration, organization)
            .filter(item => item.scope === 'organization')
            .map(item => `${item.permission}:${item.level}`);
        expect(organizationPermissions).toEqual([
            'Members:read', 'Issue Types:write', 'Projects:write', 'Variables:read',
        ]);
    });

    it('omits Members read when every membership-consuming workflow is disabled', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.features.issues = false;
        configuration.features.pullRequests = false;
        configuration.features.commits = false;
        configuration.features.issueComments = false;
        configuration.features.pullRequestComments = false;
        configuration.repository.desiredAssigneesCount = 0;
        configuration.repository.desiredReviewersCount = 0;
        configuration.issueWorkflows.enabled = [];
        configuration.ai.membersOnly = false;

        expect(buildWorkflowPatPermissionRequirements(configuration, organization))
            .not.toEqual(expect.arrayContaining([
                expect.objectContaining({ scope: 'organization', permission: 'Members' }),
            ]));
    });

    it.each([
        ['automatic issue assignees', (configuration: ReturnType<typeof createDefaultSetupConfiguration>) => {
            configuration.features.issues = true;
            configuration.repository.desiredAssigneesCount = 1;
        }],
        ['automatic PR assignees', (configuration: ReturnType<typeof createDefaultSetupConfiguration>) => {
            configuration.features.pullRequests = true;
            configuration.repository.desiredAssigneesCount = 1;
        }],
        ['automatic PR reviewers', (configuration: ReturnType<typeof createDefaultSetupConfiguration>) => {
            configuration.features.pullRequests = true;
            configuration.repository.desiredReviewersCount = 1;
        }],
        ['release issue authorization', (configuration: ReturnType<typeof createDefaultSetupConfiguration>) => {
            configuration.features.issues = true;
            configuration.issueWorkflows.enabled = ['release'];
        }],
        ['members-only commit automation', (configuration: ReturnType<typeof createDefaultSetupConfiguration>) => {
            configuration.features.commits = true;
            configuration.ai.membersOnly = true;
        }],
        ['members-only issue comment automation', (configuration: ReturnType<typeof createDefaultSetupConfiguration>) => {
            configuration.features.issueComments = true;
            configuration.ai.membersOnly = true;
        }],
        ['members-only PR comment automation', (configuration: ReturnType<typeof createDefaultSetupConfiguration>) => {
            configuration.features.pullRequestComments = true;
            configuration.ai.membersOnly = true;
        }],
        ['members-only standalone single actions', (configuration: ReturnType<typeof createDefaultSetupConfiguration>) => {
            configuration.ai.membersOnly = true;
        }],
    ] as const)('adds Members read for %s', (_label, enableCapability) => {
        const configuration = createDefaultSetupConfiguration();
        configuration.features.issues = false;
        configuration.features.pullRequests = false;
        configuration.features.commits = false;
        configuration.features.issueComments = false;
        configuration.features.pullRequestComments = false;
        configuration.repository.desiredAssigneesCount = 0;
        configuration.repository.desiredReviewersCount = 0;
        configuration.issueWorkflows.enabled = [];
        configuration.ai.membersOnly = false;
        enableCapability(configuration);

        expect(buildWorkflowPatPermissionRequirements(configuration, organization))
            .toEqual(expect.arrayContaining([
                expect.objectContaining({ scope: 'organization', permission: 'Members', level: 'read' }),
            ]));
    });

    it.each([
        ['issue comments', 'issueComments'],
        ['pull request comments', 'pullRequestComments'],
    ] as const)('does not require Members read for %s without members-only authorization', (_label, feature) => {
        const configuration = createDefaultSetupConfiguration();
        configuration.features.issues = false;
        configuration.features.pullRequests = false;
        configuration.features.commits = false;
        configuration.features.issueComments = false;
        configuration.features.pullRequestComments = false;
        configuration.features[feature] = true;
        configuration.repository.desiredAssigneesCount = 0;
        configuration.repository.desiredReviewersCount = 0;
        configuration.issueWorkflows.enabled = [];
        configuration.ai.membersOnly = false;

        expect(buildWorkflowPatPermissionRequirements(configuration, organization))
            .not.toEqual(expect.arrayContaining([
                expect.objectContaining({ scope: 'organization', permission: 'Members' }),
            ]));
    });

    it('uses a per-variable scope override for guarded approval', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'guarded' };
        configuration.storage.variables.defaultScope = 'repository';
        configuration.storage.variables.overrides.PR_APPROVAL_POLICY = 'organization';
        expect(buildWorkflowPatPermissionRequirements(configuration, organization)).toEqual(expect.arrayContaining([
            expect.objectContaining({ scope: 'organization', permission: 'Variables', level: 'read' }),
        ]));
    });

    it('uses the preserved organization scope of an existing guarded approval variable', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'guarded' };
        configuration.storage.variables.defaultScope = 'repository';
        configuration.storage.variables.preserveExisting = true;
        const configuredRemote = {
            ...organization,
            organizationVariables: [{ name: 'PR_APPROVAL_POLICY', value: '{}' }],
        };

        expect(buildWorkflowPatPermissionRequirements(configuration, configuredRemote)).toEqual(expect.arrayContaining([
            expect.objectContaining({ scope: 'organization', permission: 'Variables', level: 'read' }),
        ]));
    });

    it('omits organization permissions when the repository owner is a user', () => {
        const configuration = createDefaultSetupConfiguration();
        const personal = { ...organization, ownerType: 'User' as const };
        expect(buildWorkflowPatPermissionRequirements(configuration, personal)
            .some(item => item.scope === 'organization')).toBe(false);
    });

    it('deduplicates permissions at the strongest level while preserving stable order', () => {
        const read: SetupTokenPermissionRequirement = {
            id: 'workflow.repository.variables', role: 'workflow', scope: 'repository', permission: 'Variables',
            level: 'read', applicability: 'conditional', condition: 'condition', reason: 'read', probe: 'variables',
        };
        const write: SetupTokenPermissionRequirement = {
            ...read, id: 'workflow.repository.variables-write', level: 'write', applicability: 'required', reason: 'write',
        };
        expect(normalizePermissionRequirements([read, write])).toEqual([write]);
    });

    it('promotes equal-level conditional requirements to required', () => {
        const conditional: SetupTokenPermissionRequirement = {
            id: 'setup.repository.contents', role: 'setup', scope: 'repository', permission: 'Contents',
            level: 'read', applicability: 'conditional', condition: 'later', reason: 'conditional', probe: 'contents',
        };
        const required = { ...conditional, id: 'setup.repository.contents-required', applicability: 'required' as const };

        expect(normalizePermissionRequirements([conditional, required])).toEqual([{
            ...conditional,
            applicability: 'required',
            condition: undefined,
        }]);
    });
});
