import type { AgentConfiguration, AgentTask, AgentTaskConfiguration } from '../model/agent';
export declare function isValidAgentConfiguration(configuration: AgentConfiguration): boolean;
export declare function getValidatedAgentConfiguration(configuration: AgentTaskConfiguration[AgentTask], task: AgentTask): AgentTaskConfiguration[AgentTask];
