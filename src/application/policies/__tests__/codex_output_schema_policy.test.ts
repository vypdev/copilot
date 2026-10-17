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

    it('keeps numeric and array bounds in the native schema', () => {
        const schema = object({ values: { type: 'array', minItems: 1, maxItems: 8,
            items: { type: 'integer', minimum: 1, maximum: 25 } } });
        expect(projectCodexOutputSchema(schema)).toEqual(schema);
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
