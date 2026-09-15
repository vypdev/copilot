import {
    PRODUCT_FACING_AGENT_TASKS,
    agentOutputLocaleFailureMessage,
    productFacingAgentQueryOptions,
    validateAgentOutputLocale,
} from '../agent_output_locale_policy';

describe('agent output locale policy', () => {
    const schema = {
        type: 'object',
        properties: { outputLocale: { type: 'string' }, prose: { type: 'string' } },
        required: ['outputLocale', 'prose'],
        additionalProperties: false,
    } as const;

    it('keeps the complete product-facing task inventory closed and builds strict query options', () => {
        expect(PRODUCT_FACING_AGENT_TASKS).toEqual([
            'think',
            'answer-issue-help',
            'progress',
            'recommend-steps',
            'pull-request-description',
            'bugbot-review',
        ]);
        expect(PRODUCT_FACING_AGENT_TASKS.map(task => productFacingAgentQueryOptions(task, schema).schemaName))
            .toEqual([
                'think_response',
                'answer_issue_help_response',
                'progress_response',
                'recommend_steps_response',
                'pull_request_description_response',
                'bugbot_findings',
            ]);
    });

    it('rejects a schema that does not require outputLocale before provider use', () => {
        expect(() => productFacingAgentQueryOptions('think', { properties: {}, required: [] }))
            .toThrow('must require outputLocale');
    });

    it('accepts exact canonical metadata and returns an immutable copy', () => {
        const input = { outputLocale: 'pt-BR', prose: 'Concluído' };
        const result = validateAgentOutputLocale(input, 'pt-BR');
        expect(result).toMatchObject({ kind: 'valid', expectedLocale: 'pt-BR', payload: input });
        if (result.kind === 'valid') {
            expect(result.payload).not.toBe(input);
            expect(Object.isFrozen(result.payload)).toBe(true);
        }
    });

    it.each([
        [undefined, 'response-not-object'],
        ['text', 'response-not-object'],
        [{}, 'output-locale-missing'],
        [{ outputLocale: '@@' }, 'output-locale-invalid'],
        [{ outputLocale: 'en_us' }, 'output-locale-invalid'],
        [{ outputLocale: ' en-US ' }, 'output-locale-mismatch'],
        [{ outputLocale: 'fr-FR' }, 'output-locale-mismatch'],
    ])('rejects invalid locale-tagged output %#', (response, reason) => {
        const result = validateAgentOutputLocale(response, 'en-US');
        expect(result).toMatchObject({ kind: 'invalid', reason, expectedLocale: 'en-US' });
        if (result.kind === 'invalid') {
            expect(agentOutputLocaleFailureMessage(result)).toContain(String(reason));
            const serialized = JSON.stringify(response);
            if (serialized) expect(agentOutputLocaleFailureMessage(result)).not.toContain(serialized);
        }
    });
});
