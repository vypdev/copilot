import { ImmutableProgressContentRepository } from '../immutable_progress_content_repository';
import * as capacity from '../../../application/policies/progress_recovery_capacity_policy';
import { objectFixture, BASE, HEAD, type FileMap } from './fixtures/progress_object_fixture';

function fixture(before: FileMap = {}, after: FileMap = { a: 'source' }, profile: 'legacy' | 'framed-v1' = 'framed-v1') {
    const f = objectFixture(before, after), repository = new ImmutableProgressContentRepository(f.client, 'owner', 'repo', profile);
    const recover = (path = 'a', status = 'added', previous?: string) => repository.recover(BASE, HEAD, path, status, previous, [path]);
    return { ...f, repository, recover };
}
it('rejects unknown capacity profiles before using the provider', () => {
    const f = objectFixture(); expect(() => new ImmutableProgressContentRepository(f.client, 'o', 'r', 'unknown' as never)).toThrow();
    expect(f.getCommit).not.toHaveBeenCalled();
});
it('keeps the legacy adapter profile unchanged', async () => {
    const f = fixture({}, { a: 'x'.repeat(1_048_577) }, 'legacy');
    expect(f.repository.usage).toBeUndefined(); await expect(f.recover()).rejects.toMatchObject({ code: 'validation.evidence-too-large' });
    expect(f.getBlob).not.toHaveBeenCalled();
});
it.each([1_048_577, 2_097_152])('verifies a %s-byte blob inside the framed per-request limit', async size => {
    const text = 'x'.repeat(size), f = fixture({}, { a: text });
    expect((await f.recover()).head?.text).toBe(text); expect(f.repository.usage!.total.bytes).toBe(size);
});
it('rejects a blob above the framed single-request limit before downloading it', async () => {
    const f = fixture({}, { a: 'x'.repeat(2_097_153) });
    await expect(f.recover()).rejects.toMatchObject({ code: 'validation.evidence-too-large', message: expect.stringContaining('2097152-byte') });
    expect(f.getBlob).not.toHaveBeenCalled();
});
it('advances the byte epoch and charges cached bytes on both immutable sides', async () => {
    const text = 'x'.repeat(2_097_152), f = fixture({ a: text, b: text }, { a: text, b: text });
    await f.recover('a', 'modified'); await f.recover('b', 'modified');
    expect(f.repository.usage).toMatchObject({ frames: 2, current: { bytes: 4_194_304 }, total: { bytes: 8_388_608, files: 2 } });
    expect(f.getBlob).toHaveBeenCalledTimes(1);
});
it('never refreshes global byte credit when moving to another frame', async () => {
    const text = 'x'.repeat(2_097_152), after = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`f${i}`, text])), f = fixture({}, after);
    for (let i = 0; i < 8; i++) await f.recover(`f${i}`);
    await expect(f.recover('f8')).rejects.toMatchObject({ code: 'validation.evidence-too-large', message: expect.stringContaining('bytes recovery capacity exhausted (total)') });
    expect(f.repository.usage!.total.bytes).toBe(16_777_216); expect(f.getBlob).toHaveBeenCalledTimes(1);
});
it('automatically continues beyond 64 files with one complete immutable cache', async () => {
    const f = fixture({}, Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`f${i}`, 'source'])));
    for (let i = 0; i < 65; i++) await f.recover(`f${i}`);
    expect(f.repository.usage).toMatchObject({ frames: 2, current: { files: 1 }, total: { files: 65, bytes: 390 } });
    expect(f.getCommit).toHaveBeenCalledTimes(2); expect(f.getBlob).toHaveBeenCalledTimes(1);
});
it('enforces 256 total files before another provider call or snapshot', async () => {
    const f = fixture({}, Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`f${i}`, 'source'])));
    for (let i = 0; i < 256; i++) await f.recover(`f${i}`);
    const calls = f.getTree.mock.calls.length + f.getBlob.mock.calls.length + f.getCommit.mock.calls.length;
    await expect(f.recover('f256')).rejects.toMatchObject({ message: expect.stringContaining('files recovery capacity exhausted (total)') });
    expect(f.getTree.mock.calls.length + f.getBlob.mock.calls.length + f.getCommit.mock.calls.length).toBe(calls);
});
const deep = (name: string, depth = 200) => name + '/' + 'd/'.repeat(depth) + 'a';
it('continues after the per-frame immutable request budget without widening a request', async () => {
    const a = deep('a'), b = deep('b'), f = fixture({}, { [a]: 'a', [b]: 'b' });
    await f.recover(a); await f.recover(b);
    expect(f.repository.usage!.frames).toBe(2); expect(f.repository.usage!.total.requests).toBeGreaterThan(256);
    expect(f.repository.usage!.current.requests).toBeLessThanOrEqual(256);
});
it('retains the total immutable request ceiling across request frames', async () => {
    const paths = Array.from({ length: 6 }, (_, i) => deep(`f${i}`)), f = fixture({}, Object.fromEntries(paths.map(path => [path, 'a'])));
    for (const path of paths.slice(0, 5)) await f.recover(path);
    const requests = f.getTree.mock.calls.length + f.getBlob.mock.calls.length + f.getCommit.mock.calls.length;
    await expect(f.recover(paths[5])).rejects.toMatchObject({ message: expect.stringContaining('requests recovery capacity exhausted (total)') });
    expect(f.repository.usage!.total.requests).toBe(1_024);
    expect(f.getTree.mock.calls.length + f.getBlob.mock.calls.length + f.getCommit.mock.calls.length).toBe(1_024);
    expect(requests).toBeLessThan(1_024);
});
it('continues complete directory accounting across frames', async () => {
    const f = fixture({}, { a: 'a' });
    for (const tree of f.trees.values()) tree.tree.push(...Array.from({ length: 30_000 }, (_, i) => ({ path: `padding${i}`, sha: BASE, type: 'blob', mode: '100644', size: 0 })));
    await f.recover(); expect(f.repository.usage!.frames).toBe(2);
    expect(f.repository.usage!.total.treeEntries).toBe(60_001);
});
it('rejects an oversized individual directory response without downloading a blob', async () => {
    const f = fixture(); f.trees.get(f.roots.get(BASE)!)!.tree = Array(50_001).fill({ path: 'padding', sha: BASE });
    await expect(f.recover()).rejects.toMatchObject({ message: expect.stringContaining('treeEntries recovery capacity exhausted (single-claim)') });
    expect(f.getBlob).not.toHaveBeenCalled();
});
it('does not relabel unexpected accounting errors as capacity failures', async () => {
    const sentinel = Error('owned accounting fixture'); const spy = jest.spyOn(capacity, 'spendProgressRecovery').mockImplementationOnce(() => { throw sentinel; });
    try { await expect(fixture().recover()).rejects.toBe(sentinel); } finally { spy.mockRestore(); }
});
it.each([401, 403, 429, 500])('preserves genuine provider status %s in the framed profile', async status => {
    const f = fixture(), error = Object.assign(Error('owned provider fixture'), { status }); f.getCommit.mockRejectedValueOnce(error);
    await expect(f.recover()).rejects.toBe(error);
});
it('classifies missing immutable objects without accepting a partial frame', async () => {
    const f = fixture(); f.getBlob.mockRejectedValueOnce(Object.assign(Error('not found'), { status: 404 }));
    await expect(f.recover()).rejects.toMatchObject({ code: 'validation.evidence-unavailable', retryable: false });
});
it.each(['120000', '160000', '040000'])('does not dereference unsupported framed file mode %s', async mode => {
    const f = fixture({}, { a: { text: 'outside', mode } });
    await expect(f.recover()).rejects.toMatchObject({ code: 'validation.evidence-unavailable' }); expect(f.getBlob).not.toHaveBeenCalled();
});
it.each([Buffer.from([0xff]), Buffer.from('a\0b')])('retains binary/UTF-8 refusal in a later-capacity profile %#', async text => {
    const f = fixture({}, { a: text });
    await expect(f.recover()).rejects.toMatchObject({ code: 'validation.evidence-unavailable', recovery: { id: 'progress-binary-evidence-unavailable' } });
});
it('rejects a canonical base64 body whose bytes disagree with the pinned Git object', async () => {
    const f = fixture(); for (const blob of f.blobs.values()) blob.content = Buffer.from('forged').toString('base64');
    await expect(f.recover()).rejects.toMatchObject({ code: 'validation.evidence-unavailable' });
});
it('keeps independent invocation-local caches and counters on retry', async () => {
    const f = fixture(); await f.recover(); const another = new ImmutableProgressContentRepository(f.client, 'o', 'r', 'framed-v1');
    expect(another.usage!.total.requests).toBe(0);
    await another.recover(BASE, HEAD, 'a', 'added', undefined, ['a']); expect(f.getCommit).toHaveBeenCalledTimes(4);
    expect(another.usage!.total).toEqual(f.repository.usage!.total);
});
it('preserves BOM, CRLF and supplementary UTF-8 bytes without normalizing a framed snapshot', async () => {
    const text = '\ufeff# Source\r\n🧪\r\n', f = fixture({}, { a: text });
    expect((await f.recover()).head?.text).toBe(text); expect(f.repository.usage!.total.bytes).toBe(Buffer.byteLength(text));
});
it('rejects a stale directory size even when the exact blob is cached', async () => {
    const f = fixture({}, { a: 'source', b: 'source' }); await f.recover();
    f.trees.get(f.roots.get(HEAD)!)!.tree.find(entry => entry.path === 'b')!.size = 5;
    await expect(f.recover('b')).rejects.toMatchObject({ message: expect.stringContaining('cached blob size disagrees') });
    expect(f.getBlob).toHaveBeenCalledTimes(1);
});
it.each(['added', 'removed', 'renamed', 'copied'])('preserves independently verified %s snapshot semantics across framed recovery', async status => {
    const f = fixture(status === 'added' ? {} : { old: 'source' }, status === 'removed' ? {} : { a: 'source' });
    const path = status === 'removed' ? 'old' : 'a';
    const result = await f.recover(path, status, status === 'renamed' || status === 'copied' ? 'old' : undefined);
    expect(result.comparisonBaseSha).toBe(BASE); expect(result.base?.text ?? result.head?.text).toBe('source');
});
