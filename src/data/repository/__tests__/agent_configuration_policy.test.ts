import { isValidAgentConfiguration } from '../agent_configuration_policy';

describe('isValidAgentConfiguration', () => {
    it('accepts a complete CLI configuration', () => {
        expect(isValidAgentConfiguration({ provider: 'opencode', model: 'gpt-5', command: 'opencode run --model openai/gpt-5' })).toBe(true);
    });

    it('rejects unsupported, missing, or CLI configurations', () => {
        expect(isValidAgentConfiguration({ provider: 'cursor', model: 'gpt-5', command: 'agent -p --model gpt-5' })).toBe(true);
        expect(isValidAgentConfiguration({ provider: 'opencode', model: '' })).toBe(false);
        expect(isValidAgentConfiguration({ provider: 'opencode', model: 'gpt-5', command: '' })).toBe(false);
        expect(isValidAgentConfiguration({ provider: 'not-a-provider' as never, model: 'gpt-5', command: 'agent -p --model gpt-5' })).toBe(false);
    });
});
