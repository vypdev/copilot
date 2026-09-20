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
        };

        const permissions = buildConfiguredSetupPatPermissionRequirements(configuration, configuredRemote)
            .map(item => `${item.scope}:${item.permission}:${item.level}`);

        expect(permissions).toEqual(expect.arrayContaining([
            'repository:Actions:write',
            'repository:Workflows:write',
            'organization:Projects:write',
        ]));
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

    it('always requires the documented workflow PAT baseline', () => {
        const configuration = createDefaultSetupConfiguration();
        configuration.features.release = false;
        configuration.features.hotfix = false;
        configuration.issueWorkflows.enabled = ['help'];
        configuration.pullRequestApproval = { ...configuration.pullRequestApproval, mode: 'off' };
        configuration.projects.ids = '';
        expect(buildWorkflowPatPermissionRequirements(configuration).map(item => item.permission)).toEqual([
            'Metadata', 'Actions', 'Contents', 'Issues', 'Pull requests',
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
