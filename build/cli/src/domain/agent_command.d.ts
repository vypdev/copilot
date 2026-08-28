import type { AgentConfiguration } from './agent';
/** Build the provider-specific, non-interactive command for an agent task. */
export declare function defaultAgentCommand(configuration: Pick<AgentConfiguration, 'provider' | 'modelProvider' | 'model' | 'effort'>): string;
