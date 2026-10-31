import * as partitionPolicy from '../../../application/policies/progress_diff_partition_policy';
import { ApplicationError } from '../../../application/errors/application_error';
import { ProgressDiffRepository } from '../progress_diff_repository';
import { objectFixture, BASE, HEAD, MERGE_BASE, type FileMap } from './fixtures/progress_object_fixture';
import type { GithubBranchComparisonClient } from '../../../infrastructure/github/ports/github_branch_provider_ports';
function fixture(before: FileMap, after: FileMap, filenames = Object.keys(after)) {
    const objects = objectFixture(before, after);
    const file = (filename: string) => ({ filename, status: 'added', additions: 0, deletions: 0, changes: 0, blob_url: 'PRIVATE_URL', raw_url: 'PRIVATE_URL', contents_url: 'PRIVATE_URL' });
    const data = { base_commit: { sha: BASE }, merge_base_commit: { sha: MERGE_BASE }, ahead_by: 1, behind_by: 0, total_commits: 1, files: filenames.map(file), commits: [] };
    const compareCommits = jest.fn(async () => ({ data }));
    const repository = new ProgressDiffRepository({ getClient: () => ({ rest: { repos: { compareCommits } } }) } as { getClient(token: string): GithubBranchComparisonClient }, { getClient: () => objects.client });
    return { ...objects, data, compareCommits, read: () => repository.getDiff('owner', 'repo', BASE, HEAD, 'PRIVATE_TOKEN') };
}
describe('complete comparison patch recovery', () => {
    it('covers all 52 files including eight zero-stat omitted patches in a 1.5MB synthetic comparison', async () => {
        const paths = Array.from({ length: 52 }, (_, i) => `specs/spec-${i}.md`), after = Object.fromEntries(paths.slice(0, 8).map((path, i) => [path, 'x'.repeat(i === 7 ? 215_522 : 32_000)]));
        const f = fixture({}, after, paths);
        for (const file of f.data.files.slice(8)) Object.assign(file, { additions: 1, patch: '@@ -0,0 +1 @@\n+' + 'p'.repeat(23_600) });
        const result = await f.read(); if (result.kind !== 'partitioned') throw Error('Expected parts');
        const changes = result.partitions.flatMap(part => JSON.parse(part.evidence).changes);
        expect(new Set(changes.map(change => change.path))).toEqual(new Set(paths));
        for (const [path, text] of Object.entries(after)) expect(changes.filter(change => change.path === path).map(change => change.recoveredContent.text).join('')).toBe(text);
        expect(result.partitions.length).toBeGreaterThan(1); expect(result.partitions.every(part => Buffer.byteLength(part.evidence) <= 256_000)).toBe(true);
        expect(JSON.stringify(result)).not.toContain('PRIVATE_');
        expect(f.getCommit.mock.calls.map(([p]) => p.commit_sha)).toEqual([MERGE_BASE, HEAD]);
    });
    it('recovers the complete 109259-byte added JSON fixture with nonzero provider statistics', async () => {
        const text = ' '.repeat(109_257) + '{}', f = fixture({}, { 'evidence.json': text }); Object.assign(f.data.files[0], { additions: 2999 });
        const result = await f.read(); expect(result.kind).toBe('partitioned'); expect(result.evidence).toContain('file-1-head-1-of-1');
    });
    it('proves an identical textual rename independently of its zero statistics', async () => {
        const f = fixture({ 'old/a': 'same' }, { 'new/a': 'same' }); Object.assign(f.data.files[0], { status: 'renamed', previous_filename: 'old/a' });
        const result = await f.read(); if (result.kind !== 'partitioned') throw Error('Expected units');
        expect(JSON.parse(result.partitions[0].evidence).changes[0].recoveredContent.side).toBe('both'); expect(f.getBlob).toHaveBeenCalledTimes(1);
    });
    it.each(['truncated hunk', 'cumulative missing hunk', 'oversized complete patch'])('recovers %s instead of submitting partial evidence', async scenario => {
        const f = fixture({}, { 'a': 'complete content' });
        Object.assign(f.data.files[0], { additions: 2, patch: scenario === 'oversized complete patch' ? '@@ -0,0 +1,2 @@\n+' + 'x'.repeat(256_000) + '\n+y' : scenario === 'truncated hunk' ? '@@ -0,0 +1,2 @@\n+x' : '@@ -0,0 +1 @@\n+x' });
        const result = await f.read(); if (result.kind !== 'partitioned') throw Error('Expected recovery');
        expect(result.partitions[0].evidence).toContain('complete content'); expect(result.partitions[0].evidence).not.toContain('"patch"');
    });
    it('prevalidates all inventory entries before content I/O', async () => {
        const f = fixture({}, { 'a': 'text', 'b': 'text' }); f.data.files[1].filename = '../outside';
        await expect(f.read()).rejects.toThrow(); expect(f.getCommit).not.toHaveBeenCalled();
    });
    it('caps recovered files before object requests', async () => {
        const f = fixture({}, Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`file${i}`, 'x'])));
        await expect(f.read()).rejects.toMatchObject({ code: 'validation.evidence-too-large' }); expect(f.getCommit).not.toHaveBeenCalled();
    });
    it.each(['missing merge base', 'wrong requested base'])('rejects %s instead of mixing preimages', async scenario => {
        const f = fixture({}, { 'a': 'text' }); if (scenario === 'missing merge base') f.data.merge_base_commit.sha = ''; else f.data.base_commit.sha = HEAD;
        await expect(f.read()).rejects.toMatchObject({ code: 'validation.evidence-unavailable' }); expect(f.getCommit).not.toHaveBeenCalled();
    });
    it('fails closed with unreviewed paths when recovered serialized contents exceed sixteen parts', async () => {
        const after = Object.fromEntries(['a','b','c','d'].map(path => [path, '\0'.repeat(900_000)]));
        // Use non-NUL controls: valid UTF-8, but six-byte JSON escaping exhausts the unchanged multipart budget.
        for (const path of Object.keys(after)) after[path] = '\u0001'.repeat(900_000);
        await expect(fixture({}, after).read()).rejects.toMatchObject({ code: 'validation.evidence-too-large', message: expect.stringContaining('Unreviewed paths (4)') });
    });
    it('replays from exact objects with fresh invocation budgets and identities but identical complete sources', async () => {
        const f = fixture({}, { 'a': 'x'.repeat(260_000) }); const first = await f.read(); const second = await f.read();
        expect(first.kind).toBe('partitioned'); expect(second.kind).toBe('partitioned');
        if (first.kind !== 'partitioned' || second.kind !== 'partitioned') throw Error('Expected multipart source');
        expect(second.protocol!.attemptId).not.toBe(first.protocol!.attemptId);
        expect(second.protocol!.manifestDigest).not.toBe(first.protocol!.manifestDigest);
        expect(second.protocol!.sourcesDigest).toBe(first.protocol!.sourcesDigest);
        expect(second.partitions.map(part => part.evidence)).toEqual(first.partitions.map(part => part.evidence));
        expect(f.getCommit).toHaveBeenCalledTimes(4);
    });
});

it('rejects a missing merge-base object before immutable reads', async () => {
    const f = fixture({}, { a: 'text' }); delete (f.data as { merge_base_commit?: unknown }).merge_base_commit;
    await expect(f.read()).rejects.toMatchObject({ code: 'validation.evidence-unavailable' }); expect(f.getCommit).not.toHaveBeenCalled();
});
it.each([new Error('unexpected planner defect'), new ApplicationError('workflow.stale', 'Superseded')])('does not misclassify unrelated planning errors as content exhaustion %#', async error => {
    const f = fixture({}, { a: 'text' }); const spy = jest.spyOn(partitionPolicy, 'partitionProgressDiff').mockImplementationOnce(() => { throw error; });
    try { await expect(f.read()).rejects.toBe(error); } finally { spy.mockRestore(); }
});

it('lists all unreviewed paths and leads with the file whose immutable recovery failed', async () => {
    const f = fixture({}, { 'ready': 'x', 'broken': Buffer.from([0]) });
    Object.assign(f.data.files[0], { additions: 1, patch: '@@ -0,0 +1 @@\n+x' });
    await expect(f.read()).rejects.toMatchObject({ message: expect.stringContaining('Unreviewed paths (2): `"broken"`, `"ready"`') });
});

it('requires the native comparison base identity even when every text patch is complete',async()=>{
    const f=fixture({}, {a:'text'});Object.assign(f.data.files[0],{additions:1,patch:'@@ -0,0 +1 @@\n+text'});delete(f.data as {base_commit?:unknown}).base_commit;
    await expect(f.read()).rejects.toMatchObject({code:'validation.evidence-unavailable'});expect(f.getCommit).not.toHaveBeenCalled();
});
