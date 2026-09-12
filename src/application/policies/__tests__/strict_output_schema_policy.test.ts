import { assertStrictOutputSchema } from '../agent_execution/strict_output_schema_policy';

const strictSchema = {
    type: 'object',
    properties: {
        value: { type: ['string', 'null'] },
        items: {
            type: 'array',
            items: {
                type: 'object',
                properties: { id: { type: 'string' } },
                required: ['id'],
                additionalProperties: false,
            },
        },
    },
    required: ['value', 'items'],
    additionalProperties: false,
} as const;

describe('assertStrictOutputSchema', () => {
    it('accepts required nullable fields and recursively closed objects', () => {
        expect(() => assertStrictOutputSchema(strictSchema)).not.toThrow();
    });

    it.each([
        ['non-object root', { type: 'array', items: { type: 'string' } }, 'root must be an object'],
        ['missing properties', { type: 'object', required: [], additionalProperties: false }, 'must define properties'],
        ['open object', { type: 'object', properties: {}, required: [] }, 'must deny additional properties'],
        ['missing required list', { type: 'object', properties: {}, additionalProperties: false }, 'string required list'],
        ['non-string required member', { type: 'object', properties: {}, required: [1], additionalProperties: false }, 'string required list'],
        ['duplicate required member', {
            type: 'object',
            properties: { value: { type: 'string' }, other: { type: 'string' } },
            required: ['value', 'value'],
            additionalProperties: false,
        }, 'must require every property'],
        ['array without items', {
            type: 'object',
            properties: { items: { type: 'array' } },
            required: ['items'],
            additionalProperties: false,
        }, 'must define item schema'],
        ['property without type', {
            type: 'object',
            properties: { value: {} },
            required: ['value'],
            additionalProperties: false,
        }, 'must define valid unique JSON types'],
        ['invalid property schema', {
            type: 'object',
            properties: { value: 'string' },
            required: ['value'],
            additionalProperties: false,
        }, 'property $.value is invalid'],
        ['invalid type', {
            type: 'object',
            properties: { value: { type: 'date' } },
            required: ['value'],
            additionalProperties: false,
        }, 'must define valid unique JSON types'],
    ])('rejects %s', (_name, schema, message) => {
        expect(() => assertStrictOutputSchema(schema as Readonly<Record<string, unknown>>)).toThrow(message);
    });
});
