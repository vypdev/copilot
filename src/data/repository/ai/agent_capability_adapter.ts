import { AGENT_REQUEST_TIMEOUT_MS } from './agent_constants';
import { logError } from '../../../utils/logger';
import { ProviderCliAdapter } from '../provider_cli_adapter';

import { getValidatedAgentConfiguration } from '../agent_configuration_policy';

import type { AgentConfiguration } from '../../../application/ports/agent_configuration_ports';
import type { AgentCapability } from '../../../domain/agent';
import type { AgentCliPort } from '../../../infrastructure/agents/ports/agent_provider_ports';

export interface AgentCapabilityInfrastructure {
    readonly cli: AgentCliPort;
}

export abstract class AgentCapabilityAdapter {
    protected readonly cliAdapter: ProviderCliAdapter;

    constructor(infrastructure: AgentCapabilityInfrastructure) {
        this.cliAdapter = new ProviderCliAdapter(infrastructure.cli);
    }

    protected async execute<T>(request: {
        configuration: AgentConfiguration;
        prompt: string;
        capability: AgentCapability;
        mapCliOutput: (output: string) => T;
    }): Promise<T | undefined> {
        const taskConfiguration = getValidatedAgentConfiguration(request.configuration, request.capability);
        try {
            const output = await this.cliAdapter.execute({
                configuration: taskConfiguration,
                prompt: this.addEffortInstruction(request.prompt, taskConfiguration.effort),
                timeoutMs: AGENT_REQUEST_TIMEOUT_MS,
                capability: request.capability,
            });
            return request.mapCliOutput(output);
        } catch (error: unknown) {
            logError(`Error querying ${taskConfiguration.provider} CLI ${request.capability}: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    private addEffortInstruction(prompt: string, effort: string | undefined): string {
        const normalizedEffort = effort?.trim();
        if (!normalizedEffort) return prompt;
        return `${prompt}\n\nExecution preference: use the configured reasoning effort or model variant "${normalizedEffort}" when supported by the selected agent.`;
    }
}
