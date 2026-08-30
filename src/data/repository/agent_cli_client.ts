import { parseAgentCommand } from '../../application/policies/agent_command_parser';
import { AgentCliError, type AgentCliRequest } from './agent_cli_contracts';
import { runAgentCli } from './agent_cli_execution';

export type { AgentCliRequest, AgentCliError } from './agent_cli_contracts';

export class AgentCliClient {
    async execute(request: AgentCliRequest): Promise<string> {
        validateRequest(request);
        const parsed = parseCommand(request.command);
        const promptMode = request.promptMode ?? 'stdin';
        if (promptMode !== 'stdin' && promptMode !== 'argv') {
            throw new AgentCliError('Agent CLI promptMode must be stdin or argv.', 'configuration');
        }
        return runAgentCli({
            ...request,
            ...parsed,
            promptMode,
            maxOutputBytes: request.maxOutputBytes ?? 4 * 1024 * 1024,
        });
    }
}

function validateRequest(request: AgentCliRequest): void {
    if (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0) {
        throw new AgentCliError('Agent CLI timeout must be a finite positive number.', 'configuration');
    }
    if (request.maxOutputBytes !== undefined && (!Number.isFinite(request.maxOutputBytes) || request.maxOutputBytes <= 0)) {
        throw new AgentCliError('Agent CLI maxOutputBytes must be a finite positive number.', 'configuration');
    }
}

function parseCommand(command: string): { executable: string; args: string[] } {
    try {
        const parsed = parseAgentCommand(command);
        return { executable: parsed.executable, args: parsed.args };
    } catch (error: unknown) {
        throw new AgentCliError(error instanceof Error ? error.message : String(error), 'configuration');
    }
}
