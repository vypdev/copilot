export type AgentInputReader = (key: string) => string | undefined;
export declare function buildAgentTasksFromInputs(read: AgentInputReader): import("../domain/agent").AgentTaskConfiguration;
export declare function buildAgentTasksFromValues(values: Record<string, unknown>): import("../domain/agent").AgentTaskConfiguration;
