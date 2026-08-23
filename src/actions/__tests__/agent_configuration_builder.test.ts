import { buildAgentTasks } from '../agent_configuration_builder';

describe('buildAgentTasks', () => {
    it('builds the same selected agent for findings and fixer', () => {
        const tasks = buildAgentTasks({
            provider: ' Cursor ',
            transport: 'cli',
            model: ' cursor-agent ',
            command: 'cursor-agent --headless',
        });

        expect(tasks).toEqual({
            findings: { provider: 'cursor', transport: 'cli', model: 'cursor-agent', command: 'cursor-agent --headless' },
            fixer: { provider: 'cursor', transport: 'cli', model: 'cursor-agent', command: 'cursor-agent --headless' },
        });
    });

    it('supports independent findings and fixer configuration', () => {
        const tasks = buildAgentTasks({
            provider: 'opencode', transport: 'server', model: 'server-model', serverUrl: 'http://localhost',
            fixer: { provider: 'codex', transport: 'cli', model: 'codex-model' },
        });
        expect(tasks.findings.provider).toBe('opencode');
        expect(tasks.fixer.provider).toBe('codex');
        expect(tasks.fixer.command).toBe('codex exec --ephemeral --skip-git-repo-check -');
    });

    it('rejects unknown providers and transports', () => {
        expect(() => buildAgentTasks({ provider: 'unknown', transport: 'server', model: 'model' })).toThrow('Unsupported agent provider');
        expect(() => buildAgentTasks({ provider: 'codex', transport: 'unknown', model: 'model' })).toThrow('Unsupported agent transport');
    });

    it('rejects an empty model', () => {
        expect(() => buildAgentTasks({ provider: 'opencode', transport: 'server', model: ' ' })).toThrow('Agent model must not be empty');
    });

    it('uses provider executable defaults for CLI transport', () => {
        expect(buildAgentTasks({ provider: 'codex', transport: 'cli', model: 'gpt-5-codex' }).findings.command).toBe('codex exec --ephemeral --skip-git-repo-check -');
        expect(buildAgentTasks({ provider: 'cursor', transport: 'cli', model: 'cursor-agent' }).findings.command).toBe('agent -p --output-format text -');
    });

    it('rejects server transport for providers without a server adapter', () => {
        expect(() => buildAgentTasks({ provider: 'cursor', transport: 'server', model: 'cursor-agent', serverUrl: 'http://localhost' })).toThrow(
            'Agent server transport is only supported by opencode'
        );
    });
});
