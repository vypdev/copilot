import { parseProgressResponse } from '../progress_response';
const scope = { requirements: [{ id: 'R1', quote: 'Implement behavior.' }], exclusions: [] };
describe('parseProgressResponse', () => {
    it('projects only complete requirement-bound facts', () => {
        expect(parseProgressResponse({ outputLocale: 'en-US', progress: 100, requirements: [{ id: 'R1', status: 'supported', evidence: 'source-only', summary: 'Implemented.', remaining: null }] }, 'en-US', scope))
            .toEqual({ progress: 100, summary: '[R1] Implement behavior. — Implemented.', reasoning: '', remaining: '' });
    });
    it('rejects malformed or mismatched locale metadata', () => {
        expect(() => parseProgressResponse(null, 'en-US', scope)).toThrow('response-not-object');
        expect(() => parseProgressResponse({ outputLocale: 'es-ES', progress: 1 }, 'en-US', scope)).toThrow('output-locale-mismatch');
    });
});
