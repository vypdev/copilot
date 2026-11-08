import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { queryBugbotPartitionFindings } from '../query_bugbot_findings';
import { FindingsAgentAdapter } from '../../../../../../data/repository/ai/findings_agent_adapter';

const expected = { partitionId: 'diff-owned', headSha: 'a'.repeat(40) };
const configuration = { provider: 'codex' as const, model: 'fixture' };

it('bugbot-partition-diagnostics-C01: native malformed output exhausts three identical calls with a closed diagnostic and no rejected prose', async () => {
    const execute = jest.fn(async () => 'PRIVATE_REJECTED_PROSE @all /copilot deploy');
    const adapter = new FindingsAgentAdapter({ cli: { execute } });
    let failure: unknown;
    try { await queryBugbotPartitionFindings(adapter, configuration, 'complete pinned source', 'en-US', expected); }
    catch (error) { failure = error; }
    expect(failure).toMatchObject({ code: 'agent.failed', retryable: false, recovery: { id: 'bugbot-partition-query-exhausted', variables: { reason: 'json-invalid', attempts: 3 } } });
    expect(JSON.stringify(failure)).not.toContain('PRIVATE_');
    expect(execute).toHaveBeenCalledTimes(3);
    expect(execute.mock.calls[1]).toEqual(execute.mock.calls[0]);
    expect(execute.mock.calls[2]).toEqual(execute.mock.calls[0]);
});

import { BugbotResponseFailure, BUGBOT_RESPONSE_FAILURE_REASONS, isBugbotPartitionQueryDiagnostic } from '../../../../../../domain/bugbot/response_failure';
import { interpretFindingsResponse } from '../../../../../../data/repository/agent_findings_response_policy';
import { ApplicationError } from '../../../../../errors/application_error';
import { buildApplicationErrorPresentation } from '../../../../../policies/application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../../../../../policies/application_error_message_catalog';
import { AgentCliError } from '../../../../../../data/repository/agent_cli_contracts';
import { BugbotReviewCompletenessError } from '../../../../../../domain/bugbot/framed_review';

const valid = { outputLocale: 'en-US', partition_id: expected.partitionId, reviewed_head_sha: expected.headSha, findings: [], resolved_findings: [] };
const run = (adapter: Parameters<typeof queryBugbotPartitionFindings>[0]) => queryBugbotPartitionFindings(adapter, configuration, 'complete pinned source', 'en-US', expected);
const typed = (text: string, schema: Record<string, unknown>) => interpretFindingsResponse(text, { expectJson: true, schemaName: 'bugbot_findings', schema });

it('bugbot-partition-diagnostics-C02: every typed schema violation exposes only its finite reason, never the rejected key, value or path', () => {
    const checks: [unknown, Record<string, unknown>, string][] = [
        [42, { type: 'object' }, 'type'], ['bad', { type: 'string', enum: ['good'] }, 'enum'],
        ['', { type: 'string', minLength: 1 }, 'string-short'], ['PRIVATE', { type: 'string', maxLength: 2 }, 'string-long'],
        [-1, { type: 'number', minimum: 0 }, 'number-min'], [2, { type: 'number', maximum: 1 }, 'number-max'],
        [[], { type: 'array', minItems: 1 }, 'array-short'], [[1, 2], { type: 'array', maxItems: 1 }, 'array-long'],
    ];
    for (const [value, schema, reason] of checks) {
        expect(() => typed(JSON.stringify({ PRIVATE_KEY: value }), { type: 'object', properties: { PRIVATE_KEY: schema }, required: ['PRIVATE_KEY'], additionalProperties: false }))
            .toThrow(expect.objectContaining({ reason: `schema-${reason}` }));
    }
    expect(() => typed('{"n":1e309}', { properties: { n: { type: 'number' } } })).toThrow(expect.objectContaining({ reason: 'schema-number-finite' }));
    expect(() => typed('{}', { required: ['PRIVATE_KEY'] })).toThrow(expect.objectContaining({ reason: 'schema-required' }));
    let failure: unknown;
    try { typed('{"PRIVATE_KEY":"PRIVATE_VALUE"}', { additionalProperties: false }); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ reason: 'schema-additional' });
    expect(JSON.stringify(failure)).not.toContain('PRIVATE');
});

it('bugbot-partition-diagnostics-C03: empty and malformed completed native response text stays distinct from execution failure', async () => {
    for (const text of ['', ' ', '[]', '{"broken":']) {
        const execute = jest.fn(async () => text);
        await expect(run(new FindingsAgentAdapter({ cli: { execute } }))).rejects.toMatchObject({ recovery: { variables: { reason: 'json-invalid', attempts: 3 } } });
        expect(execute).toHaveBeenCalledTimes(3);
    }
});

it('bugbot-partition-diagnostics-C04: a usable later native response discards earlier failures without changing immutable requests', async () => {
    const execute = jest.fn().mockResolvedValueOnce('PRIVATE_INVALID').mockResolvedValue(JSON.stringify(valid));
    await expect(run(new FindingsAgentAdapter({ cli: { execute } }))).resolves.toEqual(valid);
    expect(execute).toHaveBeenCalledTimes(2); expect(execute.mock.calls[1]).toEqual(execute.mock.calls[0]);
});

it('bugbot-partition-diagnostics-C05: exhaustion reports only the final attempt reason and never allocates a fourth query', async () => {
    const execute = jest.fn().mockResolvedValueOnce('PRIVATE_INVALID').mockResolvedValueOnce('{}')
        .mockResolvedValue(JSON.stringify({ ...valid, reviewed_head_sha: 'foreign' }));
    await expect(run(new FindingsAgentAdapter({ cli: { execute } }))).rejects.toMatchObject({ recovery: { variables: { reason: 'schema-enum', attempts: 3 } } });
    expect(execute).toHaveBeenCalledTimes(3);
});

it('bugbot-partition-diagnostics-C06: non-Bugbot response contracts retain their existing parsing and schema exceptions', () => {
    expect(() => interpretFindingsResponse('', {})).toThrow('Empty response text');
    expect(() => interpretFindingsResponse('bad', { expectJson: true, schema: {} })).toThrow('single valid JSON object');
    expect(() => interpretFindingsResponse('{}', { expectJson: true, schema: { required: ['ordinary'] } })).toThrow('ordinary');
    expect(interpretFindingsResponse('ordinary', {})).toBe('ordinary');
});

it('bugbot-partition-diagnostics-C07: native execution and provider errors retain classification, retryability and bounded attempts', async () => {
    const execute = jest.fn(async () => { throw new AgentCliError('PRIVATE_PROCESS', 'process', false); });
    let failure: unknown; try { await run(new FindingsAgentAdapter({ cli: { execute } })); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ code: 'agent.failed', retryable: false }); expect(failure).toMatchObject({ recovery: undefined });
    expect(JSON.stringify(failure)).not.toContain('PRIVATE_PROCESS'); expect(execute).toHaveBeenCalledTimes(3);
    const provider = new ApplicationError('provider.rate-limited', 'Safe provider state.');
    await expect(run({ query: jest.fn().mockRejectedValue(provider) })).rejects.toBe(provider);
});

it('bugbot-partition-diagnostics-C08: locale and exact legacy attestation rejection remain independent host gates', async () => {
    const query = jest.fn().mockResolvedValue({ ...valid, outputLocale: 'es-ES' });
    await expect(run({ query })).rejects.toMatchObject({ code: 'locale.output-invalid' }); expect(query).toHaveBeenCalledTimes(3);
    query.mockClear().mockResolvedValue({ ...valid, partition_id: 'foreign' });
    await expect(run({ query })).rejects.toThrow('invalid Bugbot partition attestation'); expect(query).toHaveBeenCalledTimes(3);
});

it('bugbot-partition-diagnostics-C09: only the exact closed final diagnostic can enter the public registry', () => {
    for (const reason of BUGBOT_RESPONSE_FAILURE_REASONS) expect(isBugbotPartitionQueryDiagnostic({ reason, attempts: 3 })).toBe(true);
    for (const value of [null, 42, [], {}, { reason: 'PRIVATE_REASON', attempts: 3 }, { reason: 'json-invalid', attempts: 4 },
        { reason: 'json-invalid', attempts: 3, private: 'PRIVATE_VALUE' }]) expect(isBugbotPartitionQueryDiagnostic(value)).toBe(false);
    for (const variables of [{ reason: 'PRIVATE_REASON', attempts: 3 }, { reason: 'json-invalid', attempts: 2 }]) {
        expect(() => new ApplicationError('agent.failed', 'Safe.', { recovery: { id: 'bugbot-partition-query-exhausted', variables } as any })).toThrow(TypeError);
    }
    expect(() => new BugbotResponseFailure('PRIVATE_REASON' as any)).toThrow(TypeError);
});

it('bugbot-partition-diagnostics-C10: English, regional Spanish and fallback surfaces preserve reason, attempts and correlation', () => {
    const error = new ApplicationError('agent.failed', 'Safe.', { correlationId: '11111111-1111-4111-8111-111111111111',
        recovery: { id: 'bugbot-partition-query-exhausted', variables: { reason: 'schema-string-long', attempts: 3 } } });
    for (const locale of ['en-US', 'es-MX', 'fr-FR']) {
        const view = buildApplicationErrorPresentation(error, resolveStaticApplicationErrorCatalog(locale).message);
        expect(view.action).toContain('schema-string-long'); expect(view.impact).toContain('3');
        expect(view.reference).toBe(error.correlationId); expect(view.retainedState).toBeTruthy();
    }
    expect(error.toJSON()).toMatchObject({ recovery: { variables: { reason: 'schema-string-long', attempts: 3 } } });
    const docs = readFileSync(join(__dirname, '../../../../../../../docs/security-operations/operations/error-reference.mdx'), 'utf8');
    const example = JSON.parse(docs.split('{/* bugbot-partition-query-example */}')[1].match(/```json\n([\s\S]*?)\n```/u)![1]);
    const documented = new ApplicationError(example.code, 'Safe.', { retryable: example.retryable, recovery: example.recovery });
    expect(documented.toJSON()).toMatchObject(example);
});

it('bugbot-partition-diagnostics-C11: non-receipt framed completeness failures still stop immediately without retry or relabeling', async () => {
    const error = new BugbotReviewCompletenessError('responseBytes');
    const query = jest.fn().mockRejectedValue(error);
    await expect(run({ query })).rejects.toBe(error); expect(query).toHaveBeenCalledTimes(1);
});

it('bugbot-partition-diagnostics-C12: arbitrary errors and structural lookalikes never become completed-output diagnostics', async () => {
    const internal = new Error('PRIVATE_INTERNAL');
    const brokenHostSchema = { get type(): unknown { throw internal; } };
    expect(() => typed('{}', brokenHostSchema)).toThrow(internal);
    for (const error of [new Error('PRIVATE_UNKNOWN'), { reason: 'schema-enum', name: 'BugbotResponseFailure' }]) {
        const query = jest.fn().mockRejectedValue(error);
        await expect(run({ query })).rejects.toBe(error); expect(query).toHaveBeenCalledTimes(3);
    }
});


const candidate = { id: 'candidate', title: 'Source contradiction', description: 'The candidate needs independent proof.', file: 'src/demo.ts',
    line: 1, endLine: 1, severity: 'low', confidence: 0.5, category: 'correctness', evidence: 'Exact supplied source.', suggestion: null,
    symbol: null, codeSnippet: 'value = 1', suggestedCode: null };
function verificationScenario(mode: 'json' | 'incomplete' | 'valid') {
    const execute = jest.fn(async (request: any) => {
        const p = request.outputSchema.properties;
        if (!p.verification_id) return JSON.stringify({ ...valid, findings: [candidate] });
        if (mode === 'json') return 'PRIVATE_VERIFICATION';
        return JSON.stringify({ outputLocale: 'en-US', verification_id: p.verification_id.enum[0], findings: [], rejected_ids: mode === 'valid' ? ['candidate'] : [] });
    });
    const adapter = new FindingsAgentAdapter({ cli: { execute } });
    const invoke = (source = 'Complete pinned source.') => queryBugbotPartitionFindings(adapter, configuration, source, 'en-US', expected, { enabled: true });
    return { execute, invoke };
}

it('bugbot-partition-diagnostics-C13: native verification parsing shares the three paired-attempt allowance and closed cause', async () => {
    const f = verificationScenario('json');
    await expect(f.invoke()).rejects.toMatchObject({ retryable: false, recovery: { variables: { reason: 'json-invalid', attempts: 3 } } });
    expect(f.execute).toHaveBeenCalledTimes(6);
    expect(f.execute.mock.calls[2]).toEqual(f.execute.mock.calls[0]); expect(f.execute.mock.calls[3]).toEqual(f.execute.mock.calls[1]);
    expect(f.execute.mock.calls[4]).toEqual(f.execute.mock.calls[0]); expect(f.execute.mock.calls[5]).toEqual(f.execute.mock.calls[1]);
});

it('bugbot-partition-diagnostics-C14: incomplete semantic candidate proof reports verification-invalid while complete adjudication remains accepted', async () => {
    const f = verificationScenario('incomplete');
    await expect(f.invoke()).rejects.toMatchObject({ retryable: false, recovery: { variables: { reason: 'verification-invalid', attempts: 3 } } });
    expect(f.execute).toHaveBeenCalledTimes(6);
    const good = verificationScenario('valid'); await expect(good.invoke()).resolves.toMatchObject({ ...valid, findings: [] });
    expect(good.execute).toHaveBeenCalledTimes(2);
});

it('bugbot-partition-diagnostics-C15: known verification capacity failures never acquire a completed-output diagnostic or extra verification query', async () => {
    const f = verificationScenario('valid'); let failure: unknown;
    try { await f.invoke('x'.repeat(128001)); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(ApplicationError); expect(failure).toMatchObject({ code: 'agent.failed', recovery: undefined });
    expect((failure as Error).message).toContain('128000-byte prompt bound'); expect(f.execute).toHaveBeenCalledTimes(3);
});
