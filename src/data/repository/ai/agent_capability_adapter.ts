import { applyAgentEffortInstruction } from '../../../application/policies/agent_prompt_envelope_policy';
import { AGENT_REQUEST_TIMEOUT_MS } from './agent_constants';
import { AgentCliError } from '../agent_cli_contracts';
import { ApplicationError, APPLICATION_ERROR_METADATA } from '../../../application/errors/application_error';
import { agentExecutionFailureCode } from '../../../application/policies/agent_execution_failure_policy';

import { getValidatedAgentConfiguration } from '../agent_configuration_policy';

import type { AgentConfiguration } from '../../../application/ports/agent_configuration_ports';
import type { AgentCapability } from '../../../domain/agent';
import type { AgentCliPort } from '../../../infrastructure/agents/ports/agent_provider_ports';

export interface AgentCapabilityInfrastructure {
    readonly cli: AgentCliPort;
}

export abstract class AgentCapabilityAdapter {
    protected readonly cliAdapter: AgentCliPort;

    constructor(infrastructure: AgentCapabilityInfrastructure) {
        this.cliAdapter = infrastructure.cli;
    }

    protected async execute<T>(request: {
        configuration: AgentConfiguration;
        prompt: string;
        capability: AgentCapability;
        mapCliOutput: (output: string) => T;
        outputSchema?: Record<string, unknown>;
    }): Promise<T | undefined> {
        const taskConfiguration = getValidatedAgentConfiguration(request.configuration, request.capability);
        let output: string;
        try {
            output = await this.cliAdapter.execute({
            configuration: taskConfiguration,
            prompt: applyAgentEffortInstruction(request.prompt, taskConfiguration.effort),
            timeoutMs: AGENT_REQUEST_TIMEOUT_MS,
            capability: request.capability,
            ...(request.outputSchema ? { outputSchema: request.outputSchema } : {}),
            });
        } catch (error) {
            if (!(error instanceof AgentCliError)) throw error;
            const code = agentExecutionFailureCode(error.category);
            throw new ApplicationError(code, 'The configured agent did not complete its operation.', {
                cause: error, retryable: error.retryable && APPLICATION_ERROR_METADATA[code].retryable,
            });
        }
        return request.mapCliOutput(output);
    }

}
