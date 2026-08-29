import type { AgentTaskConfiguration } from '../data/model/agent';
/** Validates and, when requested by the runtime, provisions the selected agent CLIs. */
export declare function prepareGithubAgentRuntime(agentTasks: AgentTaskConfiguration): void;
