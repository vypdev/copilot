import { buildAgentPrompt } from '../agent_prompt_policy';

describe('agent prompt policy', () => {
    it('returns the original prompt without a schema request', () => {
        expect(buildAgentPrompt('hello', false, { type: 'object' }, 'response')).toBe('hello');
    });

    it('builds the strict JSON schema prompt', () => {
        expect(buildAgentPrompt('hello', true, { type: 'object' }, 'answer')).toContain(
            'schema (name: answer)',
        );
        expect(buildAgentPrompt('hello', true, { type: 'object' }, 'answer')).toContain('User request:\nhello');
    });
});
