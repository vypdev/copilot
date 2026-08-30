import { type AgentCliRequest } from './agent_cli_contracts';
export interface PreparedAgentCliRequest extends AgentCliRequest {
    executable: string;
    args: string[];
    promptMode: 'stdin' | 'argv';
    maxOutputBytes: number;
}
export declare function runAgentCli(request: PreparedAgentCliRequest): Promise<string>;
