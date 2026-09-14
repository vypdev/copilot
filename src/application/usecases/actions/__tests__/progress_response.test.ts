import { parseProgressResponse } from '../progress_response';

describe('parseProgressResponse', () => {
    it('clamps and rounds progress while trimming optional text', () => {
        expect(parseProgressResponse({
            outputLocale: 'en-US',
            progress: 101.6,
            summary: ' done ',
            reasoning: ' why ',
            remaining: ' next ',
        }, 'en-US')).toEqual({ progress: 100, summary: ' done ', reasoning: 'why', remaining: 'next' });
    });

    it('rejects malformed or mismatched locale metadata', () => {
        expect(() => parseProgressResponse(null, 'en-US')).toThrow('response-not-object');
        expect(() => parseProgressResponse({ outputLocale: 'es-ES', progress: 1 }, 'en-US'))
            .toThrow('output-locale-mismatch');
    });
});
