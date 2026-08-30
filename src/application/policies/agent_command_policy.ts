import type { AgentConfiguration, AgentProvider } from '../../domain/agent';
import { defaultAgentCommand } from '../../domain/agent_command';
import { validateConfiguredAgentCommand } from './agent_command_validation_policy';

/** Validates a complete custom command against the selected provider configuration. */
export function validateAgentCommand(configuration: AgentConfiguration): void {
    validateConfiguredAgentCommand(configuration);
}

export function cliInstallationHint(provider: AgentProvider): string {
    switch (provider) {
        case 'codex':
            return 'Install the OpenAI Codex CLI and verify `codex exec --help` on the runner.';
        case 'cursor':
            return 'Install the Cursor CLI from https://cursor.com/install and verify `agent --help` on the runner.';
        case 'opencode':
            return 'Install OpenCode and verify `opencode run --help` on the runner.';
    }
}

export { defaultAgentCommand };
