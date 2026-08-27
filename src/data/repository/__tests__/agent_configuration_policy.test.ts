import { isValidAgentConfiguration } from '../agent_configuration_policy';

describe('isValidAgentConfiguration', () => {
    it('accepts a complete CLI configuration', () => {
        expect(isValidAgentConfiguration({ provider: 'opencode', model: 'gpt-5', command: 'opencode run' })).toBe(true);
    });

    it('rejects unsupported, missing, or CLI configurations', () => {
        expect(isValidAgentConfiguration({ provider: 'cursor', model: 'gpt-5', command: 'agent' })).toBe(true);
        expect(isValidAgentConfiguration({ provider: 'opencode', model: '' })).toBe(false);
        expect(isValidAgentConfiguration({ provider: 'opencode', model: 'gpt-5', command: '' })).toBe(false);
    });
});
