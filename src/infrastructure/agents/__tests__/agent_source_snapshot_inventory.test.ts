import { readSourceSnapshotInventory, gitBlobId } from '../agent_source_snapshot_git';
import { SddSourceContextFailure } from '../../../domain/agent_source_snapshot';
import { SOURCE_SNAPSHOT_LIMITS as LIMIT } from '../../../application/policies/agent_source_snapshot_policy';

const source = { kind: 'pre-branch-sdd', phase: 'analysis', baseSha: 'a'.repeat(40) } as const;
const tree = 'b'.repeat(40), blob = 'c'.repeat(40);
const record = (path: string, size: number | string = 1, mode = '100644', type = 'blob') => `${mode} ${type} ${blob} ${size}\t${path}\0`;
function rejects(raw: Buffer | string, reason: string, treeSha = tree) {
    try { readSourceSnapshotInventory(typeof raw === 'string' ? Buffer.from(raw) : raw, treeSha, source); throw new Error('Expected bounded failure'); }
    catch (error) { expect(error).toBeInstanceOf(SddSourceContextFailure); expect(error).toMatchObject({ reason, source }); }
}
describe('immutable source inventory decoding', () => {
    it('source-context-C17: preserves file modes, bytes and complete object identities', () => {
        const result = readSourceSnapshotInventory(Buffer.from(`040000 tree ${tree} -\tnested\0${record('nested/a')}${record('tool', 0, '100755')}`), tree, source);
        expect(result).toMatchObject({ treeSha: tree, bytes: 1, directories: ['nested'], files: [
            { path: 'nested/a', mode: '100644', bytes: 1, objectId: blob }, { path: 'tool', mode: '100755', bytes: 0, objectId: blob }] });
        expect(result.objects).toEqual([source.baseSha, tree, blob]); expect(Object.isFrozen(result.files[0])).toBe(true);
        expect(gitBlobId(Buffer.from('hello\n'))).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
    });
    it('accepts a genuinely empty selected tree without fabricated entries', () => {
        expect(readSourceSnapshotInventory(Buffer.alloc(0), tree, source)).toMatchObject({ files: [], directories: [], bytes: 0 });
    });
    it.each([Buffer.from([255, 0]), Buffer.from('not-terminated'), Buffer.from('missing-tab\0'), Buffer.from(`100644 blob ${blob}\ta\0`),
        Buffer.from('100644 blob invalid 1\ta\0'), Buffer.from(record('a', '-1')), Buffer.from(record('a', 'not-size')),
        Buffer.from(record('a', Number.MAX_SAFE_INTEGER + 1))])('source-context-C22: malformed object metadata fails closed %#', value => rejects(value, 'object-unavailable'));
    it('source-context-C22: rejects a malformed root tree identity', () => rejects(Buffer.alloc(0), 'object-unavailable', 'develop'));
    it.each([['120000', 'blob'], ['160000', 'commit'], ['040000', 'blob'], ['100644', 'tree']])(
        'source-context-C23: rejects non-regular %s/%s entries', (mode, type) => rejects(record('unsafe', 1, mode, type), 'unsafe-entry'));
    it.each(['../escape', 'a/CON.txt', 'a/.git/config'])('source-context-C24: rejects unsafe names %s', name => rejects(record(name), 'unsafe-entry'));
    it.each([['a', 'A'], ['é', 'e\u0301'], ['x', 'x']])('source-context-C24: rejects aliases %s / %s', (left, right) => rejects(record(left) + record(right), 'unsafe-entry'));
    it('source-context-C25: rejects the first entry beyond its fixed cap', () => {
        rejects(Array.from({ length: LIMIT.entries + 1 }, (_, i) => `040000 tree ${tree} -\td${i}\0`).join(''), 'entry-limit');
    });
    it('source-context-C25: rejects the first regular file beyond its fixed cap', () => {
        rejects(Array.from({ length: LIMIT.files + 1 }, (_, i) => record(`f${i}`, 0)).join(''), 'file-limit');
    });
    it('source-context-C26: rejects a large blob before reading its body', () => rejects(record('large', LIMIT.blobBytes + 1), 'blob-limit'));
    it('source-context-C27: rejects aggregate size beyond the fixed byte ceiling', () => {
        rejects(Array.from({ length: 9 }, (_, i) => record(`blob${i}`, LIMIT.blobBytes)).join(''), 'byte-limit');
    });
    it('source-context-C27: rejects over-limit raw inventory before decoding it', () => rejects(Buffer.alloc(LIMIT.inventoryBytes + 1), 'metadata-limit'));
});
