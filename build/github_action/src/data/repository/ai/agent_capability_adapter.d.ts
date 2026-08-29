import { ProviderCliAdapter } from '../provider_cli_adapter';
import type { AgentConfiguration } from '../../../application/ports/agent_configuration_ports';
import type { AgentTask } from '../../model/agent';
import type { AgentCliPort } from '../../../infrastructure/agents/ports/agent_provider_ports';
export interface AgentCapabilityInfrastructure {
    readonly cli: AgentCliPort;
}
export declare abstract class AgentCapabilityAdapter {
    protected readonly cliAdapter: ProviderCliAdapter;
    constructor(infrastructure: AgentCapabilityInfrastructure);
    protected execute<T>(request: {
        configuration: AgentConfiguration;
        prompt: string;
        capability: AgentTask;
        mapCliOutput: (output: string) => T;
    }): Promise<T | undefined>;
    private addEffortInstruction;
}
