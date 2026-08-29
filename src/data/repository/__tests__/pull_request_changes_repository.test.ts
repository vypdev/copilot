import { PullRequestChangesRepository } from '../pull_request/pull_request_changes_repository';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubPullRequestChangesClient } from '../../../infrastructure/github/ports/github_pull_request_provider_ports';

jest.mock('../../../utils/logger', () => ({
  logError: jest.fn(),
}));

function createClient(pages: Array<Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>>) {
  const listFiles = jest.fn(async () => ({ data: pages[0] ?? [] }));
  const iterator = jest.fn(async function* () {
    for (const data of pages) yield { data };
  });
  const client = {
    paginate: { iterator },
    rest: {
      pulls: {
        listFiles,
        get: jest.fn(),
      },
    },
  } as unknown as GithubPullRequestChangesClient;
  const provider = { getClient: jest.fn(() => client) } as unknown as GithubClientPort<GithubPullRequestChangesClient>;
  return { provider, iterator };
}

describe('PullRequestChangesRepository', () => {
  it('uses every paginated file page for changed files and diff lines', async () => {
    const { provider, iterator } = createClient([
      [{ filename: 'first.ts', status: 'modified', additions: 1, deletions: 0, patch: '@@ -1,1 +8,2 @@' }],
      [{ filename: 'second.ts', status: 'added', additions: 2, deletions: 0, patch: '@@ -0,0 +42,2 @@' }],
    ]);
    const repository = new PullRequestChangesRepository(provider);

    await expect(repository.getChangedFiles('owner', 'repo', 7, 'token')).resolves.toEqual([
      { filename: 'first.ts', status: 'modified' },
      { filename: 'second.ts', status: 'added' },
    ]);
    await expect(repository.getFilesWithFirstDiffLine('owner', 'repo', 7, 'token')).resolves.toEqual([
      { path: 'first.ts', firstLine: 8 },
      { path: 'second.ts', firstLine: 42 },
    ]);
    expect(iterator).toHaveBeenCalledTimes(2);
    });

    it('fails closed when GitHub cannot list changed files', async () => {
        const { provider, iterator } = createClient([]);
        iterator.mockImplementation(() => {
            throw new Error('GitHub unavailable');
        });
        const repository = new PullRequestChangesRepository(provider);

        await expect(repository.getChangedFiles('owner', 'repo', 7, 'token')).rejects.toThrow(
            'Unable to list pull request changed files.',
        );
    });

    it('fails closed when a pull request has no head commit SHA', async () => {
        const { provider } = createClient([]);
        const client = provider.getClient('token') as unknown as { rest: { pulls: { get: jest.Mock } } };
        client.rest.pulls.get.mockResolvedValue({ data: { head: {} } });
        const repository = new PullRequestChangesRepository(provider);

        await expect(repository.getPullRequestHeadSha('owner', 'repo', 7, 'token')).rejects.toThrow(
            'Unable to get the pull request head commit.',
        );
    });
});
