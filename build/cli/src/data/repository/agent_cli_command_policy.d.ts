import type { AgentProvider } from '../model/agent';
/**
 * Provider-specific headless commands. The prompt is supplied through stdin.
 * Keep these as argv-safe command strings; AgentCliClient never invokes a shell.
 */
export declare function defaultCliCommand(provider: AgentProvider): string;
export declare function cliInstallationHint(provider: AgentProvider): string;
