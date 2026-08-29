import { cliInstallationHint, defaultAgentCommand, validateAgentCommand } from '../../../application/policies/agent_command_policy';

describe('agent CLI command policy', () => {
    it('builds complete model-aware defaults for every provider', () => {
        expect(defaultAgentCommand({ provider: 'codex', modelProvider: 'openai', model: 'gpt-5', effort: 'high' })).toBe('codex exec --ephemeral --skip-git-repo-check --model gpt-5 --config \'model_provider="openai"\' --config \'model_reasoning_effort="high"\' -');
        expect(defaultAgentCommand({ provider: 'cursor', modelProvider: 'cursor', model: 'composer-1' })).toBe('agent -p --output-format text --model composer-1');
        expect(defaultAgentCommand({ provider: 'opencode', modelProvider: 'openrouter', model: 'qwen', effort: 'low' })).toBe('opencode run --model openrouter/qwen --variant low');
    });

    it('rejects custom commands that discard model or supported effort settings', () => {
        expect(() => validateAgentCommand({ provider: 'cursor', model: 'model', command: 'agent -p' })).toThrow('select the model');
        expect(() => validateAgentCommand({ provider: 'cursor', model: 'model', command: 'agent -p --model model -' })).toThrow('stdin placeholder');
        expect(() => validateAgentCommand({ provider: 'codex', model: 'model', command: 'codex exec --model model -' })).toThrow('model provider');
        expect(() => validateAgentCommand({ provider: 'opencode', model: 'model', effort: 'high', command: 'opencode run --model openai/model' })).toThrow('select effort');
        expect(() => validateAgentCommand({ provider: 'codex', model: 'model', effort: 'high', command: 'codex exec --model model --config model_provider=openai --config model_reasoning_effort=high -' })).not.toThrow();
        expect(() => validateAgentCommand({ provider: 'cursor', model: 'model', command: 'agent -p --model another' })).toThrow('configured model');
        expect(() => validateAgentCommand({ provider: 'opencode', modelProvider: 'openrouter', model: 'model', command: 'opencode run --model openai/model' })).toThrow('configured model');
        expect(() => validateAgentCommand({ provider: 'opencode', modelProvider: 'openrouter', model: 'model', command: 'opencode run -m openrouter/model' })).not.toThrow();
    });

    it('provides actionable installation guidance', () => {
        expect(cliInstallationHint('codex')).toContain('Codex CLI');
        expect(cliInstallationHint('cursor')).toContain('cursor.com/install');
        expect(cliInstallationHint('opencode')).toContain('OpenCode');
    });
});
