import type { SetupPromptPort } from '../../ports/setup_wizard_ports';
import type { SetupConfiguration, SetupPlan } from '../../../domain/setup';
import {
    buildSetupPlan,
    createDefaultSetupConfiguration,
    mergeSetupConfiguration,
    validateSetupConfiguration,
    type SetupConfigurationOverrides,
} from '../../policies/setup_configuration_policy';

export interface SetupWizardRequest {
    overrides?: SetupConfigurationOverrides;
    skipRepositoryVariables?: boolean;
}

export class SetupWizardUseCase {
    constructor(private readonly prompt: SetupPromptPort) {}

    async collect(request: SetupWizardRequest = {}): Promise<SetupConfiguration | undefined> {
        const defaults = mergeSetupConfiguration(
            createDefaultSetupConfiguration(),
            {
                ...request.overrides,
                ...(request.skipRepositoryVariables ? { manageRepositoryVariables: false } : {}),
            },
        );
        const collected = await this.prompt.collect(defaults);
        const configuration = request.skipRepositoryVariables
            ? { ...collected, manageRepositoryVariables: false }
            : collected;
        const validationErrors = validateSetupConfiguration(configuration);
        if (validationErrors.length > 0) {
            throw new Error(`Invalid setup configuration:\n${validationErrors.map(error => `- ${error}`).join('\n')}`);
        }
        const plan = buildSetupPlan(configuration);
        this.prompt.showPlan(plan);
        if (!(await this.prompt.confirm(plan))) return undefined;
        return configuration;
    }

    plan(configuration: SetupConfiguration): SetupPlan {
        return buildSetupPlan(configuration);
    }

    close(): void {
        this.prompt.close();
    }
}
