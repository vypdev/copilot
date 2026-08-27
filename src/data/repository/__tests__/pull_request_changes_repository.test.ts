import { PullRequestChangesRepository } from '../pull_request/pull_request_changes_repository';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import type { GithubPullRequestChangesClient } from '../../../application/ports/github_pull_request_ports';

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
});
