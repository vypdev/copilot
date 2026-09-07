export type { AgentConfiguration } from '../../domain/agent';
/** Runtime-neutral configuration values supplied by an outer adapter. */
export type AgentConfigurationEnvironment = Readonly<Record<string, string | undefined>>;
