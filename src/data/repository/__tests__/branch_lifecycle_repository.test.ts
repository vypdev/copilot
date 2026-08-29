import type { GithubBranchClient } from '../../../infrastructure/github/ports/github_branch_provider_ports';
import type { GithubClientPort } from '../../../infrastructure/github/ports/github_client_provider_port';
import { BranchLifecycleRepository } from '../branch_lifecycle_repository';

function createRepository(pages: Array<Array<{ name: string }>>) {
    const listBranches = jest.fn(async ({ page }: { page: number }) => ({
        data: pages[page - 1] ?? [],
    }));
    const client = {
        rest: {
            repos: { listBranches },
            git: { getRef: jest.fn(), deleteRef: jest.fn() },
        },
    } as unknown as GithubBranchClient;
    const githubClient = {
        getClient: jest.fn(() => client),
    } as unknown as GithubClientPort<GithubBranchClient>;
    return { repository: new BranchLifecycleRepository(githubClient), listBranches };
}

describe('BranchLifecycleRepository', () => {
    it('loads all branch pages and stops at the first short page', async () => {
        const { repository, listBranches } = createRepository([
            Array.from({ length: 100 }, (_, index) => ({ name: `branch-${index}` })),
            [{ name: 'last-branch' }],
        ]);

        await expect(repository.getListOfBranches('owner', 'repo', 'token')).resolves.toHaveLength(101);
        expect(listBranches).toHaveBeenCalledTimes(2);
    });

    it('fails instead of looping forever when pagination never ends', async () => {
        const { repository, listBranches } = createRepository(
            Array.from({ length: 100 }, () => Array.from({ length: 100 }, (_, index) => ({ name: `branch-${index}` }))),
        );

        await expect(repository.getListOfBranches('owner', 'repo', 'token')).rejects.toThrow(
            'Branch pagination exceeded 100 pages.',
        );
        expect(listBranches).toHaveBeenCalledTimes(100);
    });
});
