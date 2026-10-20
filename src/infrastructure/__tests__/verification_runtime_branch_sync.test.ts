import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitCommitAdapter } from '../git_commit_adapter';
import { BranchSyncWorkspaceAdapter } from '../branch_sync_workspace_adapter';
import { assertVerificationRuntimePrerequisites } from '../verification_runtime_preflight';
import { SyncBranchUseCase } from '../../application/usecases/branch_sync/sync_branch_use_case';
import { projectBranchSyncContext } from '../../application/usecases/push_single_action_contexts';
import type { Execution } from '../../data/model/execution';

describe('verification prerequisites through a real parent-to-child merge', () => {
    it.each(['missing JVM', 'provisioned JVM', 'non-JVM'] as const)('%s retains the publication guard', async scenario => {
        const root = mkdtempSync(join(tmpdir(), 'copilot-runtime-merge-'));
        const remote = join(root, 'remote.git'), workspace = join(root, 'workspace');
        const globalConfig = join(root, 'empty-gitconfig');
        writeFileSync(globalConfig, '');
        const env = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' };
        const gitAt = (cwd: string, args: string[]) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
        try {
            gitAt(root, ['init', '--bare', remote]);
            gitAt(root, ['init', '--initial-branch=develop', workspace]);
            const commit = (message: string) => {
                gitAt(workspace, ['add', '.']);
                gitAt(workspace, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-m', message]);
            };
            writeFileSync(join(workspace, 'base.txt'), 'base\n');
            if (scenario !== 'non-JVM') {
                mkdirSync(join(workspace, '.copilot'));
                writeFileSync(join(workspace, '.copilot/verification-prerequisites.json'), JSON.stringify({ schemaVersion: 1, runtimes: { java: '17' } }));
            }
            commit('base');
            gitAt(workspace, ['branch', 'feature/42']);
            writeFileSync(join(workspace, 'parent.txt'), 'parent\n'); commit('parent');
            const parent = gitAt(workspace, ['rev-parse', 'HEAD']);
            gitAt(workspace, ['checkout', 'feature/42']);
            writeFileSync(join(workspace, 'child.txt'), 'child\n'); commit('child');
            const child = gitAt(workspace, ['rev-parse', 'HEAD']);
            gitAt(workspace, ['remote', 'add', 'origin', remote]);
            gitAt(workspace, ['push', 'origin', 'develop', 'feature/42']);
            const probe = jest.fn(() => scenario === 'missing JVM'
                ? { status: null, output: 'private runtime diagnostic', failed: true }
                : { status: 0, output: 'openjdk version "17.0.13"' });
            let verified = 0;
            const git = new GitCommitAdapter(async (program, args, options) => {
                if (program === 'node') {
                    verified++;
                    expect(options?.env).not.toHaveProperty('GITHUB_TOKEN');
                }
                const output = execFileSync(program, args, { cwd: workspace, env: options?.env ?? env, stdio: ['ignore', 'pipe', 'pipe'] });
                options?.stdout?.(output);
                return 0;
            }, environment => assertVerificationRuntimePrerequisites(environment, workspace, probe));
            const adapter = new BranchSyncWorkspaceAdapter(git, workspace);
            const workspacePort = {
                prepare: (parentBranch: string, childBranch: string) => adapter.prepare(parentBranch, childBranch, ''),
                validatePreparedMerge: adapter.validatePreparedMerge.bind(adapter),
                assertRemoteHeadsUnchanged: (p: string, ps: string, c: string, cs: string) => adapter.assertRemoteHeadsUnchanged(p, ps, c, cs, ''),
                commitAndPush: (branch: string, message: string, author: { name: string; email: string }) => adapter.commitAndPush(branch, message, author, ''),
                abort: adapter.abort.bind(adapter),
            };
            const publish = jest.spyOn(workspacePort, 'commitAndPush');
            const target = { issueNumber: 42, conversationNumber: 42, parentBranch: 'develop', workingBranch: 'feature/42' };
            const fixer = { fix: jest.fn() };
            const useCase = new SyncBranchUseCase({ resolveTarget: async () => target, listOpenDependencies: async () => [] }, workspacePort,
                fixer, { getUser: async () => 'fixture', getUserDetails: async () => ({ name: 'Fixture', email: 'fixture@example.test' }) }, git);
            const context = projectBranchSyncContext({ owner: 'org', repo: 'repo', tokens: { token: '' }, issue: { number: 42 }, pullRequest: { number: -1 },
                issueNumber: 42, ai: { getAgentConfiguration: () => ({ provider: 'codex', model: 'model' }), getBugbotFixVerifyCommands: () => ['node --version'] } } as unknown as Execution);
            const [result] = await useCase.invoke({ context, options: { dryRun: false, useAgent: false } });
            const remoteHead = gitAt(remote, ['rev-parse', 'refs/heads/feature/42']);
            expect(fixer.fix).not.toHaveBeenCalled();
            expect(gitAt(workspace, ['status', '--porcelain'])).toBe('');
            if (scenario === 'missing JVM') {
                expect(result.success).toBe(false);
                expect(JSON.stringify(result)).toContain('Java 17 is unavailable');
                expect(JSON.stringify(result)).not.toContain('private runtime diagnostic');
                expect(verified).toBe(0);
                expect(publish).not.toHaveBeenCalled();
                expect(remoteHead).toBe(child);
                expect(gitAt(workspace, ['rev-parse', 'HEAD'])).toBe(child);
            } else {
                expect(result.success).toBe(true);
                expect(verified).toBe(1);
                expect(publish).toHaveBeenCalledTimes(1);
                expect(remoteHead).not.toBe(child);
                expect(gitAt(remote, ['rev-parse', `${remoteHead}^2`])).toBe(parent);
            }
            expect(probe).toHaveBeenCalledTimes(scenario === 'non-JVM' ? 0 : 1);
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
});
