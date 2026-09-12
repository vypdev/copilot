import { assertAgentResponseSchema } from '../agent_json_schema_validator';

describe('assertAgentResponseSchema', () => {
    it('accepts the supported schema subset, including nested and additional properties', () => {
        expect(() => assertAgentResponseSchema({
            name: 'bug',
            count: 2,
            tags: ['safe'],
            score: 0.5,
        }, {
            type: 'object',
            required: ['name', 42],
            properties: {
                name: { type: 'string', enum: ['bug', 'warning'], minLength: 2, maxLength: 20 },
                count: { type: 'integer', minimum: 1, maximum: 10 },
                tags: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } },
            },
            additionalProperties: { type: 'number' },
        })).not.toThrow();

        expect(() => assertAgentResponseSchema(null, {})).not.toThrow();
        expect(() => assertAgentResponseSchema(null, { type: ['string', 'null'] })).not.toThrow();
    });

    it.each([
        ['enum', 'other', { type: 'string', enum: ['allowed'] }, 'allowed enum'],
        ['object type', [], { type: 'object' }, 'expected object'],
        ['array type', {}, { type: 'array' }, 'expected array'],
        ['integer type', 1.5, { type: 'integer' }, 'expected integer'],
        ['primitive type', 1, { type: 'string' }, 'expected string'],
        ['union type', true, { type: ['string', 'null'] }, 'expected string or null'],
        ['short string', 'x', { type: 'string', minLength: 2 }, 'too short'],
        ['long string', 'xxx', { type: 'string', maxLength: 2 }, 'too long'],
        ['non-finite number', Number.NaN, { type: 'number' }, 'not finite'],
        ['number below minimum', 0, { type: 'number', minimum: 1 }, 'below minimum'],
        ['number above maximum', 2, { type: 'number', maximum: 1 }, 'above maximum'],
        ['too few items', [], { type: 'array', minItems: 1 }, 'too few items'],
        ['too many items', [1, 2], { type: 'array', maxItems: 1 }, 'too many items'],
        ['missing property', {}, { type: 'object', required: ['name'] }, 'missing required property name'],
        ['unexpected property', { extra: true }, { type: 'object', additionalProperties: false }, 'unexpected property extra'],
        [
            'invalid additional property',
            { score: 'high' },
            { type: 'object', additionalProperties: { type: 'number' } },
            '$.score: expected number',
        ],
        [
            'invalid array item',
            ['ok', 2],
            { type: 'array', items: { type: 'string' } },
            '$[1]: expected string',
        ],
    ])('rejects %s', (_name, value, schema, message) => {
        expect(() => assertAgentResponseSchema(value, schema)).toThrow(message);
    });
});
