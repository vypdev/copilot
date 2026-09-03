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

export interface SetupCredentialsRequest {
    owner: string;
    repository: string;
    setupToken: string;
    requirements: readonly SetupCredentialRequirement[];
    manageSecrets: boolean;
    ref?: string;
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

        const existingSecretNames = await this.secrets.list(request.owner, request.repository, request.setupToken);
        const requirements = request.requirements.filter(requirement => requirement.name !== 'SETUP_PAT');
        this.prompt.explainCredentialSeparation(requirements);
        const existingRequirements = requirements.filter(requirement => existingSecretNames.includes(requirement.name));
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

        for (const requirement of requirements) {
            const existing = existingSecretNames.includes(requirement.name);
            if (existing) {
                const remoteCheck: SetupCredentialCheck = remoteCheckByName.get(requirement.name) ?? {
                    name: requirement.name,
                    status: 'unverifiable',
                    message: 'The remote health workflow is not available yet; GitHub does not reveal Secret values.',
                };
                checks.push(remoteCheck);
                const decision = await this.prompt.chooseExistingCredential(requirement, remoteCheck);
                if (remoteCheck.status === 'invalid' && decision !== 'replace') {
                    throw new ApplicationError(`${requirement.name} is invalid and must be replaced before setup can continue.`, 'authorization');
                }
                if (decision === 'keep') continue;
                if (decision === 'skip') continue;
            }

            const value = requirement.kind === 'workflowPat'
                ? await this.prompt.requestWorkflowPat(requirement, existing ? checks[checks.length - 1] : undefined)
                : await this.prompt.requestApiKey(requirement, existing ? checks[checks.length - 1] : undefined);
            if (!value) {
                if (!existing) checks.push({ name: requirement.name, status: 'missing', message: 'No value was provided.' });
                throw new ApplicationError(`${requirement.name} is required by the selected workflows.`, 'configuration');
            }
            const check = requirement.kind === 'workflowPat'
                ? await this.validation.validateSetupPat(request.owner, request.repository, value.value)
                : await this.validation.validateCredential(requirement, value.value);
            checks.push({ ...check, name: requirement.name });
            if (check.status !== 'valid') {
                throw new ApplicationError(`${requirement.name} validation failed: ${check.message}`, 'authorization');
            }
            values.push(value);
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
