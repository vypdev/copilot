import type { AgentCapability, AgentConfiguration } from '../model/agent';
export declare function isValidAgentConfiguration(configuration: AgentConfiguration): boolean;
export declare function getValidatedAgentConfiguration(configuration: AgentConfiguration, task: AgentCapability): AgentConfiguration;
