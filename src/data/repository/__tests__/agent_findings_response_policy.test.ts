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
});
