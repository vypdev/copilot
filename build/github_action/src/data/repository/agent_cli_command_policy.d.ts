import type { AgentConfiguration, AgentProvider } from '../model/agent';
export { defaultAgentCommand } from '../../domain/agent_command';
/**
 * Custom commands are full overrides, so validate that they cannot silently
 * discard the selected model or supported effort setting.
 */
export declare function validateAgentCommand(configuration: AgentConfiguration): void;
export declare function cliInstallationHint(provider: AgentProvider): string;
