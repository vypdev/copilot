import type { SetupConfiguration, SetupRemoteConfiguration } from '../../domain/setup';
import { buildSetupRepositoryVariables } from './setup_configuration_plan';
import { buildSetupCredentialRequirements } from './setup_credential_requirement_policy';
import {
    getSetupResourceStoragePolicy,
    requiresSetupRepositoryInventory,
    resolveSetupResourceTarget,
} from './setup_configuration_storage_policy';
import type {
    SetupTokenPermissionApplicability,
    SetupTokenPermissionLevel,
    SetupTokenPermissionProbe,
    SetupTokenPermissionRequirement,
    SetupTokenRole,
    SetupTokenPermissionScope,
} from '../../domain/setup_token_permissions';

interface PermissionInput {
    role: SetupTokenRole;
    scope: SetupTokenPermissionScope;
    permission: string;
    level: SetupTokenPermissionLevel;
    applicability?: SetupTokenPermissionApplicability;
    reason: string;
    condition?: string;
    probe: SetupTokenPermissionProbe;
}

const requirement = (input: PermissionInput): SetupTokenPermissionRequirement => ({
    id: `${input.role}.${input.scope}.${input.permission.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}`,
    applicability: 'required',
    ...input,
});

/**
 * Bootstrap guidance is intentionally comprehensive because the final
 * interactive configuration does not exist before the setup PAT prompt.
 */
export function buildSetupPatPermissionRequirements(): SetupTokenPermissionRequirement[] {
    return normalizePermissionRequirements([
        requirement({ role: 'setup', scope: 'repository', permission: 'Metadata', level: 'read', reason: 'Resolve repository identity and visibility.', probe: 'metadata' }),
        requirement({ role: 'setup', scope: 'repository', permission: 'Contents', level: 'read', reason: 'Inspect installed workflows and repository files.', probe: 'contents' }),
        requirement({ role: 'setup', scope: 'repository', permission: 'Secrets', level: 'write', applicability: 'conditional', condition: 'Secret provisioning enabled', reason: 'Inspect and provision selected GitHub Actions Secrets.', probe: 'secrets' }),
        requirement({ role: 'setup', scope: 'repository', permission: 'Variables', level: 'write', applicability: 'conditional', condition: 'Variable provisioning enabled', reason: 'Inspect and provision selected GitHub Actions Variables.', probe: 'variables' }),
        requirement({ role: 'setup', scope: 'repository', permission: 'Issues', level: 'write', applicability: 'conditional', condition: 'Issue workflows enabled', reason: 'Provision labels and issue resources.', probe: 'issues' }),
        requirement({ role: 'setup', scope: 'repository', permission: 'Actions', level: 'write', applicability: 'conditional', condition: 'Credential health enabled', reason: 'Inspect and dispatch credential-health workflows.', probe: 'actions' }),
        requirement({ role: 'setup', scope: 'repository', permission: 'Administration', level: 'read', applicability: 'conditional', condition: 'Release, hotfix, or guarded approval enabled', reason: 'Inspect branch protection and rulesets.', probe: 'administration' }),
        requirement({ role: 'setup', scope: 'repository', permission: 'Workflows', level: 'write', applicability: 'conditional', condition: 'Temporary health workflow required', reason: 'Bootstrap a missing credential-health workflow.', probe: 'workflows' }),
        requirement({ role: 'setup', scope: 'organization', permission: 'Secrets', level: 'write', applicability: 'conditional', condition: 'Organization Secret storage selected', reason: 'Inspect and provision organization Actions Secrets.', probe: 'secrets' }),
        requirement({ role: 'setup', scope: 'organization', permission: 'Variables', level: 'write', applicability: 'conditional', condition: 'Organization Variable storage selected', reason: 'Inspect and provision organization Actions Variables.', probe: 'variables' }),
        requirement({ role: 'setup', scope: 'organization', permission: 'Issue Types', level: 'write', applicability: 'conditional', condition: 'Issue type automation enabled', reason: 'Provision and assign configured issue types.', probe: 'issue-types' }),
        requirement({ role: 'setup', scope: 'organization', permission: 'Projects', level: 'write', applicability: 'conditional', condition: 'Organization Projects selected', reason: 'Inspect and configure selected Projects.', probe: 'projects' }),
    ]);
}

/**
 * Recomputes setup-PAT permissions after the operator has approved the final
 * configuration. Unlike the bootstrap catalog, every row is now required by a
 * selected setup operation or its read-only preflight.
 */
export function buildConfiguredSetupPatPermissionRequirements(
    configuration: Readonly<SetupConfiguration>,
    remote?: Readonly<SetupRemoteConfiguration>,
): SetupTokenPermissionRequirement[] {
    const repositorySecretNames = buildSetupCredentialRequirements(configuration)
        .map(credential => credential.name);
    const repositoryVariableNames = buildSetupRepositoryVariables(configuration)
        .map(variable => variable.name);
    const secretScopes = configuration.manageRepositorySecrets
        ? selectedResourceScopes(configuration, 'secret', repositorySecretNames, remote)
        : new Set<SetupTokenPermissionScope>();
    const variableScopes = configuration.manageRepositoryVariables
        ? selectedResourceScopes(configuration, 'variable', repositoryVariableNames, remote)
        : new Set<SetupTokenPermissionScope>();
    const enabledIssueWorkflows = configuration.issueWorkflows.enabled.length > 0;
    const releaseOrHotfix = configuration.features.release
        || configuration.features.hotfix
        || configuration.issueWorkflows.enabled.some(kind => kind === 'release' || kind === 'hotfix');
    const guardedApproval = configuration.pullRequestApproval.mode === 'guarded';
    const hasExistingCredential = repositorySecretNames.some(name =>
        remote?.repositorySecrets.includes(name) || remote?.organizationSecrets.includes(name),
    );
    const needsCredentialHealth = configuration.manageRepositorySecrets && hasExistingCredential;
    const organization = remote?.ownerType === 'Organization';

    return normalizePermissionRequirements([
        requirement({ role: 'setup', scope: 'repository', permission: 'Metadata', level: 'read', reason: 'Resolve repository identity and visibility.', probe: 'metadata' }),
        requirement({ role: 'setup', scope: 'repository', permission: 'Contents', level: 'read', reason: 'Inspect installed workflows and repository files.', probe: 'contents' }),
        ...(configuration.createInitialTag ? [requirement({
            role: 'setup', scope: 'repository', permission: 'Contents', level: 'write',
            reason: 'Create the initial repository tag when no version tag exists.', probe: 'contents',
        })] : []),
        ...(secretScopes.has('repository') ? [requirement({
            role: 'setup', scope: 'repository', permission: 'Secrets', level: 'write',
            reason: 'Inspect and provision selected repository Actions Secrets.', probe: 'secrets',
        })] : []),
        ...(variableScopes.has('repository') ? [requirement({
            role: 'setup', scope: 'repository', permission: 'Variables', level: 'write',
            reason: 'Inspect and provision selected repository Actions Variables.', probe: 'variables',
        })] : []),
        ...(enabledIssueWorkflows ? [requirement({
            role: 'setup', scope: 'repository', permission: 'Issues', level: 'write',
            reason: 'Provision labels for the selected issue workflows.', probe: 'issues',
        })] : []),
        ...(needsCredentialHealth ? [
            requirement({ role: 'setup', scope: 'repository', permission: 'Actions', level: 'write', reason: 'Dispatch credential-health checks for existing Secrets.', probe: 'actions' }),
            requirement({ role: 'setup', scope: 'repository', permission: 'Contents', level: 'write', reason: 'Temporarily install credential health when its workflow is missing.', probe: 'contents' }),
            requirement({ role: 'setup', scope: 'repository', permission: 'Workflows', level: 'write', reason: 'Temporarily install credential health when its workflow is missing.', probe: 'workflows' }),
        ] : []),
        ...(releaseOrHotfix || guardedApproval ? [requirement({
            role: 'setup', scope: 'repository', permission: 'Administration', level: 'read',
            reason: 'Inspect branch protection and effective rulesets.', probe: 'administration',
        })] : []),
        ...(organization && secretScopes.has('organization') ? [requirement({
            role: 'setup', scope: 'organization', permission: 'Secrets', level: 'write',
            reason: 'Inspect and provision selected organization Actions Secrets.', probe: 'secrets',
        })] : []),
        ...(organization && variableScopes.has('organization') ? [requirement({
            role: 'setup', scope: 'organization', permission: 'Variables', level: 'write',
            reason: 'Inspect and provision selected organization Actions Variables.', probe: 'variables',
        })] : []),
        ...(organization && enabledIssueWorkflows ? [requirement({
            role: 'setup', scope: 'organization', permission: 'Issue Types', level: 'write',
            reason: 'Provision native issue types for the selected workflows.', probe: 'issue-types',
        })] : []),
        ...(organization && configuration.projects.ids.trim().length > 0 ? [requirement({
            role: 'setup', scope: 'organization', permission: 'Projects', level: 'write',
            reason: 'Inspect and configure the selected organization Projects.', probe: 'projects',
        })] : []),
    ]);
}

export function buildWorkflowPatPermissionRequirements(
    configuration: Readonly<SetupConfiguration>,
    remote?: Readonly<SetupRemoteConfiguration>,
): SetupTokenPermissionRequirement[] {
    const releaseOrHotfix = configuration.features.release
        || configuration.features.hotfix
        || configuration.issueWorkflows.enabled.some(kind => kind === 'release' || kind === 'hotfix');
    const guardedApproval = configuration.pullRequestApproval.mode === 'guarded';
    const organization = remote?.ownerType === 'Organization';
    const hasProjects = configuration.projects.ids.trim().length > 0;
    const issueTypes = configuration.issueWorkflows.enabled.length > 0;
    const organizationVariables = guardedApproval && usesOrganizationResource(configuration.storage.variables, 'PR_APPROVAL_POLICY');

    return normalizePermissionRequirements([
        requirement({ role: 'workflow', scope: 'repository', permission: 'Metadata', level: 'read', reason: 'Resolve repository and collaborator metadata.', probe: 'metadata' }),
        requirement({ role: 'workflow', scope: 'repository', permission: 'Actions', level: 'write', reason: 'Inspect and dispatch Copilot workflows.', probe: 'actions' }),
        requirement({ role: 'workflow', scope: 'repository', permission: 'Contents', level: 'write', reason: 'Create and update managed branches and files.', probe: 'contents' }),
        requirement({ role: 'workflow', scope: 'repository', permission: 'Issues', level: 'write', reason: 'Manage issue labels, assignments, types, and comments.', probe: 'issues' }),
        requirement({ role: 'workflow', scope: 'repository', permission: 'Pull requests', level: 'write', reason: 'Create and update pull requests and reviews.', probe: 'pull-requests' }),
        ...(releaseOrHotfix || guardedApproval ? [requirement({
            role: 'workflow', scope: 'repository', permission: 'Administration', level: 'read',
            reason: 'Inspect branch protection and effective rulesets.', probe: 'administration',
        })] : []),
        ...(guardedApproval ? [
            requirement({ role: 'workflow', scope: 'repository', permission: 'Checks', level: 'read', reason: 'Verify current-head required checks and producer identities.', probe: 'checks' }),
            requirement({ role: 'workflow', scope: 'repository', permission: 'Variables', level: 'read', reason: 'Load the guarded approval policy.', probe: 'variables' }),
        ] : []),
        ...(organization ? [requirement({ role: 'workflow', scope: 'organization', permission: 'Members', level: 'read', reason: 'Authorize organization members.', probe: 'members' })] : []),
        ...(organization && issueTypes ? [requirement({ role: 'workflow', scope: 'organization', permission: 'Issue Types', level: 'write', reason: 'Assign configured organization issue types.', probe: 'issue-types' })] : []),
        ...(organization && hasProjects ? [requirement({ role: 'workflow', scope: 'organization', permission: 'Projects', level: 'write', reason: 'Update selected organization Projects.', probe: 'projects' })] : []),
        ...(organization && organizationVariables ? [requirement({ role: 'workflow', scope: 'organization', permission: 'Variables', level: 'read', reason: 'Load the organization-scoped approval policy.', probe: 'variables' })] : []),
    ]);
}

export function normalizePermissionRequirements(
    requirements: readonly SetupTokenPermissionRequirement[],
): SetupTokenPermissionRequirement[] {
    const strongest = new Map<string, SetupTokenPermissionRequirement>();
    for (const candidate of requirements) {
        const key = `${candidate.role}:${candidate.scope}:${candidate.permission.toLowerCase()}`;
        const current = strongest.get(key);
        if (!current || levelRank(candidate.level) > levelRank(current.level)) {
            strongest.set(key, candidate);
        } else if (current.applicability === 'conditional' && candidate.applicability === 'required') {
            strongest.set(key, { ...current, applicability: 'required', condition: undefined });
        }
    }
    return [...strongest.values()];
}

function usesOrganizationResource(
    policy: SetupConfiguration['storage']['variables'],
    name: string,
): boolean {
    return (policy.overrides[name] ?? policy.defaultScope) === 'organization';
}

function selectedResourceScopes(
    configuration: Readonly<SetupConfiguration>,
    kind: 'secret' | 'variable',
    names: readonly string[],
    remote?: Readonly<SetupRemoteConfiguration>,
): Set<SetupTokenPermissionScope> {
    const scopes = new Set(names.map(name => resolveSetupResourceTarget(
        configuration,
        kind,
        name,
        remote,
    ).scope));
    if (requiresSetupRepositoryInventory(
        getSetupResourceStoragePolicy(configuration, kind),
        names,
    )) {
        scopes.add('repository');
    }
    return scopes;
}

function levelRank(level: SetupTokenPermissionLevel): number {
    return level === 'write' ? 2 : 1;
}
