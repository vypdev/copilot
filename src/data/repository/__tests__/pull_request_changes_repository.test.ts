import { PullRequestChangesRepository } from '../pull_request/pull_request_changes_repository';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubPullRequestChangesClient, GithubPullRequestFile } from '../../../infrastructure/github/ports/github_pull_request_provider_ports';

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
}));

const HEAD_SHA = 'a'.repeat(40);
const BASE_SHA = 'b'.repeat(40);

function pullMetadata(changedFiles: number) {
  return { head: { sha: HEAD_SHA }, base: { sha: BASE_SHA, ref: 'develop' }, changed_files: changedFiles };
}

function filePages(count: number): GithubPullRequestFile[][] {
  const files = Array.from({ length: count }, (_, index) => ({
    filename: `src/${index}.ts`,
    status: 'modified',
    additions: 1,
    deletions: 0,
    patch: '@@ -1 +1 @@\n+change',
  }));
  return Array.from({ length: Math.ceil(count / 100) }, (_, index) => files.slice(index * 100, (index + 1) * 100));
}

function createClient(pages: readonly GithubPullRequestFile[][], changedFiles = pages.flat().length) {
  const listFiles = jest.fn(async (parameters: Record<string, unknown>) => ({
    data: pages[Number(parameters.page ?? 1) - 1] ?? [],
  }));
  const get = jest.fn().mockResolvedValue({ data: pullMetadata(changedFiles) });
  const iterator = jest.fn(async function* () {
    for (const data of pages) yield { data };
  });
  const client = { paginate: { iterator }, rest: { pulls: { listFiles, get } } };
  const provider: GithubClientPort<GithubPullRequestChangesClient> = { getClient: jest.fn(() => client) };
  const readBounded = (expectedHeadSha?: string) => new PullRequestChangesRepository(provider)
    .getBoundedBugbotReviewDiffSnapshot('owner', 'repo', 7, 'token', expectedHeadSha);
  return { provider, iterator, listFiles, get, readBounded };
}

describe('PullRequestChangesRepository', () => {
  it('builds all review diff projections from a single paginated traversal', async () => {
    const { provider, iterator } = createClient([[
      {
        filename: 'src/a.ts',
        status: 'modified',
        additions: 2,
        deletions: 1,
        patch: '@@ -4,2 +4,3 @@\n-old\n context\n+new\n+extra',
      },
    ]]);
    const repository = new PullRequestChangesRepository(provider);

    const snapshot = await repository.getReviewDiffSnapshot('owner', 'repo', 7, 'token');

    expect(iterator).toHaveBeenCalledTimes(1);
    expect(snapshot.changes[0]).toEqual(expect.objectContaining({ filename: 'src/a.ts', additions: 2 }));
    expect(snapshot.filesWithFirstDiffLine).toEqual([{ path: 'src/a.ts', firstLine: 4 }]);
    expect(snapshot.filesWithDiffLocations[0].locations).toEqual(expect.arrayContaining([
      { line: 4, side: 'LEFT' },
      { line: 4, side: 'RIGHT' },
      { line: 5, side: 'RIGHT' },
      { line: 6, side: 'RIGHT' },
    ]));
  });

  it('retains a changed file whose provider patch is omitted alongside a normal diff', async () => {
    const { provider } = createClient([[
      { filename: 'assets/binary.png', status: 'added', additions: 0, deletions: 0 },
      { filename: 'src/main.ts', status: 'modified', additions: 1, deletions: 0,
        patch: '@@ -1 +1 @@\n-old\n+new' },
    ]]);
    const snapshot = await new PullRequestChangesRepository(provider)
      .getReviewDiffSnapshot('owner', 'repo', 7, 'token');

    expect(snapshot.changes).toEqual([
      expect.objectContaining({ filename: 'assets/binary.png', patch: '' }),
      expect.objectContaining({ filename: 'src/main.ts', patch: expect.stringContaining('+new') }),
    ]);
    expect(snapshot.filesWithFirstDiffLine).toEqual([{ path: 'src/main.ts', firstLine: 1 }]);
  });

  it('uses every paginated file page in the consolidated diff snapshot', async () => {
    const { provider, iterator } = createClient([
      [{ filename: 'first.ts', status: 'modified', additions: 1, deletions: 0, patch: '@@ -1,1 +8,2 @@' }],
      [
        { filename: 'second.ts', status: 'added', additions: 1, deletions: 0, patch: '@@ -0 +42 @@\n+added' },
        { filename: 'deletions.ts', status: 'modified', additions: 0, deletions: 2, patch: '@@ -3,2 +3,0 @@\n-old\n-lines' },
      ],
    ]);
    const repository = new PullRequestChangesRepository(provider);

    const snapshot = await repository.getReviewDiffSnapshot('owner', 'repo', 7, 'token');

    expect(snapshot.changes.map(({ filename, status }) => ({ filename, status }))).toEqual([
      { filename: 'first.ts', status: 'modified' },
      { filename: 'second.ts', status: 'added' },
      { filename: 'deletions.ts', status: 'modified' },
    ]);
    expect(snapshot.filesWithFirstDiffLine).toEqual([
      { path: 'first.ts', firstLine: 8 },
      { path: 'second.ts', firstLine: 42 },
    ]);
    expect(iterator).toHaveBeenCalledTimes(1);
    });

    it('fails closed when GitHub cannot list changed files', async () => {
        const { provider, iterator } = createClient([]);
        iterator.mockImplementation(() => {
            throw new Error('GitHub unavailable');
        });
        const repository = new PullRequestChangesRepository(provider);

        await expect(repository.getReviewDiffSnapshot('owner', 'repo', 7, 'token')).rejects.toThrow(
            'Unable to list pull request changed files.',
        );
    });

    it.each([0, 1, 1_000, 3_000])('reports %i available files as complete without a probe page', async (count) => {
        const { get, listFiles, readBounded } = createClient(filePages(count));
        const result = await readBounded();
        expect(get).toHaveBeenCalledTimes(2);
        expect(listFiles).toHaveBeenCalledTimes(Math.ceil(count / 100));
        expect(result.snapshot.changes).toHaveLength(count);
        expect(result.coverage).toEqual({
            source: 'diff', status: 'complete', pagesFetched: Math.ceil(count / 100),
            itemsFetched: count, itemsRetained: count, omittedItems: 0, truncatedItems: 0, limitReached: false,
        });
    });

    it('reads all 1,090 paths, including a binary and a rename beyond page ten', async () => {
        const pages = filePages(1_090);
        pages[10][0] = { filename: 'assets/binary.png', status: 'added', additions: 0, deletions: 0 };
        pages[10][89] = {
            filename: 'src/new.ts', previous_filename: 'src/old.ts', status: 'renamed',
            additions: 1, deletions: 1, patch: '@@ -1 +8 @@\n-old\n+new',
        };
        const { listFiles, readBounded } = createClient(pages);
        const { snapshot, coverage } = await readBounded(HEAD_SHA);

        expect(listFiles).toHaveBeenCalledTimes(11);
        expect(listFiles).toHaveBeenLastCalledWith({ owner: 'owner', repo: 'repo', pull_number: 7, page: 11, per_page: 100 });
        expect(snapshot.changes.map(file => file.filename)).toEqual(pages.flat().map(file => file.filename));
        expect(snapshot.changes[1_000]).toMatchObject({ filename: 'assets/binary.png', patch: '' });
        expect(snapshot.changes[1_089]).toMatchObject({ filename: 'src/new.ts', previousFilename: 'src/old.ts' });
        expect(snapshot.filesWithFirstDiffLine).toContainEqual({ path: 'src/new.ts', firstLine: 8 });
        expect(snapshot.filesWithFirstDiffLine).toHaveLength(1_089);
        expect(coverage).toMatchObject({ status: 'complete', itemsRetained: 1_090, omittedItems: 0, limitReached: false });
    });

    it('reports exact omissions at the GitHub file ceiling', async () => {
        const { listFiles, readBounded } = createClient(filePages(3_000), 3_090);
        const { snapshot, coverage } = await readBounded(HEAD_SHA);

        expect(listFiles).toHaveBeenCalledTimes(30);
        expect(snapshot.changes).toHaveLength(3_000);
        expect(coverage).toEqual({
            source: 'diff', status: 'partial', pagesFetched: 30, itemsFetched: 3_000, itemsRetained: 3_000,
            omittedItems: 90, truncatedItems: 0, limitReached: true, providerLimitReached: true,
        });
    });

    it('reports omissions on premature exhaustion without claiming a page limit', async () => {
        const { listFiles, readBounded } = createClient(filePages(1_010), 1_090);
        const { coverage } = await readBounded(HEAD_SHA);

        expect(listFiles).toHaveBeenCalledTimes(11);
        expect(coverage).toMatchObject({ status: 'partial', itemsRetained: 1_010, omittedItems: 80, limitReached: false });
        expect(coverage.providerLimitReached).toBeUndefined();
    });

    it('rejects the entire snapshot when page eleven fails', async () => {
        const { listFiles, readBounded } = createClient(filePages(1_090));
        const listPage = listFiles.getMockImplementation()!;
        listFiles.mockImplementation(parameters => parameters.page === 11
            ? Promise.reject(Object.assign(new Error('GitHub unavailable'), { status: 503 }))
            : listPage(parameters));

        await expect(readBounded(HEAD_SHA)).rejects.toMatchObject({ operation: 'list-files', providerStatus: 503 });
        expect(listFiles).toHaveBeenCalledTimes(11);
    });

    it('rejects a head that is already stale before reading pages', async () => {
        const { listFiles, readBounded } = createClient(filePages(1));
        await expect(readBounded('c'.repeat(40))).rejects.toMatchObject({ operation: 'list-files' });
        expect(listFiles).not.toHaveBeenCalled();
    });

    it.each([
        ['head SHA', { head: { sha: 'c'.repeat(40) } }],
        ['base SHA', { base: { sha: 'c'.repeat(40), ref: 'develop' } }],
        ['base ref', { base: { sha: BASE_SHA, ref: 'master' } }],
        ['file count', { changed_files: 1_091 }],
    ])('rejects a changing %s across pagination', async (_field, changed) => {
        const { get, listFiles, readBounded } = createClient(filePages(1_090));
        get.mockResolvedValueOnce({ data: pullMetadata(1_090) })
            .mockResolvedValueOnce({ data: { ...pullMetadata(1_090), ...changed } });

        await expect(readBounded(HEAD_SHA)).rejects.toMatchObject({ operation: 'list-files' });
        expect(listFiles).toHaveBeenCalledTimes(11);
    });

    it.each([
        { head: {} },
        { base: {} },
        { changed_files: undefined },
        { changed_files: 0.5 },
        { changed_files: -1 },
    ])('rejects unverifiable metadata %p', async (invalid) => {
        const { get, listFiles, readBounded } = createClient(filePages(1));
        get.mockResolvedValue({ data: { ...pullMetadata(1), ...invalid } });
        await expect(readBounded()).rejects.toMatchObject({ operation: 'list-files' });
        expect(listFiles).not.toHaveBeenCalled();
    });

    it.each<[string, GithubPullRequestFile[][], number]>([
        ['more than a page', [filePages(101).flat()], 101],
        ['more than the declared total', filePages(2), 1],
        ['duplicates across pages', [...filePages(100), [filePages(1)[0][0]]], 101],
    ])('rejects %s instead of certifying coverage', async (_label, pages, count) => {
        const { readBounded } = createClient(pages, count);
        await expect(readBounded()).rejects.toMatchObject({ operation: 'list-files' });
    });

    it('fails closed when a pull request has no head commit SHA', async () => {
        const { provider, get } = createClient([]);
        get.mockResolvedValue({ data: { head: {} } });
        const repository = new PullRequestChangesRepository(provider);

        await expect(repository.getPullRequestHeadSha('owner', 'repo', 7, 'token')).rejects.toThrow(
            'Unable to get the pull request head commit.',
        );
    });
});

it('preserves the provider-owned previous path for immutable rename verification', async () => {
    const { provider } = createClient([[{ filename: 'new.ts', previous_filename: 'old.ts', status: 'renamed', additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-old\n+new' }]]);
    const snapshot = await new PullRequestChangesRepository(provider).getReviewDiffSnapshot('owner', 'repo', 7, 'token');
    expect(snapshot.changes[0].previousFilename).toBe('old.ts');
});
