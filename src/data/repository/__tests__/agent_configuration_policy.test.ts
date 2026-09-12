import { isValidAgentConfiguration } from '../agent_configuration_policy';

describe('isValidAgentConfiguration', () => {
    it('accepts complete structured configuration and validated executables', () => {
        expect(isValidAgentConfiguration({ provider: 'opencode', model: 'gpt-5' })).toBe(true);
        expect(isValidAgentConfiguration({ provider: 'cursor', modelProvider: 'cursor', model: 'gpt-5', executable: '/opt/agents/agent' })).toBe(true);
    });

    it('rejects unsupported tuples, missing models, and command-shaped executables', () => {
        expect(isValidAgentConfiguration({ provider: 'cursor', modelProvider: 'openai', model: 'gpt-5' })).toBe(false);
        expect(isValidAgentConfiguration({ provider: 'opencode', model: '' })).toBe(false);
        expect(isValidAgentConfiguration({ provider: 'not-a-provider' as never, model: 'gpt-5' })).toBe(false);
        expect(isValidAgentConfiguration({ provider: 'codex', model: 'gpt-5', executable: 'codex exec' })).toBe(false);
    });
});
