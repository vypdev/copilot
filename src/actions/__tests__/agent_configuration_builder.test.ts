import { buildAgentTasks } from '../agent_configuration_builder';

describe('buildAgentTasks', () => {
    it('builds the same selected agent for findings and fixer', () => {
        const tasks = buildAgentTasks({
            provider: ' Cursor ',
            modelProvider: ' cursor ',
            model: ' cursor-agent ',
            command: 'agent -p --output-format text --model cursor-agent',
        });

        expect(tasks).toEqual({
            findings: { provider: 'cursor', modelProvider: 'cursor', model: 'cursor-agent', command: 'agent -p --output-format text --model cursor-agent' },
            fixer: { provider: 'cursor', modelProvider: 'cursor', model: 'cursor-agent', command: 'agent -p --output-format text --model cursor-agent' },
        });
    });

    it('supports independent findings and fixer configuration', () => {
        const tasks = buildAgentTasks({
            provider: 'opencode', modelProvider: 'opencode', model: 'server-model', command: 'opencode run --model opencode/server-model',
            fixer: { provider: 'codex', modelProvider: 'openai', model: 'codex-model', command: 'codex exec --model codex-model --config model_provider=openai -' },
        });
        expect(tasks.findings.provider).toBe('opencode');
        expect(tasks.fixer.provider).toBe('codex');
        expect(tasks.fixer.command).toBe('codex exec --model codex-model --config model_provider=openai -');
    });

    it('rejects unknown providers and transports', () => {
        expect(() => buildAgentTasks({ provider: 'unknown', modelProvider: 'openai', model: 'model' })).toThrow('Unsupported agent provider');
        expect(() => buildAgentTasks({ provider: 'codex', modelProvider: 'openai', model: 'model', command: 'codex exec --model model --config model_provider=openai -' })).not.toThrow();
    });

    it('rejects an empty model', () => {
        expect(() => buildAgentTasks({ provider: 'opencode', modelProvider: 'openai', model: ' ', command: 'opencode run --model openai/x' })).toThrow('Agent model must not be empty');
    });

    it('uses provider executable defaults for CLI execution', () => {
        expect(buildAgentTasks({ provider: 'codex', modelProvider: 'openai', model: 'gpt-5-codex', command: 'codex exec --model gpt-5-codex --config model_provider=openai -' }).findings.command).toBe('codex exec --model gpt-5-codex --config model_provider=openai -');
        expect(buildAgentTasks({ provider: 'cursor', modelProvider: 'cursor', model: 'cursor-agent', command: 'agent -p --model cursor-agent' }).findings.command).toBe('agent -p --model cursor-agent');
    });

    it('accepts every supported provider through its CLI', () => {
        expect(() => buildAgentTasks({ provider: 'cursor', modelProvider: 'cursor', model: 'cursor-agent' })).not.toThrow();
    });

    it('propagates model and effort through each provider default command', () => {
        const codex = buildAgentTasks({ provider: 'codex', modelProvider: 'openai', model: 'gpt-5', effort: 'high' }).findings;
        const opencode = buildAgentTasks({ provider: 'opencode', modelProvider: 'openrouter', model: 'qwen', effort: 'low' }).findings;
        const cursor = buildAgentTasks({ provider: 'cursor', modelProvider: 'cursor', model: 'composer-1', effort: 'high' }).findings;

        expect(codex).toMatchObject({ effort: 'high' });
        expect(codex.command).toContain('--model gpt-5');
        expect(codex.command).toContain('model_provider="openai"');
        expect(codex.command).toContain('model_reasoning_effort="high"');
        expect(opencode.command).toBe('opencode run --model openrouter/qwen --variant low');
        expect(cursor).toMatchObject({ modelProvider: 'cursor', model: 'composer-1', effort: 'high' });
        expect(cursor.command).toBe('agent -p --output-format text --model composer-1');
    });

    it('accepts Cursor effort as advisory when a custom command has no provider-specific effort flag', () => {
        expect(() => buildAgentTasks({
            provider: 'cursor',
            modelProvider: 'cursor',
            model: 'composer-1',
            effort: 'high',
            command: 'agent -p --output-format text --model composer-1',
        })).not.toThrow();
    });

    it('rejects unsafe model and effort values before command construction', () => {
        expect(() => buildAgentTasks({ provider: 'codex', modelProvider: 'openai', model: 'gpt 5' })).toThrow('simple model identifier');
        expect(() => buildAgentTasks({ provider: 'codex', modelProvider: 'openai', model: 'gpt-5', effort: 'high; rm' })).toThrow('simple identifier');
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

    it('allows provider identifiers outside the default list when no allowlist is configured', () => {
        const previous = process.env.AGENT_ALLOWED_MODEL_PROVIDERS;
        delete process.env.AGENT_ALLOWED_MODEL_PROVIDERS;
        try {
            expect(buildAgentTasks({ provider: 'opencode', modelProvider: 'custom-cloud', model: 'model' }).findings.modelProvider).toBe('custom-cloud');
        } finally {
            if (previous !== undefined) process.env.AGENT_ALLOWED_MODEL_PROVIDERS = previous;
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
