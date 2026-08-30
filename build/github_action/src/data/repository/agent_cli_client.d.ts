import { type AgentCliRequest } from './agent_cli_contracts';
export type { AgentCliRequest, AgentCliError } from './agent_cli_contracts';
export declare class AgentCliClient {
    execute(request: AgentCliRequest): Promise<string>;
}
