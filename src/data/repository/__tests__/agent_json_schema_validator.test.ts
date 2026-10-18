import { assertAgentResponseSchema } from '../agent_json_schema_validator';
import { AgentResponseLengthFailure } from '../../../domain/agent_response_length_failure';
import { parseProgressPartitionFacts, progressPartitionResponseSchema } from '../../../application/policies/progress_partition_response_policy';

describe('assertAgentResponseSchema', () => {
    it('accepts 600 supplementary code points at schema maxLength', () => {
        expect(() => assertAgentResponseSchema('🧪'.repeat(600), { type: 'string', maxLength: 600 })).not.toThrow();
    });
    it('rejects 601 supplementary code points with sanitized maximum metadata', () => {
        expect(() => assertAgentResponseSchema('🧪'.repeat(601), { type: 'string', maxLength: 600 }))
            .toThrow(expect.objectContaining({ path: '$', maximum: 600 }));
    });
    it('rejects fewer code points than minLength even when UTF-16 length exceeds it', () => {
        expect(() => assertAgentResponseSchema('🧪'.repeat(599), { type: 'string', minLength: 600 })).toThrow('too short');
    });
    it('accepts the supplementary code-point boundary at schema minLength', () => {
        expect(() => assertAgentResponseSchema('🧪'.repeat(600), { type: 'string', minLength: 600 })).not.toThrow();
    });
    it.each([600, 20])('validates and parses the same supplementary progress facts at the %s-code-point bound', limit => {
        const partition = { id: 'progress-1-of-2', paths: ['src/🧪.ts'], evidence: 'complete source' };
        const response = { outputLocale: 'en-US', partitionId: partition.id,
            files: [{ path: partition.paths[0], implemented: '🧪'.repeat(limit), remaining: 'Unknown' }] };
        const schema = progressPartitionResponseSchema(partition, limit);
        expect(() => assertAgentResponseSchema(response, schema)).not.toThrow();
        expect(parseProgressPartitionFacts(response, partition, 'en-US', limit)).toEqual(response.files);
        response.files[0].implemented += '🧪';
        expect(() => assertAgentResponseSchema(response, schema)).toThrow(AgentResponseLengthFailure);
        expect(() => parseProgressPartitionFacts(response, partition, 'en-US', limit)).toThrow();
    });
    it('reports only typed local path and maximum metadata for an oversized nested string', () => {
        try {
            assertAgentResponseSchema({ markdown: 'secret provider content' }, {
                type: 'object', properties: { markdown: { type: 'string', maxLength: 3 } },
            });
            throw new Error('Expected schema rejection');
        } catch (error) {
            expect(error).toBeInstanceOf(AgentResponseLengthFailure);
            expect(error).toMatchObject({ path: '$.markdown', maximum: 3 });
            expect(String(error)).not.toContain('secret provider content');
        }
    });
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
