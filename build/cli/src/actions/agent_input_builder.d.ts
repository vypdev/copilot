export type AgentInputReader = (key: string) => string | undefined;
export declare function buildAgentTasksFromInputs(read: AgentInputReader): import("../data/model/agent").AgentTaskConfiguration;
export declare function buildAgentTasksFromValues(values: Record<string, unknown>): import("../data/model/agent").AgentTaskConfiguration;
