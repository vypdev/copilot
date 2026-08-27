import { extractFirstJsonObject, parseJsonFromAgentText } from '../agent_json_parser';

describe('agent_json_parser', () => {
    it('parses direct and fenced objects', () => {
        expect(parseJsonFromAgentText('{"ok":true}')).toEqual({ ok: true });
        expect(parseJsonFromAgentText('```json\n{"ok":true}\n```')).toEqual({ ok: true });
    });

    it('extracts the first balanced object after prose', () => {
        expect(parseJsonFromAgentText('Result: {"text":"contains } and \\"quotes\\""}')).toEqual({
            text: 'contains } and "quotes"',
        });
    });

    it('rejects empty, non-object and malformed responses', () => {
        expect(() => parseJsonFromAgentText('')).toThrow('response text is empty');
        expect(() => parseJsonFromAgentText('[1, 2]')).toThrow('no JSON object found');
        expect(() => parseJsonFromAgentText('{"broken":')).toThrow('no JSON object found');
    });

    it('returns null when prose has no balanced object', () => {
        expect(extractFirstJsonObject('prefix {broken')).toBeNull();
    });
});
