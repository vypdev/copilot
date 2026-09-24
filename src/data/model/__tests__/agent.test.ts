import { isAgentConfigurationReady } from '../agent';
import { DEFAULT_AGENT_MODEL } from '../../../domain/agent';

describe('agent model boundary', () => {
    it('uses the reviewed Codex Luna model as the common fallback', () => {
        expect(DEFAULT_AGENT_MODEL).toBe('gpt-6-luna');
    });

    it('re-exports the provider-neutral readiness policy', () => {
        expect(isAgentConfigurationReady({
            provider: 'codex',
            model: 'gpt-5.6-luna',
        })).toBe(true);
    });

    it('keeps incomplete configurations unavailable to callers', () => {
        expect(isAgentConfigurationReady({
            provider: 'cursor',
            model: '',
        })).toBe(false);
    });
});
