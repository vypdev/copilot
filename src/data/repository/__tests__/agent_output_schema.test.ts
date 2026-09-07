import { existsSync, readFileSync, statSync } from 'node:fs';
import { prepareAgentOutputSchema } from '../agent_output_schema';

describe('prepareAgentOutputSchema', () => {
    it('creates and cleans a private Codex schema file', () => {
        const schema = {
            type: 'object',
            properties: { ok: { type: 'boolean' } },
            required: ['ok'],
            additionalProperties: false,
        };
        const prepared = prepareAgentOutputSchema('codex', schema);
        const path = prepared.path as string;
        expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(schema);
        expect(statSync(path).mode & 0o077).toBe(0);
        prepared.cleanup();
        expect(existsSync(path)).toBe(false);
    });

    it('does not create a schema file for providers without native support', () => {
        const schema = { type: 'object', properties: {}, required: [], additionalProperties: false };
        expect(prepareAgentOutputSchema('cursor', schema).path).toBeUndefined();
        expect(prepareAgentOutputSchema('opencode', schema).path).toBeUndefined();
    });

    it('falls back to application validation for optional-property schemas', () => {
        expect(prepareAgentOutputSchema('codex', {
            type: 'object',
            properties: { requiredValue: { type: 'string' }, optionalValue: { type: 'string' } },
            required: ['requiredValue'],
            additionalProperties: false,
        }).path).toBeUndefined();
    });
});
