import { readGithubActionAiInputs } from '../../../actions/github_action_ai_inputs';
import { resolveBugbotShadowConfiguration } from '../bugbot_shadow_configuration_policy';

const actionInputs = (options: Record<string, string> = {}, env: Record<string, string> = {}) =>
    readGithubActionAiInputs(key => options[key] ?? '', env);
const resolve = (options: Record<string, string> = {}, env: Record<string, string> = {}) => {
    const result = actionInputs({ 'bugbot-verification-mode': 'shadow', ...options }, env);
    const detector = result.requestedAgentTasks.reviewer ?? result.requestedAgentTasks.findings;
    return resolveBugbotShadowConfiguration(detector, result.bugbotReviewConfiguration.shadowVerification!);
};

describe('installed Bugbot shadow configuration', () => {
    it('is disabled by default and rejects enforced mode', () => {
        expect(actionInputs({ 'bugbot-verifier-provider': 'anthropic' }).bugbotReviewConfiguration.shadowVerification).toBeUndefined();
        expect(() => actionInputs({ 'bugbot-verification-mode': 'enforced' })).toThrow(/qualified/);
        expect(() => actionInputs({ 'bugbot-verification-mode': 'unknown' })).toThrow(/disabled or shadow/);
    });

    it('accepts enforcement only with a valid trusted policy matching the configured mode', () => {
        const authority = { mode: 'enforced', policyDigest: 'e'.repeat(64), generation: 1,
            workflowId: 42, sourceAppId: 15368 } as const;
        const read = (key: string) => key === 'bugbot-verification-mode' ? 'enforced' : '';
        expect(readGithubActionAiInputs(read, {}, authority).bugbotReviewConfiguration.shadowVerification).toBeDefined();
        expect(() => readGithubActionAiInputs(read, {}, { ...authority, generation: 0 })).toThrow(/malformed/);
        expect(() => readGithubActionAiInputs(read, {}, { ...authority, mode: 'disabled' })).toThrow(/does not match/);
    });

    it('inherits the effective default or reviewer, while keeping Bugbot depth distinct', () => {
        expect(resolve()).toEqual({ provider: 'codex', modelProvider: 'openai', model: 'gpt-6-luna' });
        expect(resolve({ 'reviewer-model': 'gpt-6.1-sol', 'reviewer-effort': 'xhigh', 'bugbot-effort': 'smart' }))
            .toEqual({ provider: 'codex', modelProvider: 'openai', model: 'gpt-6.1-sol', effort: 'xhigh' });
        expect(resolve({ 'findings-model': 'fallback-model', 'findings-effort': 'low' }))
            .toMatchObject({ model: 'fallback-model', effort: 'low' });
    });

    it('accepts a Codex override only within the allowlists and compatible effort values', () => {
        const override = { 'reviewer-model': 'gpt-6-luna', 'reviewer-effort': 'xhigh',
            'bugbot-verifier-model': 'gpt-6.1-sol' };
        expect(resolve(override, { AGENT_ALLOWED_MODELS: 'openai/gpt-6.1-sol' }))
            .toMatchObject({ model: 'gpt-6.1-sol', effort: 'xhigh' });
        expect(() => resolve(override, { AGENT_ALLOWED_MODELS: 'gpt-6-luna' })).toThrow(/not allowlisted/);
        expect(() => resolve({ ...override, 'bugbot-verifier-effort': 'max' })).toThrow(/Codex/);
        expect(() => resolve({ ...override, 'bugbot-verifier-model-provider': 'anthropic' })).toThrow(/openai/);
    });

    it.each([['openai', 'gpt-6-luna', 'high'], ['anthropic', 'claude-sonnet-4-6', 'max']])(
        'resolves the OpenCode %s backend without inheriting the previous backend effort',
        (backend, model, effort) => {
            const values = { 'reviewer-effort': 'xhigh', 'bugbot-verifier-provider': 'opencode',
                'bugbot-verifier-model-provider': backend, 'bugbot-verifier-model': model };
            expect(resolve(values)).toEqual({ provider: 'opencode', modelProvider: backend, model });
            expect(resolve({ ...values, 'bugbot-verifier-effort': effort })).toEqual({
                provider: 'opencode', modelProvider: backend, model, effort,
            });
            expect(() => resolve({ ...values, 'bugbot-verifier-model': '' })).toThrow(/explicit compatible model/);
        },
    );

    it('selects Cursor by catalog model and rejects a separate effort', () => {
        const values = { 'reviewer-effort': 'xhigh', 'bugbot-verifier-provider': 'cursor',
            'bugbot-verifier-model': 'reasoning-model' };
        expect(resolve(values)).toEqual({ provider: 'cursor', modelProvider: 'cursor', model: 'reasoning-model' });
        expect(() => resolve({ ...values, 'bugbot-verifier-effort': 'xhigh' })).toThrow(/catalog model ID/);
        expect(() => resolve({ 'bugbot-verifier-provider': 'anthropic' })).toThrow(/Unsupported agent provider/);
    });
});
