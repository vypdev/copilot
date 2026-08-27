import { interpretFixerResponse } from '../agent_fixer_response_policy';

describe('interpretFixerResponse', () => {
    it('maps server parts and preserves the provider session', () => {
        expect(interpretFixerResponse([{ type: 'text', text: 'answer' }], 'session-1')).toEqual({ text: 'answer', sessionId: 'session-1' });
    });

    it('rejects an empty response', () => {
        expect(() => interpretFixerResponse([], 'session-1')).toThrow('Empty response text');
    });
});
