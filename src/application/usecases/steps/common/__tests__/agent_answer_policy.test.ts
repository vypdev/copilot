import { extractStructuredAnswer } from '../agent_answer_policy';

describe('agent answer policy', () => {
    it('returns a trimmed answer from a structured response', () => {
        expect(extractStructuredAnswer({ answer: '  done  ' })).toBe('done');
    });

    it('rejects malformed responses', () => {
        expect(extractStructuredAnswer(undefined)).toBe('');
        expect(extractStructuredAnswer({ answer: 42 })).toBe('');
    });
});
