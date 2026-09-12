import { Ai } from '../ai';
import { isAgentConfigurationReady } from '../agent';

describe('Ai', () => {
    it('exposes independent task configurations', () => {
        const ai = new Ai('unused', 'model', false, [], false, 'low', 10, [], {
            findings: { provider: 'codex', model: 'gpt-5-codex', executable: 'codex' },
            fixer: { provider: 'cursor', model: 'cursor-agent', executable: 'agent' },
        });
        expect(ai.getAgentConfiguration('findings')).toEqual({ provider: 'codex', model: 'gpt-5-codex', executable: 'codex' });
        expect(ai.getAgentConfiguration('fixer')).toEqual({ provider: 'cursor', model: 'cursor-agent', executable: 'agent' });
    });

    it('defaults both tasks to structured Codex configuration', () => {
        const ai = new Ai('unused', 'opencode/model', false, [], false, 'low', 10);
        const expected = { provider: 'codex', modelProvider: 'openai', model: 'opencode/model' };
        expect(ai.getAgentConfiguration('findings')).toEqual(expected);
        expect(ai.getAgentConfiguration('fixer')).toEqual(expected);
    });

    it('keeps general AI and bugbot settings available', () => {
        const ai = new Ai('unused', 'model', true, ['a', 'b'], false, 'error', 5, ['pnpm test']);
        expect(ai.getPullRequestDescriptionMode()).toBe('replace');
        expect(ai.getAiMembersOnly()).toBe(true);
        expect(ai.getAiIgnoreFiles()).toEqual(['a', 'b']);
        expect(ai.getBugbotFixVerifyCommands()).toEqual(['pnpm test']);
    });

    it('requires a model while the manifest supplies the default executable', () => {
        expect(isAgentConfigurationReady({ provider: 'opencode', model: 'm' })).toBe(true);
        expect(isAgentConfigurationReady({ provider: 'codex', model: 'm', executable: 'codex' })).toBe(true);
        expect(isAgentConfigurationReady({ provider: 'cursor', model: '' })).toBe(false);
        expect(isAgentConfigurationReady(undefined)).toBe(false);
    });
});
