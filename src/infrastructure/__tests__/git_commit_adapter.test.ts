import { GitCommitAdapter } from '../git_commit_adapter';

describe('GitCommitAdapter', () => {
    it('configures author, stages, commits and pushes through the port', async () => {
        const calls: string[][] = [];
        const adapter = new GitCommitAdapter(async (program: string, args: string[]) => {
            calls.push([program, ...args]);
            return 0;
        });

        await adapter.configureAuthor('Efra Espada', 'efra@example.test');
        await adapter.stagePaths(['src/file.ts']);
        await adapter.stageAll();
        await adapter.commit('fix: test');
        await adapter.push('master');

        expect(calls).toEqual([
            ['git', 'config', 'user.name', 'Efra Espada'],
            ['git', 'config', 'user.email', 'efra@example.test'],
            ['git', 'add', '--', 'src/file.ts'],
            ['git', 'add', '-A'],
            ['git', 'commit', '-m', 'fix: test'],
            ['git', 'push', 'origin', 'master'],
        ]);
    });
});
