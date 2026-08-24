import { buildAgentTasks } from '../agent_configuration_builder';

describe('buildAgentTasks', () => {
    it('builds the same selected agent for findings and fixer', () => {
        const tasks = buildAgentTasks({
            provider: ' Cursor ',
            modelProvider: ' cursor ',
            model: ' cursor-agent ',
            command: 'cursor-agent --headless',
        });

        expect(tasks).toEqual({
            findings: { provider: 'cursor', modelProvider: 'cursor', model: 'cursor-agent', command: 'cursor-agent --headless' },
            fixer: { provider: 'cursor', modelProvider: 'cursor', model: 'cursor-agent', command: 'cursor-agent --headless' },
        });
    });

    it('supports independent findings and fixer configuration', () => {
        const tasks = buildAgentTasks({
            provider: 'opencode', modelProvider: 'opencode', model: 'server-model', command: 'opencode run --model opencode/server-model',
            fixer: { provider: 'codex', modelProvider: 'openai', model: 'codex-model', command: 'codex' },
        });
        expect(tasks.findings.provider).toBe('opencode');
        expect(tasks.fixer.provider).toBe('codex');
        expect(tasks.fixer.command).toBe('codex');
    });

    it('rejects unknown providers and transports', () => {
        expect(() => buildAgentTasks({ provider: 'unknown', modelProvider: 'openai', model: 'model' })).toThrow('Unsupported agent provider');
        expect(() => buildAgentTasks({ provider: 'codex', modelProvider: 'openai', model: 'model', command: 'codex' })).not.toThrow();
    });

    it('rejects an empty model', () => {
        expect(() => buildAgentTasks({ provider: 'opencode', modelProvider: 'openai', model: ' ', command: 'opencode run --model openai/x' })).toThrow('Agent model must not be empty');
    });

    it('uses provider executable defaults for CLI execution', () => {
        expect(buildAgentTasks({ provider: 'codex', modelProvider: 'openai', model: 'gpt-5-codex', command: 'codex' }).findings.command).toBe('codex');
        expect(buildAgentTasks({ provider: 'cursor', modelProvider: 'cursor', model: 'cursor-agent', command: 'agent' }).findings.command).toBe('agent');
    });

    it('accepts every supported provider through its CLI', () => {
        expect(() => buildAgentTasks({ provider: 'cursor', modelProvider: 'cursor', model: 'cursor-agent', command: 'agent' })).not.toThrow();
    });

    it('rejects a model provider outside the configured allowlist', () => {
        const previous = process.env.AGENT_ALLOWED_MODEL_PROVIDERS;
        process.env.AGENT_ALLOWED_MODEL_PROVIDERS = 'openai';
        try {
            expect(() => buildAgentTasks({ provider: 'opencode', modelProvider: 'opencode', model: 'free-model' })).toThrow('not allowlisted');
        } finally {
            if (previous === undefined) delete process.env.AGENT_ALLOWED_MODEL_PROVIDERS;
            else process.env.AGENT_ALLOWED_MODEL_PROVIDERS = previous;
        }
    });

    it('rejects a model outside the configured qualified-model allowlist', () => {
        const previous = process.env.AGENT_ALLOWED_MODELS;
        process.env.AGENT_ALLOWED_MODELS = 'openai/gpt-5.6-luna';
        try {
            expect(() => buildAgentTasks({ provider: 'opencode', modelProvider: 'openai', model: 'other-model' })).toThrow('not allowlisted');
            expect(() => buildAgentTasks({ provider: 'opencode', modelProvider: 'openai', model: 'gpt-5.6-luna' })).not.toThrow();
        } finally {
            if (previous === undefined) delete process.env.AGENT_ALLOWED_MODELS;
            else process.env.AGENT_ALLOWED_MODELS = previous;
        }
    });
});
