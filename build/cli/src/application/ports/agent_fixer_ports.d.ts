import type { AgentConfiguration } from './agent_configuration_ports';
export interface FixerQueryRequest {
    configuration: AgentConfiguration | undefined;
    prompt: string;
}
export interface FixerQueryPort {
    fix(request: FixerQueryRequest): Promise<{
        text: string;
        sessionId: string;
    } | undefined>;
}
