import type { AgentCapability, AgentConfiguration } from '../../../domain/agent';
import type { AgentSourceSnapshot } from '../../../domain/agent_source_snapshot';

export interface AgentCliPort {
    execute(request: {
        configuration: AgentConfiguration;
        capability: AgentCapability;
        prompt: string;
        environment?: NodeJS.ProcessEnv;
        timeoutMs: number;
        signal?: AbortSignal;
        cwd?: string;
        maxOutputBytes?: number;
        maxPromptBytes?: number;
        outputSchema?: Record<string, unknown>;
        readonly sourceSnapshot?: AgentSourceSnapshot;
    }): Promise<string>;
}
