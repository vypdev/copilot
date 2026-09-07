import { AGENT_REQUEST_TIMEOUT_MS } from './agent_constants';
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
        outputSchema?: Record<string, unknown>;
    }): Promise<T | undefined> {
        const taskConfiguration = getValidatedAgentConfiguration(request.configuration, request.capability);
        const output = await this.cliAdapter.execute({
            configuration: taskConfiguration,
            prompt: this.addEffortInstruction(request.prompt, taskConfiguration.effort),
            timeoutMs: AGENT_REQUEST_TIMEOUT_MS,
            capability: request.capability,
            ...(request.outputSchema ? { outputSchema: request.outputSchema } : {}),
        });
        return request.mapCliOutput(output);
    }

    private addEffortInstruction(prompt: string, effort: string | undefined): string {
        const normalizedEffort = effort?.trim();
        if (!normalizedEffort) return prompt;
        return `${prompt}\n\nExecution preference: use the configured reasoning effort or model variant "${normalizedEffort}" when supported by the selected agent.`;
    }
}
