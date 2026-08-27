import { parseProgressResponse } from '../progress_response';

describe('parseProgressResponse', () => {
    it('clamps and rounds progress while trimming optional text', () => {
        expect(parseProgressResponse({
            progress: 101.6,
            summary: ' done ',
            reasoning: ' why ',
            remaining: ' next ',
        })).toEqual({ progress: 100, summary: ' done ', reasoning: 'why', remaining: 'next' });
    });

    it('uses safe defaults for malformed responses', () => {
        expect(parseProgressResponse(null)).toEqual({
            progress: 0,
            summary: 'Unable to determine progress.',
            reasoning: '',
            remaining: '',
        });
    });
});
