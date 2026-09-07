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

    it('scopes token authentication to the fetch and push subprocess environments', async () => {
        const calls: Array<{ program: string; args: string[]; options?: { env?: Record<string, string> } }> = [];
        const adapter = new GitCommitAdapter(async (program, args, options) => {
            calls.push({ program, args, options });
            return 0;
        });

        await adapter.fetch('feature/secure', 'secret-token');
        await adapter.push('feature/secure', 'secret-token');

        expect(calls.map(call => call.args)).toEqual([
            ['fetch', 'origin', 'feature/secure'],
            ['push', 'origin', 'feature/secure'],
        ]);
        for (const call of calls) {
            expect(call.options?.env?.GIT_CONFIG_KEY_0).toBe('http.extraheader');
            expect(call.options?.env?.GIT_CONFIG_VALUE_0).toMatch(/^AUTHORIZATION: basic /);
            expect(JSON.stringify(call.args)).not.toContain('secret-token');
        }
    });

    it('runs repository-controlled verification with an isolated temporary environment', async () => {
        const execute = jest.fn().mockImplementation(async (_program, _args, options) => {
            expect(options.env.HOME).toContain('copilot-verify-runtime-');
            expect(options.env).not.toHaveProperty('OPENAI_API_KEY');
            expect(options).not.toHaveProperty('untrusted');
            return 0;
        });
        const adapter = new GitCommitAdapter(execute);

        await adapter.execute('pnpm', ['test'], { untrusted: true });

        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('rejects caller environments at the untrusted command boundary', async () => {
        const adapter = new GitCommitAdapter(jest.fn());

        await expect(adapter.execute('pnpm', ['test'], {
            untrusted: true,
            env: { OPENAI_API_KEY: 'must-not-pass' },
        })).rejects.toThrow('does not accept a caller-supplied environment');
    });
});
