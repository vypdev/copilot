import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GitCommitPort } from '../../application/ports/git_ports';
import { BranchSyncWorkspaceAdapter } from '../branch_sync_workspace_adapter';

const scenarios = [
    { name: 'retains an original conflict resolved to the child bytes across verification', kind: 'ours', valid: true },
    { name: 'retains a modify/delete conflict resolved to the child deletion', kind: 'deleted', valid: true },
    { name: 'rejects a new path after the child-byte resolution', kind: 'extra', valid: false },
    { name: 'rejects loss of a non-conflicted parent path after resolution', kind: 'protected', valid: false },
    { name: 'rejects an unstaged verification mutation of the resolved conflict', kind: 'unstaged', valid: false },
    { name: 'rejects a staged verification mutation of the resolved conflict', kind: 'staged', valid: false },
];

describe('real Git branch-sync resolutions with unchanged child paths', () => {
    it.each(scenarios)('$name', async scenario => {
        const root = mkdtempSync(join(tmpdir(), 'copilot-sync-resolution-'));
        const remote = join(root, 'remote.git');
        const workspace = join(root, 'workspace');
        const globalConfig = join(root, 'empty-config');
        writeFileSync(globalConfig, '');
        const env = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' };
        const gitAt = (cwd: string, args: readonly string[]) => execFileSync('git', [...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
        const write = (file: string, text: string) => writeFileSync(join(workspace, file), text);
        try {
            gitAt(root, ['init', '--bare', remote]);
            gitAt(root, ['init', '--initial-branch=develop', workspace]);
            const commit = (message: string) => {
                gitAt(workspace, ['add', '.']);
                gitAt(workspace, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-m', message]);
            };
            write('conflict.txt', 'base\n'); write('protected.txt', 'base protected\n'); commit('base');
            gitAt(workspace, ['branch', 'feature/42']);
            write('conflict.txt', 'parent\n'); write('protected.txt', 'parent protected\n'); commit('parent');
            gitAt(workspace, ['checkout', 'feature/42']);
            if (scenario.kind === 'deleted') rmSync(join(workspace, 'conflict.txt'));
            else write('conflict.txt', 'child\n');
            commit('child');
            gitAt(workspace, ['remote', 'add', 'origin', remote]);
            gitAt(workspace, ['push', 'origin', 'develop', 'feature/42']);
            const git = {
                execute: jest.fn(async (program, args, options) => {
                    const output = execFileSync(program, [...args], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] });
                    options?.stdout?.(output); return 0;
                }),
                fetch: jest.fn(async branch => { gitAt(workspace, ['fetch', 'origin', branch]); }),
                stagePaths: jest.fn(async paths => { gitAt(workspace, ['add', '--', ...paths]); }),
                stageAll: jest.fn(), commit: jest.fn(), push: jest.fn(), configureAuthor: jest.fn(),
            } as unknown as jest.Mocked<GitCommitPort>;
            const adapter = new BranchSyncWorkspaceAdapter(git, workspace);
            await expect(adapter.prepare('develop', 'feature/42', 'fixture')).resolves.toMatchObject({ kind: 'conflicted', conflictPaths: ['conflict.txt'] });
            if (scenario.kind === 'deleted') rmSync(join(workspace, 'conflict.txt'));
            else write('conflict.txt', 'child\n');
            await expect(adapter.validatePreparedMerge(['conflict.txt'])).resolves.toEqual({ valid: true });
            expect(gitAt(workspace, ['status', '--porcelain']).toString()).not.toContain('conflict.txt');
            if (scenario.kind === 'extra') write('unexpected.txt', 'unexpected\n');
            if (scenario.kind === 'protected') {
                write('protected.txt', 'base protected\n'); gitAt(workspace, ['add', '--', 'protected.txt']);
            }
            if (scenario.kind === 'unstaged' || scenario.kind === 'staged') {
                write('conflict.txt', 'verification mutation\n');
                if (scenario.kind === 'staged') gitAt(workspace, ['add', '--', 'conflict.txt']);
            }
            const result = await adapter.validatePreparedMerge(['conflict.txt']);
            expect(result).toEqual(scenario.valid ? { valid: true } : { valid: false, code: 'unexpected-paths', reason: 'The agent changed paths outside the prepared merge.' });
            expect(git.stagePaths).toHaveBeenCalledTimes(1);
            expect(git.stageAll).not.toHaveBeenCalled(); expect(git.commit).not.toHaveBeenCalled(); expect(git.push).not.toHaveBeenCalled();
            if (scenario.kind === 'unstaged') gitAt(workspace, ['checkout', '--', 'conflict.txt']);
            if (scenario.kind === 'extra') rmSync(join(workspace, 'unexpected.txt'));
            await adapter.abort();
            expect(gitAt(workspace, ['status', '--porcelain']).toString()).toBe('');
            expect(readFileSync(join(workspace, 'protected.txt'), 'utf8')).toBe('base protected\n');
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
});
