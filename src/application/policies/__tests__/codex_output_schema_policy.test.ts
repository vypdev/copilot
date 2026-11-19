import { projectCodexOutputSchema } from '../agent_execution/codex_output_schema_policy';
import { buildCodexExecutionPolicy } from '../agent_execution/codex_execution_plan_policy';
import { FindingsAgentAdapter } from '../../../data/repository/ai/findings_agent_adapter';
import { AgentResponseLengthFailure } from '../../../domain/agent_response_length_failure';

const object = (properties: Record<string, unknown>) => ({
    type: 'object', properties, required: Object.keys(properties), additionalProperties: false,
});

describe('Codex native output schema compatibility', () => {
    it('projects string bounds without mutating the full immutable acceptance schema', () => {
        const markdown = Object.freeze({ type: 'string', minLength: 1800, maxLength: 70000 });
        const schema = Object.freeze(object(Object.freeze({ markdown })));
        expect(projectCodexOutputSchema(schema)).toEqual(object({ markdown: { type: 'string' } }));
        expect(schema.properties.markdown).toBe(markdown);
        expect(markdown).toEqual({ type: 'string', minLength: 1800, maxLength: 70000 });
    });

    it('projects nested objects, array items and nullable strings while preserving their closed shape', () => {
        const schema = object({ metadata: { ...object({ count: { type: 'integer' } }), type: ['object', 'null'] }, rows: { type: 'array', items: object({
            text: { type: ['string', 'null'], minLength: 2, maxLength: 30 },
        }) } });
        expect(projectCodexOutputSchema(schema)).toEqual(object({ metadata: { ...object({ count: { type: 'integer' } }), type: ['object', 'null'] }, rows: { type: 'array', items: object({
            text: { type: ['string', 'null'] },
        }) } }));
    });

    it('preserves literal property names that happen to be string-length keywords', () => {
        const schema = object({ minLength: { type: 'string', maxLength: 20 }, maxLength: { type: 'integer', minimum: 1 } });
        expect(projectCodexOutputSchema(schema)).toEqual(object({ minLength: { type: 'string' }, maxLength: { type: 'integer', minimum: 1 } }));
    });

    it('keeps non-length string constraints and unbounded strings', () => {
        const schema = object({ state: { type: 'string', enum: ['ready', 'blocked'], pattern: '^[a-z]+$' }, text: { type: 'string' } });
        expect(projectCodexOutputSchema(schema)).toEqual(schema);
    });

    it.each(['first\nsecond', 'first\r\nsecond'])('keeps exact multiline evidence matching in the findings adapter (%j)', async snippet => {
        const id = { type: 'string', enum: ['finding-id'] };
        const codeSnippet = { type: ['string', 'null'], enum: [snippet] };
        const schema = object({ findings: { type: 'array', items: object({ id, codeSnippet }) } });
        const execute = jest.fn().mockImplementation(async request => {
            const policy = buildCodexExecutionPolicy({ configuration: request.configuration, capability: request.capability,
                workspace: '/workspace', runtimeDirectory: '/runtime', outputSchema: request.outputSchema });
            expect(JSON.parse(policy.artifacts[0].contents)).toEqual(object({
                findings: { type: 'array', items: object({ id, codeSnippet: { type: ['string', 'null'] } }) },
            }));
            expect(request.outputSchema).toBe(schema);
            return JSON.stringify({ findings: [{ id: 'finding-id', codeSnippet: snippet }] });
        });
        const adapter = new FindingsAgentAdapter({ cli: { execute } });
        const request = { configuration: { provider: 'codex' as const, model: 'model' },
            agentId: 'fixture', prompt: 'Verify this source', options: { expectJson: true, schema } };
        await expect(adapter.query(request)).resolves.toEqual({ findings: [{ id: 'finding-id', codeSnippet: snippet }] });
        execute.mockResolvedValueOnce(JSON.stringify({ findings: [{ id: 'finding-id', codeSnippet: 'first second' }] }));
        await expect(adapter.query(request)).rejects.toThrow('outside the allowed enum');
    });

    it('checks generated-source identities locally without inserting detector text in the native enum grammar', async () => {
        const finding = { id: 'literal-counter', file: 'fixtures/assertion.ts', codeSnippet: 'const text = "first\\nsecond";' };
        const fields = {
            id: { type: 'string', enum: [finding.id] },
            file: { type: ['string', 'null'], enum: [finding.file] },
            codeSnippet: { type: ['string', 'null'], enum: [finding.codeSnippet] },
        };
        const verificationId = 'a'.repeat(64);
        const schema = object({
            verification_id: { type: 'string', enum: [verificationId] },
            findings: { type: 'array', items: object(fields) },
            rejected_ids: { type: 'array', items: fields.id },
        });
        const response = { verification_id: verificationId, findings: [finding], rejected_ids: [] };
        const execute = jest.fn(async () => JSON.stringify(response));
        const adapter = new FindingsAgentAdapter({ cli: { execute } });
        const request = { configuration: { provider: 'codex' as const, model: 'model' },
            agentId: 'bugbot-literal-candidate-verification', prompt: 'Verify the source evidence.',
            options: { expectJson: true, schema, schemaName: 'bugbot_literal_candidate_verification' } };
        await expect(adapter.query(request)).resolves.toEqual(response);
        expect(execute).toHaveBeenCalledWith(expect.objectContaining({ outputSchema: object({
            verification_id: schema.properties.verification_id,
            findings: { type: 'array', items: object({
                id: { type: 'string' },
                file: { type: ['string', 'null'] },
                codeSnippet: { type: ['string', 'null'] },
            }) },
            rejected_ids: { type: 'array', items: { type: 'string' } },
        }) }));
        expect(schema).toMatchObject({ properties: { findings: { items: { properties: fields } } } });

        for (const invalid of [
            { ...response, findings: [{ ...finding, id: 'other' }] },
            { ...response, findings: [{ ...finding, file: 'fixtures/other.ts' }] },
            { ...response, findings: [{ ...finding, codeSnippet: finding.codeSnippet.replace('\\n', ' ') }] },
            { ...response, findings: [], rejected_ids: ['other'] },
        ]) {
            execute.mockResolvedValueOnce(JSON.stringify(invalid));
            await expect(adapter.query(request)).rejects.toMatchObject({ reason: 'schema-enum' });
        }
        await expect(adapter.query({ ...request, configuration: { provider: 'opencode', model: 'model' } })).resolves.toEqual(response);
        expect(execute).toHaveBeenLastCalledWith(expect.objectContaining({ outputSchema: schema }));
    });

    it('keeps numeric and array bounds in the native schema', () => {
        const schema = object({ values: { type: 'array', minItems: 1, maxItems: 8,
            items: { type: 'integer', minimum: 1, maximum: 25 } } });
        expect(projectCodexOutputSchema(schema)).toEqual(schema);
    });

    it('shares the 1000-value native enum budget across nested properties and array items', () => {
        const first = Array.from({ length: 995 }, (_, index) => `v${index}`);
        const overflow = { type: 'string', enum: ['last'] };
        const schema = object({ first: { type: 'string', enum: first }, rows: { type: 'array', items: { type: 'integer', enum: [1, 2, 3, 4, 5] } },
            overflow });
        expect(projectCodexOutputSchema(schema)).toEqual(object({ first: schema.properties.first, rows: schema.properties.rows, overflow: { type: 'string' } }));
        expect(overflow.enum).toEqual(['last']);
    });

    it.each([15_000, 15_001])('projects a long enum only above the native Unicode boundary of %i points', points => {
        const values = Array.from({ length: 251 }, (_, index) => String(index).padStart(59, 'x'));
        values[0] += '🧪'.repeat(points - 251 * 59);
        expect(values.reduce((total, value) => total + [...value].length, 0)).toBe(points);
        expect(values.reduce((total, value) => total + value.length, 0)).toBeGreaterThan(points);
        const value = { type: 'string', enum: values };
        const schema = object({ value, identity: { type: 'string', enum: ['host-id'] } });
        expect(projectCodexOutputSchema(schema)).toEqual(object({ value: points === 15_000 ? schema.properties.value : { type: 'string' }, identity: schema.properties.identity }));
        expect(value.enum).toBe(values);
    });

    it('preserves long small enums and projects an oversized numeric enum', () => {
        const schema = object({ text: { type: 'string', enum: ['x'.repeat(15_001)] }, value: { type: 'integer', enum: Array.from({ length: 1001 }, (_, index) => index) } });
        expect(projectCodexOutputSchema(schema)).toEqual(object({ text: schema.properties.text, value: { type: 'integer' } }));
    });

    it('keeps exact local membership validation after projecting a complete large evidence dictionary', async () => {
        const schema = object({ citation: { type: 'string', enum: Array.from({ length: 1024 }, (_, index) => `source-${index}`) } });
        const execute = jest.fn().mockImplementation(async request => {
            const policy = buildCodexExecutionPolicy({ configuration: request.configuration, capability: request.capability,
                workspace: '/workspace', runtimeDirectory: '/runtime', outputSchema: request.outputSchema });
            expect(JSON.parse(policy.artifacts[0].contents)).toEqual(object({ citation: { type: 'string' } }));
            expect(request.outputSchema).toBe(schema);
            return JSON.stringify({ citation: 'foreign-source' });
        });
        await expect(new FindingsAgentAdapter({ cli: { execute } }).query({ configuration: { provider: 'codex', modelProvider: 'openai', model: 'model' },
            agentId: 'fixture', prompt: 'Complete immutable dictionary', options: { expectJson: true, schema } })).rejects.toThrow('outside the allowed enum');
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('rejects a loose original contract before producing a native projection', () => {
        expect(() => projectCodexOutputSchema({ ...object({ markdown: { type: 'string' } }), required: [] }))
            .toThrow('must require every property');
    });

    it.each(['below-minimum', 'above-maximum'] as const)(
        'keeps the real findings adapter acceptance bound after native projection: %s', async scenario => {
            const schema = object({ markdown: { type: 'string', minLength: 1800, maxLength: 18000 } });
            const execute = jest.fn().mockImplementation(async request => {
                const policy = buildCodexExecutionPolicy({
                    configuration: request.configuration, capability: request.capability,
                    workspace: '/workspace', runtimeDirectory: '/runtime', outputSchema: request.outputSchema,
                });
                expect(policy.output).toBe('native-and-local-json-schema');
                expect(JSON.parse(policy.artifacts[0].contents)).toEqual(object({ markdown: { type: 'string' } }));
                expect(request.outputSchema).toEqual(schema);
                return JSON.stringify({ markdown: scenario === 'below-minimum' ? 'short' : 'x'.repeat(18001) });
            });
            const pending = new FindingsAgentAdapter({ cli: { execute } }).query({
                configuration: { provider: 'codex', modelProvider: 'openai', model: 'model' },
                agentId: 'fixture', prompt: 'Resolved requirements', options: { expectJson: true, schema },
            });
            if (scenario === 'below-minimum') await expect(pending).rejects.toThrow('string is too short');
            else await expect(pending).rejects.toEqual(new AgentResponseLengthFailure('$.markdown', 18000));
            expect(execute).toHaveBeenCalledTimes(1);
        },
    );
});
