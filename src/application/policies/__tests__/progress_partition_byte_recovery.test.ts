import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { progressPartitionFactBounds } from '../progress_partition_response_policy';

it('progress-partition-size-C01: framed source facts use the exact JSON-byte allocation inside the original aggregate budget', () => {
    const part = { id: 'part-owned', paths: ['a.ts'], evidence: 'Complete source.' };
    const legacy = progressPartitionFactBounds('a'.repeat(40), 'b'.repeat(40), [part], 4_000);
    const framed = progressPartitionFactBounds('a'.repeat(40), 'b'.repeat(40), [part], 4_000, 'framed-v1');
    expect(framed.factJsonBytes).toBeGreaterThan(legacy.factLimit);
    expect(framed.factLimit).toBe(600);
    expect(framed.factJsonBytes).toBeLessThanOrEqual(3_600);
});

import { queryProgressPartition } from '../../usecases/actions/query_progress_partition_workflow';
import { progressPartitionResponseSchema } from '../progress_partition_response_policy';
import { productFacingAgentQueryOptions } from '../agent_output_locale_policy';
import { FindingsAgentAdapter } from '../../../data/repository/ai/findings_agent_adapter';

it('progress-partition-size-C02: a native fact inside the point cap but outside its encoded-byte quota uses the same one-part replacement', async () => {
    const part = { id: 'part-owned', paths: ['a.ts'], evidence: 'Complete source.' }, schema = progressPartitionResponseSchema(part, 8);
    const request = { agentId: 'plan', prompt: 'Complete source.', configuration: { provider: 'codex' as const, model: 'fixture' },
        options: productFacingAgentQueryOptions('progress-partition', schema) };
    const response = (implemented: string) => ({ outputLocale: 'en-US', partitionId: part.id, files: [{ path: 'a.ts', implemented, remaining: 'OK' }] });
    const good = response('OK'), execute = jest.fn().mockResolvedValueOnce(JSON.stringify(response('\u0000'.repeat(2)))).mockResolvedValue(JSON.stringify(good));
    const agent = new FindingsAgentAdapter({ cli: { execute } });
    await expect(queryProgressPartition(agent, request, part, 8, 'en-US', 8)).resolves.toEqual(good);
    expect(execute).toHaveBeenCalledTimes(2);
});

import { verifyProgressPartitionBytes, bindProgressPartitionBytes, progressPartitionBytesRejected } from '../progress_partition_byte_policy';
import { ProgressPartitionByteFailure, isProgressPartitionByteDiagnostic, isProgressPartitionLengthDiagnostic } from '../../../domain/progress_partition_length_failure';
import { ApplicationError } from '../../errors/application_error';
import { aggregateProgressFacts } from '../progress_partition_response_policy';
import { aggregateProgressReceipts, framedProgressFactBounds, parseProgressPartitionReceipt } from '../progress_partition_receipt_policy';
import { bound } from './fixtures/framed_progress_fixture';

function fixture(limit = 8, byteLimit: number | undefined = 8, locale = 'en-US') {
    const part = { id: 'part-owned', paths: ['a.ts'], evidence: 'Complete original immutable source.' };
    const schema = progressPartitionResponseSchema(part, limit);
    const request = { agentId: 'plan', prompt: 'Complete original immutable source.', configuration: { provider: 'codex' as const, model: 'fixture', effort: 'low' },
        options: productFacingAgentQueryOptions('progress-partition', schema) };
    const response = (implemented = 'OK', remaining = 'OK') => ({ outputLocale: locale, partitionId: 'part-owned', files: [{ path: 'a.ts', implemented, remaining }] });
    const native = (responses: readonly unknown[]) => {
        let count = 0;
        const execute = jest.fn(async (_request: any) => {
            const value = responses[Math.min(count++, responses.length - 1)]; if (value instanceof Error) throw value;
            return JSON.stringify(value);
        });
        const agent = new FindingsAgentAdapter({ cli: { execute } });
        return { execute, invoke: () => queryProgressPartition(agent, request, part, limit, locale, byteLimit) };
    };
    return { part, schema, request, response, native, verify: (value: unknown) => verifyProgressPartitionBytes(value, part, limit, locale, byteLimit) };
}
const details = (changes: Record<string, unknown> = {}) => ({ partitionId: 'part-owned', filePath: 'a.ts', unitId: 'none',
    field: '$.files[0].implemented', maximum: 8, observed: 12, outputLocale: 'en-US', ...changes });

it('progress-partition-size-C03: an already admitted 113-point native contract is never widened during its replacement', async () => {
    const f = fixture(113, 678), flow = f.native([f.response('x'.repeat(116))]);
    await expect(flow.invoke()).rejects.toMatchObject({ retryable: false, recovery: { id: 'progress-partition-length-invalid', variables: { maximum: 113, observed: 116 } } });
    expect(flow.execute).toHaveBeenCalledTimes(2);
    expect((flow.execute.mock.calls[0][0] as any).outputSchema).toBe((flow.execute.mock.calls[1][0] as any).outputSchema);
    expect((flow.execute.mock.calls[1][0] as any).outputSchema.properties.files.items.properties.implemented.maxLength).toBe(113);
});

it('progress-partition-size-C04: every formerly admitted worst-escaped fact still fits the exact framed byte allocation', () => {
    const f = fixture(), old = progressPartitionFactBounds('a'.repeat(40), 'b'.repeat(40), [f.part], 4_000);
    const current = progressPartitionFactBounds('a'.repeat(40), 'b'.repeat(40), [f.part], 4_000, 'framed-v1');
    const value = f.response('\u0000'.repeat(old.factLimit), '\u0000'.repeat(old.factLimit));
    expect(() => verifyProgressPartitionBytes(value, f.part, current.factLimit, 'en-US', current.factJsonBytes)).not.toThrow();
});

it('progress-partition-size-C05: actual Spanish, CJK and astral UTF-8 costs enforce exact byte boundaries without trimming', () => {
    const f = fixture(16, 16, 'es-ES');
    for (const value of ['é'.repeat(8), '漢'.repeat(5), '🧪'.repeat(4)]) {
        const response = f.response(value); expect(() => f.verify(response)).not.toThrow(); expect(response.files[0].implemented).toBe(value);
    }
    for (const value of ['é'.repeat(9), '漢'.repeat(6), '🧪'.repeat(5)]) expect(() => f.verify(f.response(value))).toThrow(ProgressPartitionByteFailure);
});

it('progress-partition-size-C06: JSON quote, backslash and control escaping consume bytes beyond the Unicode count', () => {
    const f = fixture(16, 16), exactly = '"\\'.repeat(4);
    expect(() => f.verify(f.response(exactly))).not.toThrow();
    expect(() => f.verify(f.response(exactly + '"'))).toThrow(expect.objectContaining({ details: expect.objectContaining({ maximum: 16, observed: 18 }) }));
    expect(() => f.verify(f.response('\u0000'.repeat(3)))).toThrow(expect.objectContaining({ details: expect.objectContaining({ observed: 18 }) }));
});

it('progress-partition-size-C07: remaining-byte recovery reuses complete source, identities, configuration and schema without rejected text', async () => {
    const f = fixture(40, 40), flow = f.native([f.response('OK', 'PRIVATE_' + '\u0000'.repeat(6)), f.response()]);
    await expect(flow.invoke()).resolves.toEqual(f.response()); expect(flow.execute).toHaveBeenCalledTimes(2);
    const [first, second] = flow.execute.mock.calls.map(call => call[0] as any);
    expect(second.configuration).toEqual(first.configuration); expect(second.outputSchema).toBe(first.outputSchema);
    expect(second.prompt).toContain('Complete original immutable source.'); expect(second.prompt).not.toContain('PRIVATE_');
});

it('progress-partition-size-C08: persistent byte overflow is non-retryable and terminates after two complete native calls', async () => {
    const f = fixture(), flow = f.native([f.response('\u0000'.repeat(2))]);
    await expect(flow.invoke()).rejects.toMatchObject({ code: 'agent.failed', retryable: false, recovery: { id: 'progress-partition-bytes-invalid', variables: {
        partitionId: 'part-owned', filePath: 'a.ts', unitId: 'none', field: '$.files[0].implemented', maximum: 8, observed: 12,
    } } });
    expect(flow.execute).toHaveBeenCalledTimes(2);
});

it('progress-partition-size-C09: mixed byte and native point failures share one allowance and report the second dimension', async () => {
    const f = fixture();
    for (const byteFirst of [true, false]) {
        const bytes = f.response('\u0000'.repeat(2)), points = f.response('x'.repeat(9)), flow = f.native(byteFirst ? [bytes, points] : [points, bytes]);
        await expect(flow.invoke()).rejects.toMatchObject({ retryable: false, recovery: { id: byteFirst ? 'progress-partition-length-invalid' : 'progress-partition-bytes-invalid' } });
        expect(flow.execute).toHaveBeenCalledTimes(2);
    }
});

it('progress-partition-size-C10: every ordinary field and identity validates before a byte rejection can allocate recovery', async () => {
    const f = fixture(), bad = f.response('\u0000'.repeat(2));
    for (const value of [{ ...bad, outputLocale: 'es-ES' }, { ...bad, partitionId: 'foreign' }, { ...bad, PRIVATE_KEY: 'PRIVATE_VALUE' },
        { ...bad, files: [] }, { ...bad, files: [{ ...bad.files[0], path: 'foreign.ts' }] }]) {
        const flow = f.native([value]); await expect(flow.invoke()).rejects.toBeDefined(); expect(flow.execute).toHaveBeenCalledTimes(1);
    }
    const part = { ...f.part, paths: ['a.ts', 'b.ts'], units: [{ id: 'u1', path: 'a.ts' }, { id: 'u2', path: 'b.ts' }] };
    const duplicate = { ...bad, files: [{ ...bad.files[0], unitId: 'u1' }, { path: 'a.ts', unitId: 'u1', implemented: 'OK', remaining: 'OK' }] };
    expect(() => verifyProgressPartitionBytes(duplicate, part as any, 8, 'en-US', 8)).not.toThrow(ProgressPartitionByteFailure);
    expect(() => verifyProgressPartitionBytes(duplicate, part as any, 8, 'en-US', 8)).toThrow();
});

it('progress-partition-size-C11: caller mutation cannot alter captured source, schema, configuration or byte allocation', async () => {
    const f = fixture(), bad = f.response('\u0000'.repeat(2)), good = f.response(); let count = 0;
    const execute = jest.fn(async (_request: any) => {
        if (++count === 1) {
            f.part.id = 'foreign'; (f.part.paths as string[])[0] = 'foreign.ts'; f.request.configuration.model = 'changed';
            (f.schema as any).properties.files.items.properties.implemented.maxLength = 999;
        }
        return JSON.stringify(count === 1 ? bad : good);
    });
    await expect(queryProgressPartition(new FindingsAgentAdapter({ cli: { execute } }), f.request, f.part, 8, 'en-US', 8)).resolves.toEqual(good);
    expect(execute).toHaveBeenCalledTimes(2); expect(Object.isFrozen(f.schema)).toBe(false);
    for (const [request] of execute.mock.calls as unknown as [[any], [any]]) {
        expect(request.configuration.model).toBe('fixture'); expect(request.outputSchema.properties.files.items.properties.implemented.maxLength).toBe(8);
    }
});

it('progress-partition-size-C12: provider and cancellation failures retain identity, retryability and the original signal', async () => {
    for (const afterBytes of [false, true]) {
        const f = fixture(), failure = new ApplicationError('workflow.cancelled', 'Safe cancellation.'), controller = new AbortController();
        let count = 0;
        const execute = jest.fn(async (request: any) => {
            expect(request.signal).toBe(controller.signal);
            if (!afterBytes || ++count === 2) throw failure;
            return JSON.stringify(f.response('\u0000'.repeat(2)));
        });
        await expect(queryProgressPartition(new FindingsAgentAdapter({ cli: { execute } }), { ...f.request, signal: controller.signal }, f.part, 8, 'en-US', 8)).rejects.toBe(failure);
        expect(execute).toHaveBeenCalledTimes(afterBytes ? 2 : 1);
    }
    const f = fixture(), failure = new ApplicationError('provider.unavailable', 'Safe provider state.'), flow = f.native([f.response('\u0000'.repeat(2)), failure]);
    await expect(flow.invoke()).rejects.toBe(failure); expect(flow.execute).toHaveBeenCalledTimes(2);
});

it('progress-partition-size-C13: invalid byte allocations fail before the first query without exposing arbitrary configuration', async () => {
    const f = fixture();
    for (const bytes of [0, -1, 1.5, 3_601, Number.NaN, Number.POSITIVE_INFINITY, 'PRIVATE_VALUE'] as any[]) {
        const query = jest.fn();
        await expect(queryProgressPartition({ query }, f.request, f.part, 8, 'en-US', bytes)).rejects.toMatchObject({ code: 'configuration.unsupported' });
        expect(query).not.toHaveBeenCalled();
        expect(() => verifyProgressPartitionBytes(f.response(), f.part, 8, 'en-US', bytes)).toThrow(ApplicationError);
    }
});

it('progress-partition-size-C14: the unframed query contract stays compatible when no byte quota was admitted', async () => {
    const f = fixture(), response = {}, query = jest.fn().mockResolvedValue(response);
    await expect(queryProgressPartition({ query }, f.request, f.part, 8, 'en-US')).resolves.toBe(response);
    expect(query).toHaveBeenCalledTimes(1); expect(query.mock.calls[0][0]).toEqual(f.request);
});

it('progress-partition-size-C15: byte facts are closed, immutable and distinct from the original 600-point diagnostic', () => {
    const valid = details(), { outputLocale: _locale, ...facts } = valid;
    expect(isProgressPartitionByteDiagnostic(facts)).toBe(true);
    expect(isProgressPartitionByteDiagnostic({ ...facts, maximum: 678, observed: 700 })).toBe(true);
    expect(isProgressPartitionLengthDiagnostic({ ...facts, maximum: 678, observed: 700 })).toBe(false);
    for (const value of [null, [], 42, {}, { ...facts, PRIVATE_KEY: 'PRIVATE_VALUE' }, { ...facts, field: '$.files[0].PRIVATE_KEY' },
        { ...facts, maximum: 3_601 }, { ...facts, maximum: 0 }, { ...facts, observed: 8 }, { ...facts, observed: 3_601 }, { ...facts, observed: 12.5 }]) {
        expect(isProgressPartitionByteDiagnostic(value)).toBe(false);
    }
    const error = new ProgressPartitionByteFailure(valid); valid.observed = 20;
    expect(error.details.observed).toBe(12); expect(Object.isFrozen(error.details)).toBe(true);
    expect(() => new ProgressPartitionByteFailure({ ...details(), PRIVATE_KEY: 'PRIVATE_VALUE' } as any)).toThrow(TypeError);
});

it('progress-partition-size-C16: foreign or corrupted byte carriers cannot acquire recovery authority', () => {
    const f = fixture(), error = new ProgressPartitionByteFailure(details());
    expect(bindProgressPartitionBytes(error, f.part, 8, 'en-US')).toMatchObject({ maximum: 8, observed: 12 });
    for (const changes of [{ partitionId: 'foreign' }, { filePath: 'foreign.ts' }, { unitId: 'foreign' }, { maximum: 9 }, { outputLocale: 'es-ES' }]) {
        expect(bindProgressPartitionBytes(new ProgressPartitionByteFailure(details(changes)), f.part, 8, 'en-US')).toBeNull();
    }
    const scoped = { ...f.part, units: [{ id: 'u1', path: 'a.ts' }] } as any;
    expect(bindProgressPartitionBytes(new ProgressPartitionByteFailure(details({ unitId: 'u1' })), scoped, 8, 'en-US')).toBeTruthy();
    expect(bindProgressPartitionBytes(error, scoped, 8, 'en-US')).toBeNull();
    expect(bindProgressPartitionBytes({ details: details() }, f.part, 8, 'en-US')).toBeNull();
    for (const invalid of [null, [], 42, { ...details(), PRIVATE_KEY: 'PRIVATE_VALUE' }]) {
        Object.defineProperty(error, 'details', { value: invalid, configurable: true });
        expect(bindProgressPartitionBytes(error, f.part, 8, 'en-US')).toBeNull();
    }
});

it('progress-partition-size-C17: aggregation revalidates every field quota even for forged receipts below the total budget', () => {
    const diff = bound(), budget = 5_000, bounds = framedProgressFactBounds(diff, budget);
    const receipts = diff.partitions.map(part => parseProgressPartitionReceipt({ outputLocale: 'en-US', partitionId: part.id,
        files: part.units!.map(unit => ({ path: unit.path, unitId: unit.id, implemented: 'OK', remaining: 'OK' })) }, part, 'en-US', bounds.factLimit, bounds.factJsonBytes));
    expect(Buffer.byteLength(aggregateProgressReceipts(diff, receipts, budget))).toBeLessThanOrEqual(budget);
    const forged = receipts.map((receipt, i) => i ? receipt : { ...receipt, files: receipt.files.map((fact, j) => j ? fact : {
        ...fact, implemented: '\u0000'.repeat(Math.floor(bounds.factJsonBytes! / 6) + 1),
    }) });
    expect(() => aggregateProgressReceipts(diff, forged, budget)).toThrow(expect.objectContaining({ recovery: { id: 'progress-result-contract-invalid', variables: expect.objectContaining({ reason: 'partition-facts-invalid' }) } }));
});

it('progress-partition-size-C18: useful full ASCII facts consume the real byte budget while every original unit remains present', () => {
    const f = fixture(), base = 'a'.repeat(40), head = 'b'.repeat(40), budget = 4_000;
    const bounds = progressPartitionFactBounds(base, head, [f.part], budget, 'framed-v1');
    const value = f.response('A'.repeat(bounds.factLimit), 'B'.repeat(bounds.factLimit));
    expect(() => verifyProgressPartitionBytes(value, f.part, bounds.factLimit, 'en-US', bounds.factJsonBytes)).not.toThrow();
    const result = aggregateProgressFacts(base, head, [f.part], [value.files], budget, 'framed-v1');
    expect(Buffer.byteLength(result)).toBeLessThanOrEqual(budget); expect(JSON.parse(result).files).toEqual(value.files);
});

import { buildApplicationErrorPresentation } from '../application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../application_error_message_catalog';
import { progressPartitionLengthRejected, progressPartitionRepairPrompt } from '../progress_partition_length_policy';
import { progressPartitionLengthPresentation } from '../../../domain/progress_partition_length_failure';

it('progress-partition-size-C23: public byte diagnostics round-trip exact facts and render the same bounded action across locales', () => {
    const { outputLocale: _locale, ...facts } = details({ maximum: 678, observed: 700 });
    const error = progressPartitionBytesRejected(facts);
    expect(error.toJSON()).toMatchObject({ code: 'agent.failed', retryable: false, recovery: { id: 'progress-partition-bytes-invalid', variables: facts } });
    expect(progressPartitionLengthPresentation(facts).maximum).toBe(678);
    const docs = readFileSync(join(__dirname, '../../../../docs/security-operations/operations/error-reference.mdx'), 'utf8');
    const example = JSON.parse(docs.split('{/* progress-partition-bytes-example */}')[1].match(/```json\r?\n([\s\S]*?)\r?\n```/u)![1]);
    const documented = new ApplicationError(example.code, 'Safe.', { retryable: example.retryable, recovery: example.recovery });
    expect(documented.toJSON()).toMatchObject(example);
    for (const locale of ['en-US', 'es-MX', 'fr-FR']) {
        const view = buildApplicationErrorPresentation(error, resolveStaticApplicationErrorCatalog(locale).message);
        expect(view.action).toContain('UTF-8'); expect(view.action).toContain('700'); expect(view.action).toContain('678');
        expect(view.reference).toBe(error.correlationId); expect(view.retainedState).toBeTruthy();
    }
    expect(() => new ApplicationError('agent.failed', 'Safe.', { recovery: { id: 'progress-partition-bytes-invalid', variables: { ...facts, PRIVATE_KEY: 'PRIVATE_VALUE' } } as any })).toThrow(TypeError);
    expect(() => new ApplicationError('agent.failed', 'Safe.', { recovery: { id: 'progress-partition-bytes-invalid', variables: { ...facts, observed: 678 } } })).toThrow(TypeError);
});

it('progress-partition-size-C24: both exhausted dimensions stop unchanged loops while generic agent failures and complete repair source stay compatible', () => {
    const { outputLocale: _locale, ...facts } = details();
    expect(progressPartitionLengthRejected(facts).retryable).toBe(false); expect(progressPartitionBytesRejected(facts).retryable).toBe(false);
    expect(new ApplicationError('agent.failed', 'Safe generic failure.').retryable).toBe(true);
    const source = 'Every complete original source unit.';
    expect(progressPartitionRepairPrompt(source)).toContain(source);
    expect(progressPartitionRepairPrompt(source)).toContain('code-point and JSON UTF-8 byte limits');
    for (const locale of ['en-US', 'es-ES']) {
        const catalog = resolveStaticApplicationErrorCatalog(locale).message;
        for (const error of [progressPartitionLengthRejected(facts), progressPartitionBytesRejected(facts)]) {
            const view = buildApplicationErrorPresentation(error, catalog);
            expect(view.action).toMatch(locale === 'en-US' ? /Do not automatically repeat/u : /No repitas automáticamente/u);
        }
    }
});
