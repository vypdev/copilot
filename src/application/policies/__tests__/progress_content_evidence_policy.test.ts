import { progressContentUnits, progressRecoveryError } from '../progress_content_evidence_policy';
import { partitionProgressDiff } from '../progress_diff_partition_policy';
import { aggregateProgressFacts, parseProgressPartitionFacts, progressPartitionFactLimit, progressPartitionResponseSchema } from '../progress_partition_response_policy';
const change = { path: 'specs/a.md', status: 'modified', additions: 0, deletions: 0 };
const snapshot = (text: string, sha = 'a'.repeat(40)) => ({ path: change.path, sha, mode: '100644', text });
const units = (text: string) => progressContentUnits(change, { comparisonBaseSha: 'c'.repeat(40), head: snapshot(text) }, 'file-1');
const plan = (text = 'x'.repeat(260_000)) => partitionProgressDiff('a', 'b', units(text));
describe('complete immutable content units', () => {
    it.each(['', 'é🧪\r\n\ufeff', 'x'.repeat(215_522), '\n"\t'.repeat(80_000)])('retains every UTF-8 byte and contiguous offset for source fixture %#', text => {
        const all = units(text); let offset = 0;
        for (const unit of all) { const content = unit.recoveredContent!;
            expect(content).toMatchObject({ byteOffset: offset, byteLength: Buffer.byteLength(String(content.text)), head: { bytes: Buffer.byteLength(text) } });
            offset += Number(content.byteLength); expect(Buffer.byteLength(JSON.stringify(content.text))).toBeLessThanOrEqual(120_000);
        }
        expect(all.map(unit => unit.recoveredContent!.text).join('')).toBe(text); expect(offset).toBe(Buffer.byteLength(text));
        expect(all.every(Object.isFrozen)).toBe(true);
    });
    it('keeps both changed snapshots, modes and rename paths in the recovery identity', () => {
        const result = progressContentUnits(change, { comparisonBaseSha: 'c', base: { ...snapshot('old'), path: 'old/a' }, head: { ...snapshot('new', 'b'.repeat(40)), mode: '100755' } }, 'file-1');
        expect(result.map(unit => unit.recoveredContent!.side)).toEqual(['base', 'head']);
        expect(result[1].recoveredContent).toMatchObject({ base: { path: 'old/a', bytes: 3 }, head: { mode: '100755' } });
    });
    it('supplies identical rename contents once with both independently verified identities', () => {
        const result = progressContentUnits(change, { comparisonBaseSha: 'c', base: snapshot('same'), head: { ...snapshot('same'), path: 'new/a' } }, 'file-1');
        expect(result).toHaveLength(1); expect(result[0].recoveredContent!.side).toBe('both');
    });
    it('supplies removal contents without claiming a head snapshot', () => {
        expect(progressContentUnits(change, { comparisonBaseSha: 'c', base: snapshot('old') }, 'file-1')[0].recoveredContent).toMatchObject({ head: null, side: 'base' });
    });
    it('forces even small recovered evidence through explicit unit validation', () => {
        const result = plan('small'); expect(result.kind).toBe('partitioned');
        if (result.kind !== 'partitioned') throw Error('Expected units');
        expect(result.partitions).toHaveLength(1); expect(result.partitions[0].units).toMatchObject([{ id: 'file-1-head-1-of-1', path: change.path, content: { side: 'head', byteOffset: 0, byteLength: 5 } }]);
        expect(JSON.stringify(result.partitions[0].units)).not.toContain('small');
        expect(Object.isFrozen(result.partitions[0].units![0])).toBe(true);
    });
    it('packs repeated physical paths with distinct complete unit assignments', () => {
        const result = plan(); if (result.kind !== 'partitioned') throw Error('Expected units');
        expect(result.partitions.flatMap(part => part.units)).toHaveLength(3);
        expect(result.partitions.flatMap(part => JSON.parse(part.evidence).changes).map(unit => unit.recoveredContent.text).join('')).toBe('x'.repeat(260_000));
        expect(result.partitions.every(part => new Set(part.paths).size === part.paths.length)).toBe(true);
    });
    it.each(['missing id', 'duplicate id', 'unit ceiling'])('rejects ambiguous or oversized complete unit inventory: %s', reason => {
        let changes = [...units('x'), { ...change, patch: '+x' }];
        if (reason === 'duplicate id') changes = [units('x')[0], units('x')[0]];
        if (reason === 'unit ceiling') changes = Array.from({ length: 513 }, (_, i) => ({ ...change, unitId: String(i) }));
        expect(() => partitionProgressDiff('a', 'b', changes)).toThrow(expect.objectContaining({ code: 'validation.evidence-too-large' }));
    });
    it('bounds diagnostic paths without exposing arbitrary content or dropping the total', () => {
        const error = progressRecoveryError('content unavailable', Array.from({ length: 20 }, (_, i) => `file-${i}`));
        expect(error.message).toContain('Unreviewed paths (20)'); expect(error.message).toContain('file-7'); expect(error.message).not.toContain('file-8'); expect(error.retryable).toBe(false);
    });
});

describe('exact recovered-unit analysis', () => {
    const part = { id: 'p', paths: ['same', 'other'], units: [{ id: 'u1', path: 'same' }, { id: 'u2', path: 'same' }, { id: 'u3', path: 'other' }], evidence: 'complete' };
    const response = () => ({ outputLocale: 'en-US', partitionId: 'p', files: part.units.map(unit => ({ unitId: unit.id, path: unit.path, implemented: 'Observed', remaining: 'Unknown' })) });
    it('requires unit IDs and counts rather than collapsing physical paths', () => {
        expect(progressPartitionResponseSchema(part)).toMatchObject({ properties: { files: { minItems: 3, maxItems: 3, items: { required: ['path', 'implemented', 'remaining', 'unitId'], properties: { unitId: { enum: ['u1', 'u2', 'u3'] } } } } } });
        expect(parseProgressPartitionFacts(response(), part, 'en-US')).toEqual(response().files);
    });
    it.each(['missing', 'duplicate', 'wrong unit', 'wrong path', 'extra', 'no unit id', 'nontext unit'])('rejects %s evidence-unit response', scenario => {
        const value = response();
        if (scenario === 'missing') value.files.pop();
        if (scenario === 'duplicate') value.files[1] = value.files[0];
        if (scenario === 'wrong unit') value.files[0].unitId = 'forged';
        if (scenario === 'wrong path') value.files[0].path = 'other';
        if (scenario === 'extra') value.files.push(value.files[0]);
        if (scenario === 'no unit id') delete (value.files[0] as { unitId?: string }).unitId;
        if (scenario === 'nontext unit') value.files[0].unitId = 42 as never;
        expect(() => parseProgressPartitionFacts(value, part, 'en-US')).toThrow(expect.objectContaining({ code: 'agent.failed' }));
    });
    it('budgets all unit facts and exposes their complete identity in the final aggregate', () => {
        const limit = progressPartitionFactLimit('a', 'b', [part]);
        const value = response(); for (const fact of value.files) { fact.implemented = '\0'.repeat(limit); fact.remaining = '🧪'.repeat(limit); }
        const facts = parseProgressPartitionFacts(value, part, 'en-US', limit);
        const result = JSON.parse(aggregateProgressFacts('a', 'b', [part], [facts]));
        expect(result.partitions[0].units).toEqual(part.units); expect(result.files).toHaveLength(3); expect(result.files[1].unitId).toBe('u2');
    });
});

it('rejects partial aggregation even if a caller bypasses the sequential workflow', () => {
    const part = { id: 'p', paths: ['a'], units: [{ id: 'u1', path: 'a' }], evidence: 'source' };
    expect(() => aggregateProgressFacts('a', 'b', [part], [])).toThrow();
    expect(() => aggregateProgressFacts('a', 'b', [part], [[]])).toThrow();
});
