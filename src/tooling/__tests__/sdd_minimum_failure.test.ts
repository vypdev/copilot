import { draftSddMarkdown } from '../../application/usecases/sdd/pre_branch_sdd_draft_workflow';
import { FindingsAgentAdapter } from '../../data/repository/ai/findings_agent_adapter';
import { AgentResponseSchemaFailure } from '../../domain/agent_response_schema_failure';
import { ApplicationError } from '../../application/errors/application_error';

const configuration = { provider: 'codex', modelProvider: 'openai', model: 'model' } as const;
const plan = { action: 'update', path: 'specs/owner.md', capabilityId: 'owner', reason: 'Preserve the reviewed owner.', questions: [] } as const;
const sourceSnapshot = { kind: 'pre-branch-sdd', phase: 'draft', baseSha: '6bd590dac62bdd075d2894e29aa580791dec81a5' } as const;

describe('undersized SDD response boundary', () => {
    it('classifies the real adapter minimum rejection without guessing the discarded response length', async () => {
        const execute = jest.fn().mockResolvedValue(JSON.stringify({ markdown: 'PRIVATE_REJECTED_RESPONSE' }));
        const adapter = new FindingsAgentAdapter({ cli: { execute } });
        const validate = jest.fn();
        const error = await draftSddMarkdown(adapter, configuration, plan, 'Retain all resolved requirements.', validate, sourceSnapshot).catch(error => error);
        expect(error).toMatchObject({ code: 'validation.invalid-input', retryable: false,
            recovery: { id: 'sdd-draft-response-too-short', variables: { minimum: 1800, observed: 'unavailable', attempts: 1 } },
            diagnostic: { reason: 'response-minimum', phase: 'response', facts: [{ detail: 'minimum-length', section: 0, expected: 1800 }] },
        });
        expect(execute).toHaveBeenCalledTimes(1); expect(validate).not.toHaveBeenCalled();
        expect(JSON.stringify(error)).not.toContain('PRIVATE_REJECTED_RESPONSE');
    });

    it('reports the actual second attempt after maximum repair without granting a minimum repair', async () => {
        const execute = jest.fn().mockResolvedValueOnce(JSON.stringify({ markdown: 'x'.repeat(18001) }))
            .mockResolvedValueOnce(JSON.stringify({ markdown: 'PRIVATE_SECOND_RESPONSE' }));
        const adapter = new FindingsAgentAdapter({ cli: { execute } });
        const validate = jest.fn();
        const error = await draftSddMarkdown(adapter, configuration, plan, 'Retain answers and ownership.', validate, sourceSnapshot).catch(error => error);
        expect(error).toMatchObject({ code: 'validation.invalid-input', retryable: false,
            recovery: { id: 'sdd-draft-response-too-short', variables: { minimum: 1800, observed: 'unavailable', attempts: 2 } },
            attempts: 2,
        });
        expect(execute).toHaveBeenCalledTimes(2); expect(validate).not.toHaveBeenCalled();
        expect(JSON.stringify(error) + JSON.stringify(execute.mock.calls)).not.toContain('PRIVATE_SECOND_RESPONSE');
    });

    it('rejects a returned short string by Unicode code points before writer validation', async () => {
        const query = jest.fn().mockResolvedValue({ markdown: '🐈'.repeat(900) });
        const validate = jest.fn();
        const error = await draftSddMarkdown({ query }, configuration, plan, 'Retain existing specifications.', validate).catch(error => error);
        expect(error).toMatchObject({ code: 'validation.invalid-input', retryable: false,
            recovery: { id: 'sdd-draft-response-too-short', variables: { minimum: 1800, observed: 900, attempts: 1 } },
            diagnostic: { reason: 'response-minimum', phase: 'response', facts: [{ detail: 'minimum-length', section: 0, expected: 1800, observed: 900 }] },
        });
        expect(query).toHaveBeenCalledTimes(1); expect(validate).not.toHaveBeenCalled();
        expect(JSON.stringify(error)).not.toContain('🐈');
    });
});

describe('minimum boundary and unchanged terminal identities', () => {
    it.each(['update', 'companion', 'new'] as const)('accepts the exact 1800-code-point schema boundary for %s', async action => {
        const markdown = 'x'.repeat(1800), execute = jest.fn().mockResolvedValue(JSON.stringify({ markdown }));
        const validate = jest.fn();
        await expect(draftSddMarkdown(new FindingsAgentAdapter({ cli: { execute } }), configuration, { ...plan, action }, 'Complete response.', validate, sourceSnapshot)).resolves.toBe(markdown);
        expect(execute).toHaveBeenCalledTimes(1); expect(validate).toHaveBeenCalledWith(markdown);
    });

    it.each([0, 1799])('records an actually returned count of %s without guessing from serialized bytes', async observed => {
        const query = jest.fn().mockResolvedValue({ markdown: 'x'.repeat(observed) }), validate = jest.fn();
        await expect(draftSddMarkdown({ query }, configuration, plan, 'Complete response.', validate)).rejects.toMatchObject({
            recovery: { id: 'sdd-draft-response-too-short', variables: { minimum: 1800, observed, attempts: 1 } },
        });
        expect(query).toHaveBeenCalledTimes(1); expect(validate).not.toHaveBeenCalled();
    });

    it('accepts exactly 1800 astral code points through the real adapter and writer boundary', async () => {
        const markdown = '🐈'.repeat(1800), execute = jest.fn().mockResolvedValue(JSON.stringify({ markdown }));
        const validate = jest.fn();
        await expect(draftSddMarkdown(new FindingsAgentAdapter({ cli: { execute } }), configuration, plan, 'Complete response.', validate, sourceSnapshot)).resolves.toBe(markdown);
        expect(execute).toHaveBeenCalledTimes(1); expect(validate).toHaveBeenCalledWith(markdown);
    });

    it.each([
        { value: null, reason: 'json-object' }, { value: { markdown: null }, reason: 'type' },
        { value: {}, reason: 'required' }, { value: { markdown: 42 }, reason: 'type' },
    ])('preserves the real adapter $reason rejection instead of inventing a minimum failure', async ({ value, reason }) => {
        const execute = jest.fn().mockResolvedValue(JSON.stringify(value)), validate = jest.fn();
        const error = await draftSddMarkdown(new FindingsAgentAdapter({ cli: { execute } }), configuration, plan, 'Complete response.', validate, sourceSnapshot).catch(error => error);
        if (reason === 'json-object') expect(error.message).toBe('Agent response is not a single valid JSON object.');
        else { expect(error).toBeInstanceOf(AgentResponseSchemaFailure); expect(error.reason).toBe(reason); }
        expect(error).not.toHaveProperty('recovery'); expect(execute).toHaveBeenCalledTimes(1); expect(validate).not.toHaveBeenCalled();
    });

    it.each([
        new AgentResponseSchemaFailure('string-short', '$.other', 'PRIVATE_FOREIGN_ERROR'),
        new AgentResponseSchemaFailure('enum', '$.markdown', 'PRIVATE_FOREIGN_ERROR'),
        new Error('Agent response schema violation at $.markdown: string is too short.'),
        new ApplicationError('provider.unavailable', 'Provider unavailable.', { correlationId: '6f173f89-96a3-4fc8-b90e-4f8f48e0e319' }),
    ])('preserves unrelated typed/forged/provider identity without regeneration: %s', async error => {
        const query = jest.fn().mockRejectedValue(error), validate = jest.fn();
        await expect(draftSddMarkdown({ query }, configuration, plan, 'Original requirements.', validate)).rejects.toBe(error);
        expect(query).toHaveBeenCalledTimes(1); expect(validate).not.toHaveBeenCalled();
    });

    it('reports a measured short second response after the existing maximum repair and stops', async () => {
        const query = jest.fn().mockResolvedValueOnce({ markdown: 'x'.repeat(18001) }).mockResolvedValueOnce({ markdown: 'SECRET' });
        const validate = jest.fn();
        const error = await draftSddMarkdown({ query }, configuration, plan, 'Original requirements.', validate).catch(error => error);
        expect(error).toMatchObject({ recovery: { id: 'sdd-draft-response-too-short', variables: { minimum: 1800, observed: 6, attempts: 2 } } });
        expect(JSON.stringify(error)).not.toContain('SECRET'); expect(query).toHaveBeenCalledTimes(2); expect(validate).not.toHaveBeenCalled();
    });

    it('keeps malformed JSON terminal without a minimum classification or another query', async () => {
        const execute = jest.fn().mockResolvedValue('PRIVATE_INVALID_JSON'), validate = jest.fn();
        const error = await draftSddMarkdown(new FindingsAgentAdapter({ cli: { execute } }), configuration, plan, 'Original requirements.', validate, sourceSnapshot).catch(error => error);
        expect(error).toBeInstanceOf(Error); expect(error).not.toHaveProperty('recovery.id', 'sdd-draft-response-too-short');
        expect(execute).toHaveBeenCalledTimes(1); expect(validate).not.toHaveBeenCalled();
    });
});
