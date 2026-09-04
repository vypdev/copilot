import type { SetupConfiguration, DoctorCheck, SetupRemoteConfiguration } from '../../../domain/setup';
import {
    buildSetupCredentialRequirements,
    buildSetupRepositoryVariables,
    getSetupResourceStoragePolicy,
    resolveSetupResourceScope,
    setupResourceExists,
    usesOrganizationStorage,
} from '../../policies/setup_configuration_policy';
import type {
    DoctorOutputPort,
    SetupCredentialValidationPort,
    SetupRepositoryConfigurationReadPort,
    SetupRepositorySecretsPort,
    SetupRemoteConfigurationReadPort,
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
        private readonly remoteConfigurationReader?: SetupRemoteConfigurationReadPort,
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

        let remoteConfiguration: SetupRemoteConfiguration | undefined;
        if (this.remoteConfigurationReader) {
            try {
                remoteConfiguration = await this.remoteConfigurationReader.inspect(
                    request.owner,
                    request.repository,
                    request.setupToken,
                );
            } catch (error) {
                const message = `Could not inspect GitHub Actions resource scopes: ${error instanceof Error ? error.message : String(error)}`;
                checks.push({
                    area: 'GitHub Actions scopes',
                    status: usesOrganizationStorage(request.configuration) ? 'fail' : 'warn',
                    message,
                });
            }
        }

        const requiredVariables = buildSetupRepositoryVariables(request.configuration);
        const remoteVariables = remoteConfiguration?.repositoryVariables
            ?? await this.variables.listVariables(request.owner, request.repository, request.setupToken);
        const remoteVariableMap = new Map<string, { value?: string; source: 'repository' | 'organization' }>(
            remoteVariables.map(variable => [variable.name, { value: variable.value, source: 'repository' as const }]),
        );
        if (remoteConfiguration) {
            for (const variable of remoteConfiguration.organizationVariables) {
                if (!remoteVariableMap.has(variable.name)) {
                    remoteVariableMap.set(variable.name, { value: variable.value, source: 'organization' as const });
                }
            }
        }
        for (const variable of requiredVariables) {
            const remoteVariable = remoteVariableMap.get(variable.name);
            const value = remoteVariable?.value;
            const state = setupResourceExists(remoteConfiguration, 'variable', variable.name);
            const policy = getSetupResourceStoragePolicy(request.configuration, 'variable');
            const preserveExisting = state.effective !== undefined
                && state.effective !== resolveSetupResourceScope(policy, variable.name)
                && !Object.prototype.hasOwnProperty.call(policy.overrides, variable.name)
                && policy.preserveExisting;
            const sourceMessage = remoteVariable?.source === 'organization'
                ? ' Variable is inherited from the organization scope.'
                : remoteVariable
                    ? ' Variable is configured at repository scope.'
                    : '';
            const matches = value === variable.value;
            checks.push({
                area: `Variable ${variable.name}`,
                status: value === undefined ? 'fail' : matches ? 'pass' : preserveExisting ? 'warn' : 'fail',
                message: value === undefined
                    ? 'Variable is missing.'
                    : matches
                        ? `Variable is configured.${sourceMessage}`
                        : preserveExisting
                            ? `Variable differs from the selected setup configuration but is preserved at ${remoteVariable?.source} scope.`
                            : 'Variable exists but differs from the selected setup configuration.',
            });
        }

        const repositorySecretNames = remoteConfiguration?.repositorySecrets
            ?? await this.secrets.list(request.owner, request.repository, request.setupToken);
        const remoteSecrets = new Set(repositorySecretNames);
        if (remoteConfiguration) {
            for (const secret of remoteConfiguration.organizationSecrets) remoteSecrets.add(secret);
        }
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
