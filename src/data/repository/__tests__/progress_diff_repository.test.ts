import { ProgressDiffRepository } from '../progress_diff_repository';
import type { GithubBranchComparisonClient } from '../../../infrastructure/github/ports/github_branch_provider_ports';

const base = 'a'.repeat(40), head = 'b'.repeat(40);
function fixture() {
    const file = { filename: 'src/feature.ts', status: 'modified', additions: 1, deletions: 1, changes: 2,
        blob_url: 'PRIVATE_BLOB_URL', raw_url: 'PRIVATE_RAW_URL', contents_url: 'PRIVATE_CONTENTS_URL', patch: '-old\n+implemented' };
    const data = { ahead_by: 1, behind_by: 0, total_commits: 1, files: [file], commits: [] };
    const compareCommits = jest.fn(async () => ({ data }));
    const getClient = jest.fn(() => ({ rest: { repos: { compareCommits } } }));
    const repository = new ProgressDiffRepository({ getClient } as unknown as { getClient(token: string): GithubBranchComparisonClient });
    const read = (baseSha = base, headSha = head) => repository.getDiff('acme', 'demo', baseSha, headSha, 'PRIVATE_TOKEN');
    return { file, data, compareCommits, getClient, read };
}

describe('pinned bounded progress diff', () => {
    it('uses exact repository objects and only the admitted file fields', async () => {
        const f = fixture(); const result = await f.read();
        expect(f.compareCommits).toHaveBeenCalledWith({ owner: 'acme', repo: 'demo', base, head, per_page: 1, page: 1 });
        expect(f.getClient).toHaveBeenCalledWith('PRIVATE_TOKEN');
        expect(result).toMatchObject({ baseSha: base, headSha: head });
        expect(Object.isFrozen(result)).toBe(true);
        expect(JSON.parse(result.evidence)).toEqual({ kind: 'pinned-branch-comparison', baseSha: base, headSha: head,
            changes: [{ path: 'src/feature.ts', status: 'modified', additions: 1, deletions: 1, patch: '-old\n+implemented' }] });
        expect(result.evidence).not.toMatch(/PRIVATE_/u);
    });
    it('retains generated file metadata without exposing its patch or certifying a build', async () => {
        const f = fixture(); Object.assign(f.file, { filename: 'build/github_action/index.js', patch: 'PRIVATE_GENERATED_PATCH'.repeat(20_000) });
        const result = await f.read();
        expect(JSON.parse(result.evidence).changes).toEqual([{ path: 'build/github_action/index.js', status: 'modified', additions: 1, deletions: 1, evidence: 'generated-metadata-only' }]);
        expect(result.evidence).not.toContain('PRIVATE_GENERATED_PATCH');
    });
    it('retains generated specification index facts without its oversized patch', async () => {
        const f = fixture(); Object.assign(f.file, { filename: 'specs/CATALOG.md', patch: 'PRIVATE_GENERATED_INDEX'.repeat(30_000) });
        const result = await f.read();
        expect(JSON.parse(result.evidence).changes[0]).toEqual({ path: 'specs/CATALOG.md', status: 'modified', additions: 1, deletions: 1, evidence: 'generated-metadata-only' });
        expect(result.evidence).not.toContain('PRIVATE_GENERATED_INDEX');
    });
    it('requires a complete source patch for the editable specification catalog', async () => {
        const f = fixture(); Object.assign(f.file, { filename: 'specs/catalog.json', patch: undefined });
        await expect(f.read()).rejects.toMatchObject({ code: 'validation.evidence-unavailable' });
    });
    it('reports the 14-file omitted pnpm lockfile patch as terminal evidence loss at exact SHAs', async () => {
        const f = fixture();
        f.data.files = Array.from({ length: 13 }, (_, n) => ({ ...f.file, filename: `frontend/src/${n}.ts` }));
        f.data.files.push({ ...f.file, filename: 'frontend/pnpm-lock.yaml', additions: 973, deletions: 1410, patch: undefined as never });
        await expect(f.read()).rejects.toMatchObject({ code: 'validation.evidence-unavailable', retryable: false,
            retainedState: expect.stringContaining('no model assessment'), action: expect.stringContaining('same commits') });
        expect(f.getClient).toHaveBeenCalledWith('PRIVATE_TOKEN');
        expect(f.compareCommits).toHaveBeenCalledTimes(1);
        expect(f.compareCommits).toHaveBeenCalledWith({ owner: 'acme', repo: 'demo', base, head, per_page: 1, page: 1 });
    });
    it.each(['binary', 'added empty', 'removed empty', 'rename without content evidence'])('does not mistake %s for complete reviewed content', async scenario => {
        const f = fixture();
        Object.assign(f.file, { filename: scenario === 'binary' ? 'assets/image.png' : 'src/empty.ts',
            status: scenario === 'added empty' ? 'added' : scenario === 'removed empty' ? 'removed' : scenario.startsWith('rename') ? 'renamed' : 'modified',
            additions: 0, deletions: 0, patch: undefined });
        await expect(f.read()).rejects.toMatchObject({ code: 'validation.evidence-unavailable', retryable: false });
    });
    it.each(['build/github_action/index.js', 'specs/CATALOG.md'])('retains the explicit generated metadata exception for %s', async filename => {
        const f = fixture(); Object.assign(f.file, { filename, patch: undefined });
        expect(JSON.parse((await f.read()).evidence).changes[0]).toMatchObject({ path: filename, evidence: 'generated-metadata-only' });
    });
    it('assesses a lockfile only when its complete patch is supplied', async () => {
        const f = fixture(); f.file.filename = 'frontend/pnpm-lock.yaml';
        expect(JSON.parse((await f.read()).evidence).changes[0]).toMatchObject({ path: f.file.filename, patch: f.file.patch });
    });
    it('accepts a proven empty same-object comparison', async () => {
        const f = fixture(); f.data.files = []; expect(JSON.parse((await f.read(base, base)).evidence).changes).toEqual([]);
    });
    it('accepts metadata only for an explicitly unchanged source path', async () => {
        const f = fixture(); Object.assign(f.file, { status: 'unchanged', additions: 0, deletions: 0, patch: undefined });
        expect(JSON.parse((await f.read()).evidence).changes[0].patch).toBe('');
    });
    it('admits a proven 299-file inventory while keeping the 300-file ceiling', async () => {
        const f = fixture(); f.data.files = Array.from({ length: 299 }, (_, n) => ({ ...f.file, filename: `src/${n}.ts` }));
        expect(JSON.parse((await f.read()).evidence).changes).toHaveLength(299);
    });
    it('partitions complete large provider evidence but preserves genuine transport errors', async () => {
        const f = fixture(); f.data.files = ['a', 'b'].map(filename => ({ ...f.file, filename, patch: 'x'.repeat(150_000) }));
        expect(await f.read()).toMatchObject({ kind: 'partitioned', partitions: expect.any(Array) });
        const transport = new Error('private provider failure'); f.compareCommits.mockRejectedValue(transport);
        await expect(f.read()).rejects.toBe(transport);
    });
    it.each(['short', 'UPPERCASE'])('rejects %s object identity before provider access', async scenario => {
        const f = fixture(); await expect(f.read(scenario === 'short' ? 'abc123' : base.toUpperCase().replace(/a/gu, 'A'))).rejects.toMatchObject({ code: 'workflow.stale' });
        expect(f.getClient).not.toHaveBeenCalled();
    });
    it.each(['missing files', 'provider file ceiling', 'missing source patch', 'unknown status', 'duplicate path', 'same-object nonempty diff', 'oversized source patch', 'oversized UTF-8 source patch', 'oversized filename', 'empty path', 'non-string path'])('rejects %s without a partial assessment', async scenario => {
        const f = fixture();
        if (scenario === 'missing files') Object.assign(f.data, { files: undefined });
        if (scenario === 'provider file ceiling') f.data.files = Array.from({ length: 300 }, (_, n) => ({ ...f.file, filename: `src/${n}.ts` }));
        if (scenario === 'missing source patch') Object.assign(f.file, { patch: undefined });
        if (scenario === 'unknown status') f.file.status = 'UNKNOWN_PROVIDER_STATUS';
        if (scenario === 'duplicate path') f.data.files.push({ ...f.file });
        if (scenario === 'oversized source patch') f.file.patch = 'x'.repeat(256_000);
        if (scenario === 'oversized UTF-8 source patch') f.file.patch = '🧪'.repeat(64_000);
        if (scenario === 'empty path') f.file.filename = '';
        if (scenario === 'non-string path') f.file.filename = 42 as never;
        if (scenario === 'oversized filename') f.file.filename = 'x'.repeat(1025);
        await expect(f.read(base, scenario === 'same-object nonempty diff' ? base : head)).rejects.toMatchObject({ code: scenario === 'same-object nonempty diff' ? 'workflow.stale' : scenario === 'missing source patch' ? 'validation.evidence-unavailable' : scenario.startsWith('oversized') && scenario !== 'oversized filename' ? 'validation.evidence-too-large' : 'provider.unavailable' });
    });
    it.each([undefined, -1, 0.5])('rejects unproven numeric file facts %s', async additions => {
        const f = fixture(); Object.assign(f.file, { additions }); await expect(f.read()).rejects.toMatchObject({ code: 'provider.unavailable' });
    });
    it.each(['/absolute', '../outside', 'src\\outside', 'src/\0injected'])('rejects unsafe comparison path %s', async filename => {
        const f = fixture(); f.file.filename = filename; await expect(f.read()).rejects.toMatchObject({ code: 'provider.unavailable' });
    });
});
