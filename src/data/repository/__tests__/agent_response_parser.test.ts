import { extractPartsByType, extractReasoningFromParts, extractTextFromParts } from '../agent_response_parser';

describe('agent response parser', () => {
    it('extracts text and reasoning parts without exposing malformed values', () => {
        const parts = [
            { type: 'text', text: ' answer ' },
            { type: 'reasoning', text: 'step one' },
            { type: 'reasoning', text: 'step two' },
            { type: 'text', text: 42 },
        ];

        expect(extractTextFromParts(parts)).toBe('answer');
        expect(extractReasoningFromParts(parts)).toBe('step one\n\nstep two');
        expect(extractPartsByType(null, 'text', '')).toBe('');
    });
});
