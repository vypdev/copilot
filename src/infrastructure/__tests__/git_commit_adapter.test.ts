import { GitCommitAdapter } from '../git_commit_adapter';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as actionsExec from '@actions/exec';

describe('GitCommitAdapter', () => {
    it('retains exact NUL-delimited bytes without emitting them into Actions logs', async () => {
        const records = Buffer.from('100644 sha 0\tsrc/one.ts\0' + '100644 sha 0\tsrc/two.ts\0');
        const execution = jest.spyOn(actionsExec, 'exec').mockImplementation(async (_program, _args, options) => {
            expect(options?.silent).toBe(true);
            options?.listeners?.stdout?.(records);
            return 0;
        });
        try {
            const stdout = jest.fn();
            await new GitCommitAdapter().execute('git', ['ls-files', '-s', '-z'], { stdout });
            expect(stdout).toHaveBeenCalledWith(records);
        } finally {
            execution.mockRestore();
        }
    });
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
            ['git', '-c', expect.stringContaining('core.hooksPath='), 'commit', '-m', 'fix: test'],
            ['git', 'push', 'origin', 'master'],
        ]);
    });

    it('commits verified changes without executing an inherited hook or persisting its override', async () => {
        const root = fs.mkdtempSync(path.join(tmpdir(), 'copilot-git-commit-test-'));
        const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
        try {
            git('init');
            git('config', 'user.name', 'Test');
            git('config', 'user.email', 'test@example.test');
            const hooks = path.join(root, 'contributor-hooks');
            fs.mkdirSync(hooks);
            fs.writeFileSync(path.join(hooks, 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
            git('config', 'core.hooksPath', hooks);
            fs.writeFileSync(path.join(root, 'verified.txt'), 'verified change\n');
            git('add', 'verified.txt');
            const adapter = new GitCommitAdapter(async (program, args, options) => {
                execFileSync(program, args, { cwd: root, env: options?.env });
                return 0;
            });

            await adapter.commit('test: verified change');

            expect(git('show', 'HEAD:verified.txt')).toBe('verified change');
            expect(git('config', 'core.hooksPath')).toBe(hooks);
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
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
            expect(call.options?.env?.GIT_CONFIG_KEY_0).toBe('http.https://github.com/.extraheader');
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
