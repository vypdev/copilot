import { AGENT_REQUEST_TIMEOUT_MS } from '../../../utils/constants';
import { logError } from '../../../utils/logger';
import { ProviderCliAdapter } from '../provider_cli_adapter';

import { getValidatedAgentConfiguration } from '../agent_configuration_policy';

import type { AgentConfiguration } from '../../../application/ports/agent_configuration_ports';
import type { AgentTask } from '../../model/agent';
import type { AgentCliPort } from '../../../infrastructure/agents/ports/agent_provider_ports';

export interface AgentCapabilityInfrastructure {
    readonly cli: AgentCliPort;

}

export abstract class AgentCapabilityAdapter {
    protected readonly cliAdapter: ProviderCliAdapter;


    protected constructor(infrastructure: AgentCapabilityInfrastructure) {
        this.cliAdapter = new ProviderCliAdapter(infrastructure.cli);

    }

    protected async execute<T>(request: {
        configuration: AgentConfiguration;
        prompt: string;
        agent: string;
        capability: AgentTask;
        mapCliOutput: (output: string) => T;
        mapServerResponse: (response: { parts: unknown; sessionId: string }) => T;
    }): Promise<T | undefined> {
        const taskConfiguration = getValidatedAgentConfiguration(request.configuration, request.capability);
        try {
            const output = await this.cliAdapter.execute({
                configuration: taskConfiguration,
                prompt: request.prompt,
                timeoutMs: AGENT_REQUEST_TIMEOUT_MS,
            });
            return request.mapCliOutput(output);
        } catch (error: unknown) {
            logError(`Error querying ${taskConfiguration.provider} CLI ${request.capability}: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }
}
