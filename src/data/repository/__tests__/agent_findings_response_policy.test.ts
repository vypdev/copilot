import { interpretFindingsResponse } from '../agent_findings_response_policy';

describe('interpretFindingsResponse', () => {
    it('returns text from provider parts', () => {
        expect(interpretFindingsResponse([{ type: 'text', text: 'answer' }], {})).toBe('answer');
    });

    it('parses JSON and keeps reasoning when requested', () => {
        expect(interpretFindingsResponse([
            { type: 'reasoning', text: 'because' },
            { type: 'text', text: '{"ok":true}' },
        ], { expectJson: true, schema: {}, includeReasoning: true })).toEqual({ ok: true, reasoning: 'because' });
    });

    it('accepts CLI text for JSON parsing', () => {
        expect(interpretFindingsResponse('{"ok":true}', { expectJson: true, schema: {} })).toEqual({ ok: true });
    });

    it('rejects prose and schema violations for structured responses', () => {
        const schema = {
            type: 'object',
            properties: { answer: { type: 'string' } },
            required: ['answer'],
            additionalProperties: false,
        };
        expect(() => interpretFindingsResponse('Result: {"answer":"ok"}', { expectJson: true, schema })).toThrow(
            'single valid JSON object',
        );
        expect(() => interpretFindingsResponse('{"answer":42}', { expectJson: true, schema })).toThrow(
            'expected string',
        );
        expect(() => interpretFindingsResponse('{"answer":"ok","extra":true}', { expectJson: true, schema })).toThrow(
            'unexpected property extra',
        );
    });

    it('enforces string and array bounds from the response schema', () => {
        expect(() => interpretFindingsResponse('{"answer":""}', {
            expectJson: true,
            schema: { type: 'object', properties: { answer: { type: 'string', minLength: 1 } }, required: ['answer'] },
        })).toThrow('string is too short');
        expect(() => interpretFindingsResponse('{"items":[1,2]}', {
            expectJson: true,
            schema: { type: 'object', properties: { items: { type: 'array', maxItems: 1 } }, required: ['items'] },
        })).toThrow('array has too many items');
    });
});
