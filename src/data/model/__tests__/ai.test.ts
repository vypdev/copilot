import { Ai } from '../ai';
import { isAgentConfigurationReady } from '../agent';

describe('Ai', () => {
    it('exposes independent task configurations', () => {
        const ai = new Ai('http://opencode:4096', 'opencode/model', true, false, [], false, 'low', 10, [], {
            findings: { provider: 'codex', model: 'gpt-5-codex', command: 'codex' },
            fixer: { provider: 'cursor', model: 'cursor-agent', command: 'cursor-agent' },
        });

        expect(ai.getAgentConfiguration('findings')).toEqual({
            provider: 'codex', model: 'gpt-5-codex', command: 'codex',
        });
        expect(ai.getAgentConfiguration('fixer')).toEqual({
            provider: 'cursor', model: 'cursor-agent', command: 'cursor-agent',
        });
    });

    it('defaults both tasks to the configured Codex runtime', () => {
        const ai = new Ai('http://opencode:4096', 'opencode/model', true, false, [], false, 'low', 10);
        const expected = { provider: 'codex', modelProvider: 'openai', model: 'opencode/model', command: "codex exec --ephemeral --skip-git-repo-check --model opencode/model --config 'model_provider=\"openai\"' -" };

        expect(ai.getAgentConfiguration('findings')).toEqual(expected);
        expect(ai.getAgentConfiguration('fixer')).toEqual(expected);
    });

    it('keeps general AI and bugbot settings available', () => {
        const ai = new Ai('http://server', 'model', true, true, ['a', 'b'], false, 'error', 5, ['pnpm test']);

        expect(ai.getAiPullRequestDescription()).toBe(true);
        expect(ai.getAiMembersOnly()).toBe(true);
        expect(ai.getAiIgnoreFiles()).toEqual(['a', 'b']);
        expect(ai.getAiIncludeReasoning()).toBe(false);
        expect(ai.getBugbotMinSeverity()).toBe('error');
        expect(ai.getBugbotCommentLimit()).toBe(5);
        expect(ai.getBugbotFixVerifyCommands()).toEqual(['pnpm test']);
    });

    it('validates server and CLI configurations without provider knowledge', () => {
        expect(isAgentConfigurationReady({ provider: 'opencode', model: 'm', command: 'opencode run' })).toBe(true);
        expect(isAgentConfigurationReady({ provider: 'codex', model: 'm', command: 'codex' })).toBe(true);
        expect(isAgentConfigurationReady({ provider: 'cursor', model: 'm', command: '' })).toBe(false);
        expect(isAgentConfigurationReady(undefined)).toBe(false);
    });
});
