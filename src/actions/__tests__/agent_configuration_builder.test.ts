import { buildAgentTasks } from '../agent_configuration_builder';

describe('buildAgentTasks', () => {
    it('builds the same structured agent for findings and fixer', () => {
        const tasks = buildAgentTasks({
            provider: ' Cursor ', modelProvider: ' cursor ', model: ' cursor-agent ', executable: 'agent',
        });
        expect(tasks).toEqual({
            findings: { provider: 'cursor', modelProvider: 'cursor', model: 'cursor-agent', executable: 'agent' },
            fixer: { provider: 'cursor', modelProvider: 'cursor', model: 'cursor-agent', executable: 'agent' },
        });
    });

    it('supports independent role configuration and executable selection', () => {
        const tasks = buildAgentTasks({
            provider: 'opencode', modelProvider: 'opencode', model: 'server-model', executable: 'opencode',
            fixer: { provider: 'codex', modelProvider: 'openai', model: 'codex-model', executable: '/opt/agents/codex' },
        });
        expect(tasks.findings).toMatchObject({ provider: 'opencode', executable: 'opencode' });
        expect(tasks.fixer).toMatchObject({ provider: 'codex', executable: '/opt/agents/codex' });
    });

    it('rejects unknown providers and empty models', () => {
        expect(() => buildAgentTasks({ provider: 'unknown', modelProvider: 'openai', model: 'model' })).toThrow('Unsupported agent provider');
        expect(() => buildAgentTasks({ provider: 'opencode', modelProvider: 'openai', model: ' ' })).toThrow('Agent model must not be empty');
    });

    it('rejects arguments, wrappers, relative paths, and alternate basenames', () => {
        for (const executable of ['codex exec', './codex', '/opt/agents/wrapper', 'env']) {
            expect(() => buildAgentTasks({ provider: 'codex', modelProvider: 'openai', model: 'gpt-5', executable })).toThrow('Agent executable');
        }
    });

    it('keeps provider argv out of structured configuration', () => {
        const codex = buildAgentTasks({ provider: 'codex', modelProvider: 'openai', model: 'gpt-5', effort: 'high' }).findings;
        const opencode = buildAgentTasks({ provider: 'opencode', modelProvider: 'openrouter', model: 'qwen', effort: 'low' }).findings;
        const cursor = buildAgentTasks({ provider: 'cursor', modelProvider: 'cursor', model: 'composer-1', effort: 'high' }).findings;
        expect(codex).toEqual({ provider: 'codex', modelProvider: 'openai', model: 'gpt-5', effort: 'high' });
        expect(opencode).toEqual({ provider: 'opencode', modelProvider: 'openrouter', model: 'qwen', effort: 'low' });
        expect(cursor).toEqual({ provider: 'cursor', modelProvider: 'cursor', model: 'composer-1', effort: 'high' });
    });

    it('rejects unsafe model and effort values', () => {
        expect(() => buildAgentTasks({ provider: 'codex', modelProvider: 'openai', model: 'gpt 5' })).toThrow('simple model identifier');
        expect(() => buildAgentTasks({ provider: 'codex', modelProvider: 'openai', model: 'gpt-5', effort: 'high; rm' })).toThrow('simple identifier');
    });

    it('enforces configured provider and model allowlists', () => {
        const previousProviders = process.env.AGENT_ALLOWED_MODEL_PROVIDERS;
        const previousModels = process.env.AGENT_ALLOWED_MODELS;
        process.env.AGENT_ALLOWED_MODEL_PROVIDERS = 'openai';
        process.env.AGENT_ALLOWED_MODELS = 'openai/gpt-5.6-luna';
        try {
            expect(() => buildAgentTasks({ provider: 'opencode', modelProvider: 'opencode', model: 'free-model' })).toThrow('not allowlisted');
            expect(() => buildAgentTasks({ provider: 'opencode', modelProvider: 'openai', model: 'other-model' })).toThrow('not allowlisted');
            expect(() => buildAgentTasks({ provider: 'opencode', modelProvider: 'openai', model: 'gpt-5.6-luna' })).not.toThrow();
        } finally {
            if (previousProviders === undefined) delete process.env.AGENT_ALLOWED_MODEL_PROVIDERS;
            else process.env.AGENT_ALLOWED_MODEL_PROVIDERS = previousProviders;
            if (previousModels === undefined) delete process.env.AGENT_ALLOWED_MODELS;
            else process.env.AGENT_ALLOWED_MODELS = previousModels;
        }
    });
});
