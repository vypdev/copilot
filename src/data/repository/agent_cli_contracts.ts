import type { AgentCapability, AgentConfiguration } from '../model/agent';
import type { AgentExecutionExitDiagnostic, AgentExecutionPreflightStage } from '../../application/ports/agent_execution_observation_ports';

export interface AgentCliRequest {
    configuration: AgentConfiguration;
    capability: AgentCapability;
    prompt: string;
    environment?: NodeJS.ProcessEnv;
    timeoutMs: number;
    signal?: AbortSignal;
    cwd?: string;
    maxOutputBytes?: number;
    maxPromptBytes?: number;
    /** Native final-response schema, used only by providers that support it. */
    outputSchema?: Record<string, unknown>;
}

export class AgentCliError extends Error {
    preflightStage?: AgentExecutionPreflightStage;
    constructor(
        message: string,
        readonly category: 'configuration' | 'timeout' | 'cancelled' | 'process' | 'output',
        readonly retryable = false,
        readonly exitCode?: number,
        readonly exitDiagnostic?: AgentExecutionExitDiagnostic,
    ) {
        super(message);
        this.name = 'AgentCliError';
    }
}
