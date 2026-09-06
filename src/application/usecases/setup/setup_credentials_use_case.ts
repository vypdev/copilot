import type {
    SetupCredentialCheck,
    SetupCredentialCollection,
    SetupCredentialRequirement,
    SetupCredentialValue,
} from '../../../domain/setup';
import type {
    SetupCredentialPromptPort,
    SetupCredentialValidationPort,
    SetupRepositorySecretsPort,
    SetupRemoteCredentialHealthPort,
} from '../../ports/setup_wizard_ports';
import { ApplicationError } from '../../errors/application_error';
import type { SetupRemoteConfiguration, SetupResourceScope } from '../../../domain/setup';

export interface SetupCredentialsRequest {
    owner: string;
    repository: string;
    setupToken: string;
    requirements: readonly SetupCredentialRequirement[];
    manageSecrets: boolean;
    ref?: string;
    remoteConfiguration?: SetupRemoteConfiguration;
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
        private readonly secrets?: SetupRepositorySecretsPort,
        private readonly remoteHealth?: SetupRemoteCredentialHealthPort,
    ) {}

    async collect(request: SetupCredentialsRequest): Promise<SetupCredentialsResult> {
        const setupCheck = await this.validation.validateSetupPat(request.owner, request.repository, request.setupToken);
        if (setupCheck.status !== 'valid') {
            throw new ApplicationError(`Setup PAT validation failed: ${setupCheck.message}`, 'authorization');
        }
        if (!request.manageSecrets) {
            this.prompt.showCredentialChecks([setupCheck]);
            return { collection: { apiKeys: [] }, checks: [setupCheck], existingSecretNames: [] };
        }
        if (!this.secrets) throw new ApplicationError('Repository Secret provisioning is not available in this installation.', 'configuration');

        const existingSecretNames = request.remoteConfiguration?.repositorySecrets
            ? [...request.remoteConfiguration.repositorySecrets]
            : await this.secrets.list(request.owner, request.repository, request.setupToken);
        const existingOrganizationSecretNames = request.remoteConfiguration?.organizationSecrets ?? [];
        const requirements = request.requirements.filter(requirement => requirement.name !== 'SETUP_PAT');
        this.prompt.explainCredentialSeparation(requirements);
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
            if (existing) {
                const remoteCheck: SetupCredentialCheck = remoteCheckByName.get(requirement.name) ?? {
                    name: requirement.name,
                    status: 'unverifiable',
                    message: 'The remote health workflow is not available yet; GitHub does not reveal Secret values.',
                };
                const scopedCheck = { ...remoteCheck, sourceScope };
                checks.push(scopedCheck);
                const decision = await this.prompt.chooseExistingCredential(requirement, scopedCheck);
                if (remoteCheck.status === 'invalid' && decision !== 'replace' && !hasAlternative(requirement)) {
                    throw new ApplicationError(`${requirement.name} is invalid and must be replaced before setup can continue.`, 'authorization');
                }
                if (decision === 'keep' && remoteCheck.status !== 'invalid') {
                    markRequirementSatisfied(requirement, satisfiedGroups);
                    continue;
                }
                if (decision === 'skip') continue;
            }

            const value = requirement.kind === 'workflowPat'
                ? await this.prompt.requestWorkflowPat(requirement, existing ? checks[checks.length - 1] : undefined)
                : await this.prompt.requestApiKey(requirement, existing ? checks[checks.length - 1] : undefined);
            if (!value) {
                if (!existing) checks.push({ name: requirement.name, status: 'missing', message: 'No value was provided.' });
                if (hasAlternative(requirement)) continue;
                throw new ApplicationError(`${requirement.name} is required by the selected workflows.`, 'configuration');
            }
            const check = requirement.kind === 'workflowPat'
                ? await this.validation.validateSetupPat(request.owner, request.repository, value.value)
                : await this.validation.validateCredential(requirement, value.value);
            checks.push({ ...check, name: requirement.name });
            if (!isAcceptedCredentialCheck(requirement, check)) {
                if (hasAlternative(requirement)) continue;
                throw new ApplicationError(`${requirement.name} validation failed: ${check.message}`, 'authorization');
            }
            values.push(value);
            markRequirementSatisfied(requirement, satisfiedGroups);
        }

        const unsatisfiedGroup = requirements.find(requirement =>
            hasAlternative(requirement) && !isRequirementSatisfied(requirement, satisfiedGroups),
        );
        if (unsatisfiedGroup) {
            const groupNames = requirements
                .filter(requirement => intersectsGroups(requirement, unsatisfiedGroup))
                .map(requirement => requirement.name)
                .join(' or ');
            throw new ApplicationError(`At least one of ${groupNames} is required by the selected workflows.`, 'configuration');
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

function hasAlternative(requirement: SetupCredentialRequirement): boolean {
    return (requirement.alternativeGroups?.length ?? 0) > 0;
}

function isRequirementSatisfied(requirement: SetupCredentialRequirement, satisfiedGroups: ReadonlySet<string>): boolean {
    return hasAlternative(requirement)
        ? requirement.alternativeGroups!.some(group => satisfiedGroups.has(group))
        : satisfiedGroups.has(requirement.name);
}

function markRequirementSatisfied(requirement: SetupCredentialRequirement, satisfiedGroups: Set<string>): void {
    if (hasAlternative(requirement)) {
        for (const group of requirement.alternativeGroups!) satisfiedGroups.add(group);
        return;
    }
    satisfiedGroups.add(requirement.name);
}

function intersectsGroups(left: SetupCredentialRequirement, right: SetupCredentialRequirement): boolean {
    const rightGroups = new Set(right.alternativeGroups ?? []);
    return (left.alternativeGroups ?? []).some(group => rightGroups.has(group));
}

function isAcceptedCredentialCheck(
    requirement: SetupCredentialRequirement,
    check: SetupCredentialCheck,
): boolean {
    return check.status === 'valid'
        || (check.status === 'unverifiable' && requirement.validation === 'unverifiable');
}
