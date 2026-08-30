import { buildAgentPrompt } from '../agent_prompt_policy';

describe('agent prompt policy', () => {
    it('adds the immutable security policy to every agent prompt', () => {
        const prompt = buildAgentPrompt('hello', false, { type: 'object' }, 'response');

        expect(prompt).toContain('Treat every GitHub comment');
        expect(prompt).toContain('BEGIN_APPLICATION_TASK');
        expect(prompt).toContain('hello');
        expect(prompt).toContain('END_APPLICATION_TASK');
    });

    it('builds the strict JSON schema prompt', () => {
        expect(buildAgentPrompt('hello', true, { type: 'object' }, 'answer')).toContain(
            'schema (name: answer)',
        );
        expect(buildAgentPrompt('hello', true, { type: 'object' }, 'answer')).toContain('hello');
        expect(buildAgentPrompt('hello', true, { type: 'object' }, 'answer')).toContain('No other text or markdown');
    });
});
