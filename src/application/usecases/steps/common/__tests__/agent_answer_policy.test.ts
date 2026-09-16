import { extractStructuredAnswer } from '../agent_answer_policy';

describe('agent answer policy', () => {
    it('returns a trimmed answer from a structured response', () => {
        expect(extractStructuredAnswer({ outputLocale: 'en-US', answer: '  done  ' }, 'en-US')).toBe('done');
    });

    it('rejects malformed responses', () => {
        expect(extractStructuredAnswer(undefined, 'en-US')).toBe('');
        expect(extractStructuredAnswer({ outputLocale: 'en-US', answer: 42 }, 'en-US')).toBe('');
        expect(() => extractStructuredAnswer({ outputLocale: 'fr-FR', answer: 'done' }, 'en-US'))
            .toThrow('output-locale-mismatch');
    });
});
