import type { SetupConfiguration, DoctorCheck } from '../../../domain/setup';
import { buildSetupCredentialRequirements, buildSetupRepositoryVariables } from '../../policies/setup_configuration_policy';
import type {
    DoctorOutputPort,
    SetupCredentialValidationPort,
    SetupRepositoryConfigurationReadPort,
    SetupRepositorySecretsPort,
    SetupRemoteCredentialHealthPort,
} from '../../ports/setup_wizard_ports';
import type { SetupWorkspacePort } from '../../ports/setup_workspace_ports';

export interface DoctorRequest {
    owner: string;
    repository: string;
    setupToken: string;
    configuration: SetupConfiguration;
}

export class SetupDoctorUseCase {
    constructor(
        private readonly validation: SetupCredentialValidationPort,
        private readonly secrets: SetupRepositorySecretsPort,
        private readonly variables: SetupRepositoryConfigurationReadPort,
        private readonly workspace: SetupWorkspacePort,
        private readonly output: DoctorOutputPort,
        private readonly remoteHealth?: SetupRemoteCredentialHealthPort,
    ) {}

    async execute(request: DoctorRequest): Promise<boolean> {
        const checks: DoctorCheck[] = [];
        const pat = await this.validation.validateSetupPat(request.owner, request.repository, request.setupToken);
        checks.push({ area: 'Setup PAT', status: pat.status === 'valid' ? 'pass' : 'fail', message: pat.message });
        if (pat.status !== 'valid') {
            this.output.showDoctorChecks(checks);
            return false;
        }

        const comparisons = this.workspace.compareWorkflows?.(request.configuration.features) ?? [];
        for (const comparison of comparisons) {
            checks.push({
                area: `Workflow ${comparison.file}`,
                status: comparison.status === 'unchanged' ? 'pass' : 'fail',
                message: comparison.status === 'unchanged' ? 'Matches the installed setup template.' : `Local workflow is ${comparison.status}.`,
            });
        }

        const requiredVariables = buildSetupRepositoryVariables(request.configuration);
        const remoteVariables = await this.variables.listVariables(request.owner, request.repository, request.setupToken);
        const remoteVariableMap = new Map(remoteVariables.map(variable => [variable.name, variable.value]));
        for (const variable of requiredVariables) {
            const value = remoteVariableMap.get(variable.name);
            checks.push({
                area: `Variable ${variable.name}`,
                status: value === undefined ? 'fail' : value === variable.value ? 'pass' : 'fail',
                message: value === undefined ? 'Variable is missing.' : value === variable.value ? 'Variable is configured.' : 'Variable exists but differs from the selected setup configuration.',
            });
        }

        const remoteSecrets = new Set(await this.secrets.list(request.owner, request.repository, request.setupToken));
        const requirements = buildSetupCredentialRequirements(request.configuration);
        const remoteHealth = this.remoteHealth
            ? await this.remoteHealth.validateExisting(request.owner, request.repository, request.setupToken, request.configuration.repository.mainBranch, requirements.filter(requirement => remoteSecrets.has(requirement.name)))
            : undefined;
        const remoteHealthByName = new Map((remoteHealth ?? []).map(check => [check.name, check]));
        for (const requirement of requirements) {
            if (!remoteSecrets.has(requirement.name)) {
                checks.push({ area: `Secret ${requirement.name}`, status: 'fail', message: 'Secret is missing.' });
            } else {
                const health = remoteHealthByName.get(requirement.name);
                checks.push({
                    area: `Secret ${requirement.name}`,
                    status: health?.status === 'valid' ? 'pass' : health?.status === 'invalid' ? 'fail' : 'warn',
                    message: health?.message ?? 'Secret is present, but the remote credential health workflow is unavailable.',
                });
            }
        }
        this.output.showDoctorChecks(checks);
        return checks.every(check => check.status !== 'fail');
    }
}
