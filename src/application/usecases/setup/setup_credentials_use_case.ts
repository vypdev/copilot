import type {
    SetupCredentialCheck,
    SetupCredentialCollection,
    SetupCredentialRequirement,
    SetupCredentialValue,
} from '../../../domain/setup';
import type {
    SetupCredentialPromptPort,
    SetupCredentialValidationPort,
    SetupRepositorySecretNamesQueryPort,
    SetupRemoteCredentialHealthPort,
} from '../../ports/setup_wizard_ports';
import type { SetupTokenPermissionAuditPort, SetupTokenPermissionPresenterPort } from '../../ports/setup_token_permission_ports';
import { ApplicationError } from '../../errors/application_error';
import type {
    SetupRemoteConfiguration,
    SetupResourceScope,
    SetupResourceStoragePolicy,
} from '../../../domain/setup';
import type { SetupTokenPermissionRequirement } from '../../../domain/setup_token_permissions';
import {
    canKeepExistingSetupResource,
    findSetupOrganizationShadows,
    requiresSetupOrganizationInventory,
    requiresSetupRepositoryInventory,
} from '../../policies/setup_configuration_storage_policy';

export interface SetupCredentialsRequest {
    owner: string;
    repository: string;
    setupToken: string;
    requirements: readonly SetupCredentialRequirement[];
    manageSecrets: boolean;
    secretStoragePolicy?: Readonly<SetupResourceStoragePolicy>;
    ref?: string;
    remoteConfiguration?: SetupRemoteConfiguration;
    workflowTokenPermissions?: readonly SetupTokenPermissionRequirement[];
}

export interface SetupCredentialsResult {
    collection: SetupCredentialCollection;
    checks: SetupCredentialCheck[];
    existingSecretNames: readonly string[];
}

/** Coordinates secret collection and validation without placing secret values in config files. */
export class SetupCredentialsUseCase {
    constructor(
        private readonly prompt: SetupCredentialPromptPort,
        private readonly validation: SetupCredentialValidationPort,
        private readonly secrets?: SetupRepositorySecretNamesQueryPort,
        private readonly remoteHealth?: SetupRemoteCredentialHealthPort,
        private readonly tokenPermissions?: SetupTokenPermissionAuditPort,
        private readonly permissionPresenter?: SetupTokenPermissionPresenterPort,
    ) {}

    async collect(request: SetupCredentialsRequest): Promise<SetupCredentialsResult> {
        const setupCheck = await this.validation.validateSetupPat(request.owner, request.repository, request.setupToken);
        if (setupCheck.status !== 'valid') {
            throw new ApplicationError('authorization.credential-invalid', `Setup PAT validation failed: ${setupCheck.message}`);
        }
        if (!request.manageSecrets) {
            this.prompt.showCredentialChecks([setupCheck]);
            return { collection: { apiKeys: [] }, checks: [setupCheck], existingSecretNames: [] };
        }
        if (!this.secrets) throw new ApplicationError('configuration.unsupported', 'Repository Secret provisioning is not available in this installation.');
        const requirements = request.requirements.filter(requirement => requirement.name !== 'SETUP_PAT');
        const requiresRepositoryInventory = requiresSetupRepositoryInventory(requirements.map(requirement => requirement.name));
        const requiresOrganizationInventory = request.remoteConfiguration?.ownerType === 'Organization'
            && (request.secretStoragePolicy === undefined
                || requiresSetupOrganizationInventory(
                    request.secretStoragePolicy,
                    requirements.map(requirement => requirement.name),
                    request.remoteConfiguration.repositorySecrets,
                ));
        if (requiresRepositoryInventory
            && request.remoteConfiguration
            && request.remoteConfiguration.repositorySecretsAccess !== 'available') {
            throw new ApplicationError(
                'provider.unavailable',
                `Repository Secret inventory is ${request.remoteConfiguration.repositorySecretsAccess}; credential collection cannot safely preserve existing Secrets.`,
            );
        }
        if (requiresOrganizationInventory
            && request.remoteConfiguration
            && request.remoteConfiguration.organizationSecretsAccess !== 'available') {
            throw new ApplicationError(
                'provider.unavailable',
                `Organization Secret inventory is ${request.remoteConfiguration.organizationSecretsAccess}; credential collection cannot safely preserve existing Secrets.`,
            );
        }
        if (request.secretStoragePolicy && request.remoteConfiguration?.repositorySecretsAccess === 'available') {
            const shadows = findSetupOrganizationShadows(
                request.secretStoragePolicy, 'secret', requirements.map(requirement => requirement.name),
                request.remoteConfiguration,
            );
            if (shadows.length > 0) {
                throw new ApplicationError(
                    'configuration.invalid',
                    `Repository Secret ${shadows[0]} shadows the selected organization Secret; choose repository scope or remove the shadow before setup.`,
                );
            }
        }

        const existingSecretNames = request.remoteConfiguration?.repositorySecrets
            ? [...request.remoteConfiguration.repositorySecrets]
            : await this.secrets.list(request.owner, request.repository, request.setupToken);
        const existingOrganizationSecretNames = request.remoteConfiguration?.organizationSecrets ?? [];
        const workflowTokenPermissions = request.workflowTokenPermissions ?? [];
        this.prompt.explainCredentialSeparation(requirements);
        if (workflowTokenPermissions.length > 0) {
            this.permissionPresenter?.showRequirements('workflow', workflowTokenPermissions);
        }
        const existingRequirements = requirements.filter(requirement =>
            existingSecretNames.includes(requirement.name) || existingOrganizationSecretNames.includes(requirement.name),
        );
        const remoteChecks = this.remoteHealth && existingRequirements.length > 0
            ? await this.remoteHealth.validateExisting(
                request.owner,
                request.repository,
                request.setupToken,
                request.ref ?? 'master',
                existingRequirements,
            )
            : undefined;
        const remoteCheckByName = new Map((remoteChecks ?? []).map(check => [check.name, check]));
        const checks: SetupCredentialCheck[] = [setupCheck];
        const values: SetupCredentialValue[] = [];
        const satisfiedGroups = new Set<string>();

        for (const requirement of requirements) {
            if (isRequirementSatisfied(requirement, satisfiedGroups)) continue;
            const repositoryExisting = existingSecretNames.includes(requirement.name);
            const organizationExisting = existingOrganizationSecretNames.includes(requirement.name);
            const existing = repositoryExisting || organizationExisting;
            const sourceScope: SetupResourceScope | undefined = repositoryExisting
                ? 'repository'
                : organizationExisting
                    ? 'organization'
                    : undefined;
            const workflowPermissionAuditRequired = requirement.kind === 'workflowPat'
                && workflowTokenPermissions.length > 0;
            let existingCheckIndex: number | undefined;
            if (existing) {
                const remoteCheck: SetupCredentialCheck = remoteCheckByName.get(requirement.name) ?? {
                    name: requirement.name,
                    status: 'unverifiable',
                    message: 'The remote health workflow is not available yet; GitHub does not reveal Secret values.',
                };
                const scopedCheck = workflowPermissionAuditRequired
                    ? workflowPatReentryCheck(remoteCheck, sourceScope)
                    : { ...remoteCheck, sourceScope };
                existingCheckIndex = checks.push(scopedCheck) - 1;
                if (!workflowPermissionAuditRequired) {
                    const decision = await this.prompt.chooseExistingCredential(requirement, scopedCheck);
                    if (remoteCheck.status === 'invalid' && decision !== 'replace' && !hasAlternative(requirement)) {
                        throw new ApplicationError('authorization.credential-invalid', `${requirement.name} is invalid and must be replaced before setup can continue.`);
                    }
                    if (decision === 'keep'
                        && remoteCheck.status !== 'invalid'
                        && canKeepExistingSetupResource(
                            request.secretStoragePolicy,
                            requirement.name,
                            sourceScope,
                        )) {
                        markRequirementSatisfied(requirement, satisfiedGroups);
                        continue;
                    }
                    if (decision === 'skip') continue;
                }
            }

            const value = requirement.kind === 'workflowPat'
                ? await this.prompt.requestWorkflowPat(requirement, existing ? checks[checks.length - 1] : undefined)
                : await this.prompt.requestApiKey(requirement, existing ? checks[checks.length - 1] : undefined);
            if (!value) {
                if (existing && workflowPermissionAuditRequired) {
                    throw new ApplicationError(
                        'authorization.credential-invalid',
                        'Existing PAT cannot be permission-audited because GitHub does not reveal Secret values; re-enter or supply PAT before setup can continue.',
                    );
                }
                if (!existing) checks.push(runnerAuthenticationCanSatisfyRequirement(requirement)
                    ? {
                        name: requirement.name,
                        status: 'not_required',
                        message: 'No fallback credential was provided; the target runner must pass the Codex login preflight.',
                    }
                    : { name: requirement.name, status: 'missing', message: 'No value was provided.' });
                if (hasAlternative(requirement)) continue;
                throw new ApplicationError('authorization.credential-invalid', `${requirement.name} is required by the selected workflows.`);
            }
            let check: SetupCredentialCheck;
            if (workflowPermissionAuditRequired) {
                if (!this.tokenPermissions) {
                    throw new ApplicationError(
                        'configuration.unsupported',
                        'Workflow PAT permission auditing is not available in this installation.',
                    );
                }
                const report = await this.tokenPermissions.inspect({
                    role: 'workflow',
                    owner: request.owner,
                    repository: request.repository,
                    token: value.value,
                    requirements: workflowTokenPermissions,
                });
                this.permissionPresenter?.showReport(report);
                const permissionAccepted = report.ready
                    || (report.confirmationRequired
                        && await this.prompt.confirmUnverifiableTokenPermissions?.(report) === true);
                check = {
                    name: requirement.name,
                    status: permissionAccepted && report.identityStatus === 'valid' ? 'valid' : 'invalid',
                    message: permissionAccepted
                        ? report.ready
                            ? 'GitHub identity, repository access, and safely verifiable permissions were checked.'
                            : 'GitHub identity and required reads were verified; the operator explicitly acknowledged unverifiable write permissions.'
                        : 'The workflow PAT has missing, unverifiable-read, or unconfirmed required GitHub access.',
                    ...(report.account ? { account: report.account } : {}),
                };
            } else {
                check = requirement.kind === 'workflowPat'
                    ? await this.validation.validateSetupPat(request.owner, request.repository, value.value)
                    : await this.validation.validateCredential(requirement, value.value);
            }
            const namedCheck = { ...check, name: requirement.name };
            if (existingCheckIndex !== undefined) checks[existingCheckIndex] = namedCheck;
            else checks.push(namedCheck);
            if (!isAcceptedCredentialCheck(requirement, check)) {
                if (hasAlternative(requirement)) continue;
                throw new ApplicationError('authorization.credential-invalid', `${requirement.name} validation failed: ${check.message}`);
            }
            values.push(value);
            markRequirementSatisfied(requirement, satisfiedGroups);
        }

        const unsatisfiedGroup = [...new Set(requirements.flatMap(requirement => requirement.alternativeGroups ?? []))]
            .find(group => !satisfiedGroups.has(group) && !runnerAuthenticationCanSatisfyGroup(requirements, group));
        if (unsatisfiedGroup) {
            const groupNames = requirements
                .filter(requirement => requirement.alternativeGroups?.includes(unsatisfiedGroup))
                .map(requirement => requirement.name)
                .join(' or ');
            throw new ApplicationError('authorization.credential-invalid', `At least one of ${groupNames} is required by the selected workflows.`);
        }
        this.prompt.showCredentialChecks(checks);
        return {
            collection: {
                workflowPat: values.find(value => value.name === 'PAT'),
                apiKeys: values.filter(value => value.name !== 'PAT'),
            },
            checks,
            existingSecretNames,
        };
    }
}

function workflowPatReentryCheck(
    check: SetupCredentialCheck,
    sourceScope: SetupResourceScope | undefined,
): SetupCredentialCheck {
    return {
        ...check,
        sourceScope,
        status: check.status === 'invalid' ? 'invalid' : 'unverifiable',
        message: `${check.message} GitHub does not reveal existing Secret values; re-enter the workflow PAT to audit its required permissions.`,
    };
}

function hasAlternative(requirement: SetupCredentialRequirement): boolean {
    return (requirement.alternativeGroups?.length ?? 0) > 0;
}

function runnerAuthenticationCanSatisfyRequirement(requirement: SetupCredentialRequirement): boolean {
    return Boolean(requirement.alternativeGroups?.length)
        && requirement.alternativeGroups!.every(group => requirement.runnerAuthenticationGroups?.includes(group));
}

function runnerAuthenticationCanSatisfyGroup(
    requirements: readonly SetupCredentialRequirement[],
    group: string,
): boolean {
    return requirements.some(requirement => requirement.runnerAuthenticationGroups?.includes(group));
}

function isRequirementSatisfied(requirement: SetupCredentialRequirement, satisfiedGroups: ReadonlySet<string>): boolean {
    return hasAlternative(requirement)
        ? requirement.alternativeGroups!.every(group => satisfiedGroups.has(group))
        : satisfiedGroups.has(requirement.name);
}

function markRequirementSatisfied(requirement: SetupCredentialRequirement, satisfiedGroups: Set<string>): void {
    if (hasAlternative(requirement)) {
        for (const group of requirement.alternativeGroups!) satisfiedGroups.add(group);
        return;
    }
    satisfiedGroups.add(requirement.name);
}

function isAcceptedCredentialCheck(
    requirement: SetupCredentialRequirement,
    check: SetupCredentialCheck,
): boolean {
    return check.status === 'valid'
        || (check.status === 'unverifiable' && requirement.validation === 'unverifiable');
}
