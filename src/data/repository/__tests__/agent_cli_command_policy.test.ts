import { cliInstallationHint, defaultCliCommand } from '../agent_cli_command_policy';

describe('agent CLI command policy', () => {
    it.each([
        ['codex', 'codex exec --ephemeral --skip-git-repo-check -'],
        ['cursor', 'agent -p --output-format text -'],
        ['opencode', 'opencode run'],
    ] as const)('returns a headless stdin command for %s', (provider, expected) => {
        expect(defaultCliCommand(provider)).toBe(expected);
        if (provider !== 'opencode') expect(defaultCliCommand(provider)).toContain('-');
    });

    it('provides actionable installation guidance', () => {
        expect(cliInstallationHint('codex')).toContain('Codex CLI');
        expect(cliInstallationHint('cursor')).toContain('cursor.com/install');
        expect(cliInstallationHint('opencode')).toContain('OpenCode');
    });
});