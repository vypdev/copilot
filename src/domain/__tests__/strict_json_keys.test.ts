import { hasDuplicateJsonObjectKeys } from '../strict_json_keys';
describe('duplicate JSON-key detection', () => {
    it('rejects repeated decoded keys in one object', () => expect(hasDuplicateJsonObjectKeys('{"x":1,"\\u0078":2}')).toBe(true));
    it('allows equal keys in independent objects and ignores string contents', () => expect(hasDuplicateJsonObjectKeys(JSON.stringify({x:[{x:1},{x:2}],text:'{"x":1}'}))).toBe(false));
    it('detects nested duplicates inside arrays', () => expect(hasDuplicateJsonObjectKeys('[1,{"a":true,"a":null}]')).toBe(true));
    it('handles arrays of strings, scalar values and empty objects', () => {
        for (const value of ['[]', '{}', 'true', '["a","a"]', '{"a":null,"b":1,"c":[]}'])
            expect(hasDuplicateJsonObjectKeys(value)).toBe(false);
    });
});
