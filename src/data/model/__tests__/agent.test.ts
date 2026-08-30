import { isAgentConfigurationReady } from '../agent';

describe('agent model boundary', () => {
    it('re-exports the provider-neutral readiness policy', () => {
        expect(isAgentConfigurationReady({
            provider: 'codex',
            model: 'gpt-5.6-luna',
            command: 'codex exec',
        })).toBe(true);
    });

    it('keeps incomplete configurations unavailable to callers', () => {
        expect(isAgentConfigurationReady({
            provider: 'cursor',
            model: 'cursor-agent',
        })).toBe(false);
    });
});
