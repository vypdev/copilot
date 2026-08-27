import type { AgentProvider } from '../model/agent';

/**
 * Provider-specific headless commands. The prompt is supplied through stdin.
 * Keep these as argv-safe command strings; AgentCliClient never invokes a shell.
 */
export function defaultCliCommand(provider: AgentProvider): string {
    switch (provider) {
        case 'codex':
            return 'codex exec --ephemeral --skip-git-repo-check -';
        case 'cursor':
            return 'agent -p --output-format text -';
        case 'opencode':
            return 'opencode run';
    }
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