import { ImmutableProgressContentRepository, safeProgressPath } from '../immutable_progress_content_repository';
import { objectFixture, BASE, HEAD, blobSha, type FileMap } from './fixtures/progress_object_fixture';
function fixture(before: FileMap = { 'src/a': 'before' }, after: FileMap = { 'src/a': 'after' }) {
    const f = objectFixture(before, after);
    const repository = new ImmutableProgressContentRepository(f.client, 'owner', 'repo');
    const recover = (path = 'src/a', status = 'modified', previous?: string) => repository.recover(BASE, HEAD, path, status, previous, [path, 'not-reviewed']);
    return { ...f, repository, recover };
}
describe('immutable bounded progress content', () => {
    it('recovers exact base/head text, content hashes, modes and paths without provider URLs', async () => {
        const f = fixture({ 'src/a': { text: '\ufeffbefore\r\n', mode: '100755' } }, { 'src/a': 'after🧪' });
        expect(await f.recover()).toMatchObject({ comparisonBaseSha: BASE, base: { path: 'src/a', text: '\ufeffbefore\r\n', mode: '100755' }, head: { text: 'after🧪' } });
        expect(f.getCommit.mock.calls.map(([p]) => p.commit_sha)).toEqual([BASE, HEAD]);
        for (const [p] of f.getTree.mock.calls) expect(p).toEqual({ owner: 'owner', repo: 'repo', tree_sha: expect.stringMatching(/^[a-f0-9]{40}$/u) });
        expect(f.getBlob.mock.calls.every(([p]) => !('url' in p))).toBe(true);
    });
    it.each(['added', 'removed'])('proves an empty %s file from Git objects, not API zero statistics', async status => {
        const f = fixture(status === 'added' ? {} : { 'a': '' }, status === 'removed' ? {} : { 'a': '' });
        const result = await f.recover('a', status); expect(result[status === 'added' ? 'head' : 'base']?.text).toBe('');
    });
    it.each(['renamed', 'copied'])('proves identical text for %s with independently resolved paths', async status => {
        const f = fixture({ 'old/a': 'same' }, { 'new/a': 'same' });
        const result = await f.recover('new/a', status, 'old/a');
        expect(result.base?.sha).toBe(result.head?.sha); expect(f.getBlob).toHaveBeenCalledTimes(1);
    });
    it('accepts complete CRLF-wrapped base64 only after canonical decoding and Git hash verification', async () => {
        const f = fixture(); for (const blob of f.blobs.values()) blob.content = blob.content.replace(/(.{4})/gu, '$1\r\n');
        expect((await f.recover()).head?.text).toBe('after');
    });
    it('caches immutable directories and blobs across files within one invocation', async () => {
        const f = fixture({ 'src/a': 'same', 'src/b': 'same' }, { 'src/a': 'same', 'src/b': 'same' });
        await f.recover(); await f.recover('src/b');
        expect(f.getCommit).toHaveBeenCalledTimes(2); expect(f.getTree).toHaveBeenCalledTimes(4); expect(f.getBlob).toHaveBeenCalledTimes(1);
    });
    it.each(['added already present', 'removed still present', 'modified missing base', 'modified missing head'])('rejects %s', async scenario => {
        const f = fixture(scenario === 'modified missing base' ? {} : { 'src/a': 'before' }, scenario === 'modified missing head' ? {} : { 'src/a': 'after' });
        await expect(f.recover('src/a', scenario.startsWith('added') ? 'added' : scenario.startsWith('removed') ? 'removed' : 'modified')).rejects.toMatchObject({ code: 'validation.evidence-unavailable' });
    });
    it.each(['renamed', 'copied'])('rejects %s without an exact safe previous path', async status => { await expect(fixture().recover('src/a', status)).rejects.toMatchObject({ retryable: false }); });
    it.each(['bad base', 'bad head'])('rejects %s identity before requests', async scenario => {
        const f = fixture(); await expect(f.repository.recover(scenario === 'bad base' ? 'main' : BASE, scenario === 'bad head' ? 'branch' : HEAD, 'src/a', 'modified', undefined, ['src/a'])).rejects.toThrow(); expect(f.getCommit).not.toHaveBeenCalled();
    });
    it.each(['commit sha', 'tree sha', 'truncated', 'malformed tree', 'duplicate entry', 'bad blob oid', 'parent mode', 'parent type'])('rejects inconsistent %s evidence', async scenario => {
        const f = fixture(); const root = f.trees.get(f.roots.get(BASE)!)!;
        if (scenario === 'commit sha') f.getCommit.mockResolvedValueOnce({ data: { sha: HEAD, tree: { sha: root.sha } } });
        if (scenario === 'tree sha') root.sha = HEAD;
        if (scenario === 'truncated') root.truncated = true;
        if (scenario === 'malformed tree') root.tree = null as never;
        if (scenario === 'duplicate entry') root.tree.push({ ...root.tree[0] });
        if (scenario === 'bad blob oid') root.tree[0].sha = 'mutable';
        if (scenario === 'parent mode') root.tree[0].mode = '100644';
        if (scenario === 'parent type') root.tree[0].type = 'blob';
        await expect(f.recover()).rejects.toMatchObject({ code: 'validation.evidence-unavailable' }); expect(f.getBlob).not.toHaveBeenCalled();
    });
    it('rejects a malformed commit tree identity', async () => { const f = fixture(); f.getCommit.mockResolvedValueOnce({ data: { sha: BASE, tree: { sha: '' } } }); await expect(f.recover()).rejects.toThrow(); });
    it.each(['120000', '160000', '040000'])('refuses dereferencing nonregular file mode %s', async mode => {
        const f = fixture({ 'src/a': { text: 'target', mode } }); await expect(f.recover()).rejects.toMatchObject({ code: 'validation.evidence-unavailable' });
    });
    it.each([undefined, -1, 0.5])('rejects unproven size %s before downloading', async size => {
        const f = fixture(); f.trees.get(f.roots.get(BASE)!)!.tree[0].type = 'blob';
        const f2 = fixture({ 'a': 'before' }, { 'a': 'after' }); f2.trees.get(f2.roots.get(BASE)!)!.tree[0].size = size;
        await expect(f2.recover('a')).rejects.toThrow(); expect(f2.getBlob).not.toHaveBeenCalled();
    });
    it.each(['sha', 'size', 'encoding', 'nonstring', 'oversized encoded', 'invalid base64', 'short bytes', 'wrong content'])('rejects incomplete blob %s', async scenario => {
        const f = fixture(); const b = f.blobs.get(blobSha(Buffer.from('before')))!;
        if (scenario === 'sha') b.sha = HEAD;
        if (scenario === 'size') b.size++;
        if (scenario === 'encoding') b.encoding = 'utf-8';
        if (scenario === 'nonstring') b.content = 42 as never;
        if (scenario === 'oversized encoded') b.content = 'x'.repeat(500);
        if (scenario === 'invalid base64') b.content = '!!!!!!==';
        if (scenario === 'short bytes') b.content = Buffer.from('short').toString('base64');
        if (scenario === 'wrong content') b.content = Buffer.from('forged').toString('base64');
        await expect(f.recover()).rejects.toMatchObject({ code: 'validation.evidence-unavailable' });
    });
    it.each([Buffer.from([0]), Buffer.from([255]), Buffer.from([0xc3, 0x28])])('rejects binary or non-UTF8 content %#', async bytes => {
        await expect(fixture({ 'src/a': bytes }).recover()).rejects.toMatchObject({ code: 'validation.evidence-unavailable' });
    });
    it('refuses a per-file overrun before blob download', async () => { const f = fixture({ 'src/a': 'x'.repeat(1_048_577) }); await expect(f.recover()).rejects.toMatchObject({ code: 'validation.evidence-too-large' }); expect(f.getBlob).not.toHaveBeenCalled(); });
    it('accepts the exact per-file boundary', async () => { const f = fixture({ 'a': 'x'.repeat(1_048_576) }, {}); expect((await f.recover('a', 'removed')).base?.text).toHaveLength(1_048_576); });
    it('caps total represented bytes even for cached identical blobs', async () => {
        const files = Object.fromEntries(['a', 'b', 'c'].map(path => [path, 'x'.repeat(1_048_576)])); const f = fixture(files, files);
        await f.recover('a'); await f.recover('b'); await expect(f.recover('c')).rejects.toMatchObject({ code: 'validation.evidence-too-large' });
    });
    it('caps total tree entries before downloading any file', async () => {
        const f = fixture(); const root = f.trees.get(f.roots.get(BASE)!)!; root.tree = Array.from({ length: 50_001 }, () => root.tree[0]);
        await expect(f.recover()).rejects.toMatchObject({ code: 'validation.evidence-too-large' }); expect(f.getBlob).not.toHaveBeenCalled();
    });
    it('caps object requests while traversing deeply nested directories', async () => {
        const path = `${'d/'.repeat(255)}a`, f = fixture({ [path]: 'before' }, { [path]: 'after' });
        await expect(f.recover(path)).rejects.toMatchObject({ code: 'validation.evidence-too-large' }); expect(f.getCommit.mock.calls.length + f.getTree.mock.calls.length + f.getBlob.mock.calls.length).toBe(256);
    });
    it.each(['commit', 'tree', 'blob'])('classifies unavailable immutable %s as terminal', async stage => {
        const f = fixture(); (stage === 'commit' ? f.getCommit : stage === 'tree' ? f.getTree : f.getBlob).mockRejectedValueOnce({ status: 404 });
        await expect(f.recover()).rejects.toMatchObject({ code: 'validation.evidence-unavailable', retryable: false, message: expect.stringContaining('not-reviewed') });
    });
    it.each([403, 429, 500])('preserves genuine provider failure %s', async status => { const f = fixture(), error = { status }; f.getBlob.mockRejectedValueOnce(error); await expect(f.recover()).rejects.toBe(error); });
    it.each(['', '/a', '../a', 'a/../b', 'a/./b', 'a//b', 'a\\b', 'a\0b', 'é'.repeat(513), 42])('rejects unsafe repository path %#', path => { expect(safeProgressPath(path)).toBe(false); });
    it.each(['a', 'a/b', 'é'.repeat(512), 'a @ /b'])('admits literal safe path %#', path => { expect(safeProgressPath(path)).toBe(true); });
});

it('rejects inconsistent cached blob size without trusting a second directory entry', async () => {
    const f = fixture({ 'a': 'same', 'b': 'same' }, { 'a': 'same', 'b': 'same' });
    await f.recover('a'); f.trees.get(f.roots.get(BASE)!)!.tree.find(entry => entry.path === 'b')!.size = 5;
    await expect(f.recover('b')).rejects.toMatchObject({ code: 'validation.evidence-unavailable' });
});
it.each(['commit', 'tree', 'blob'])('rejects malformed missing provider data: %s', async stage => {
    const f = fixture(); (stage === 'commit' ? f.getCommit : stage === 'tree' ? f.getTree : f.getBlob).mockResolvedValueOnce({ data: undefined } as never);
    await expect(f.recover()).rejects.toMatchObject({ code: 'validation.evidence-unavailable' });
});
