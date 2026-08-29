import type { AgentConfiguration, AgentProvider } from '../../domain/agent';
import { defaultAgentCommand } from '../../domain/agent_command';
/** Validates a complete custom command against the selected provider configuration. */
export declare function validateAgentCommand(configuration: AgentConfiguration): void;
export declare function cliInstallationHint(provider: AgentProvider): string;
export { defaultAgentCommand };
