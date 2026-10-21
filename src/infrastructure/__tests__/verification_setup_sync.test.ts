import { removeNativeVerificationProfiles } from '../native_verification_profiles';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { captureVerificationSetup } from '../verification_setup_snapshot';
import { GitCommitAdapter } from '../git_commit_adapter';
import { BranchSyncWorkspaceAdapter } from '../branch_sync_workspace_adapter';
import { SyncBranchUseCase } from '../../application/usecases/branch_sync/sync_branch_use_case';
import { projectBranchSyncContext } from '../../application/usecases/push_single_action_contexts';
import { prepareUntrustedCommandEnvironment } from '../untrusted_command_environment';
import { readNativeRecord, writeNativeRecord, type NativeVerificationRequest } from '../native_verification_protocol';
import { VERIFICATION_SETUP_PATH } from '../../application/policies/verification_setup_policy';
import type { Execution } from '../../data/model/execution';

const branch = 'feature/42-managed-fixture';
const helper = 'runs:\n  using: composite\n  steps:\n    - run: echo reviewed\n      shell: bash\n';
const verifier = `import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert/strict';
    assert.equal(fs.readFileSync(path.join(process.env.HOME,'tools','prepared'),'utf8'),fs.readFileSync('dependencies.lock','utf8'));`;

/** Real local Git remote, exact same managed ref, actual merge/verify/abort/push; no GitHub or network. */
describe('repository setup during same-managed-branch synchronization', () => {
    let directory: string; let root: string; let remote: string; let childSha: string;
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const remoteHead = () => git('--git-dir', remote, 'rev-parse', `refs/heads/${branch}`);
    beforeEach(() => {
        directory = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'copilot-setup-sync-')));
        root = path.join(directory, 'workspace'); remote = path.join(directory, 'origin.git'); fs.mkdirSync(root);
        git('init', '--bare', remote); git('init', '-b', 'main');
        const emptyHooks = path.join(directory, 'empty-hooks'); fs.mkdirSync(emptyHooks);
        git('config', 'core.hooksPath', emptyHooks); git('--git-dir', remote, 'config', 'core.hooksPath', emptyHooks);
        git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.test');
        fs.mkdirSync(path.dirname(path.join(root, VERIFICATION_SETUP_PATH)), { recursive: true });
        fs.writeFileSync(path.join(root, VERIFICATION_SETUP_PATH), helper);
        fs.writeFileSync(path.join(root, 'verify.mjs'), verifier);
        fs.writeFileSync(path.join(root, 'dependencies.lock'), 'version-one');
        git('add', '.'); git('commit', '-m', 'trusted main'); git('remote', 'add', 'origin', remote); git('push', 'origin', 'main');
        git('checkout', '-b', 'develop'); git('push', 'origin', 'develop'); git('checkout', '-b', branch);
        fs.writeFileSync(path.join(root, VERIFICATION_SETUP_PATH), 'throw new Error("candidate helper must never execute");');
        git('add', '.'); git('commit', '-m', 'candidate helper change'); git('push', 'origin', branch); childSha = git('rev-parse', 'HEAD');
        git('checkout', 'develop'); fs.writeFileSync(path.join(root, 'dependencies.lock'), 'version-two');
        git('add', '.'); git('commit', '-m', 'parent dependency update'); git('push', 'origin', 'develop'); git('checkout', branch);
        jest.spyOn(process, 'cwd').mockReturnValue(root);
    });
    afterEach(() => { jest.restoreAllMocks(); fs.rmSync(directory, { recursive: true, force: true }); });
    async function synchronize(enabled: boolean, commands = ['node verify.mjs'], dryRun = false) {
        const gitPort = new GitCommitAdapter(async (program, args, options) => {
            const output = execFileSync(program, args, { cwd: root, env: options?.env, stdio: ['ignore', 'pipe', 'pipe'] });
            options?.stdout?.(output); return 0;
        }, undefined, captureVerificationSetup(enabled, 'main', root));
        const workspace = new BranchSyncWorkspaceAdapter(gitPort, root);
        const fixer = { fix: jest.fn() };
        const useCase = new SyncBranchUseCase({
            resolveTarget: async () => ({ issueNumber: 42, conversationNumber: 42, parentBranch: 'develop', workingBranch: branch }),
            listOpenDependencies: async () => [],
        }, {
            prepare: (parent, child) => workspace.prepare(parent, child, ''),
            validatePreparedMerge: paths => workspace.validatePreparedMerge(paths),
            assertRemoteHeadsUnchanged: (parent, parentSha, child, sha) => workspace.assertRemoteHeadsUnchanged(parent, parentSha, child, sha, ''),
            commitAndPush: (child, message, author) => workspace.commitAndPush(child, message, author, ''),
            abort: () => workspace.abort(),
        }, fixer, { getUserDetails: async () => ({ name: 'Test', email: 'test@example.test' }) } as never, gitPort);
        const context = projectBranchSyncContext({ owner: 'fixture', repo: 'local', tokens: { token: '' }, issue: { number: 42 },
            pullRequest: { number: -1 }, issueNumber: 42,
            ai: { getAgentConfiguration: () => ({ provider: 'codex', model: '' }), getBugbotFixVerifyCommands: () => commands },
        } as unknown as Execution);
        const runtime = prepareUntrustedCommandEnvironment();
        const session = runtime.environment.HOME;
        const previous = process.env.COPILOT_NATIVE_WORKER_SESSION;
        process.env.COPILOT_NATIVE_WORKER_SESSION = session;
        writeNativeRecord(session, 'session.json', { schemaVersion: 1, workspace: root, run: process.env.GITHUB_RUN_ID ?? '',
            attempt: process.env.GITHUB_RUN_ATTEMPT ?? '', job: process.env.GITHUB_JOB ?? '', pid: process.pid });
        const answered = new Set<string>();
        // Test double for native Actions; it reads merged manifests, never parses or executes YAML.
        const driver = setInterval(() => {
            const request = readNativeRecord<NativeVerificationRequest>(session, 'request.json', 32_768);
            if (!request || answered.has(request.id)) return;
            answered.add(request.id);
            const tools = path.join(request.environment.HOME, 'tools'); fs.mkdirSync(tools);
            fs.writeFileSync(path.join(tools, 'prepared'), fs.readFileSync(path.join(root, 'dependencies.lock')));
            writeNativeRecord(session, `response-${request.id}.json`, { id: request.id, success: true, path: request.environment.PATH });
        }, 5);
        let result;
        try { [result] = await useCase.invoke({ context, options: { dryRun, useAgent: false } }); }
        finally {
            clearInterval(driver); removeNativeVerificationProfiles(session); runtime.cleanup();
            if (previous === undefined) delete process.env.COPILOT_NATIVE_WORKER_SESSION; else process.env.COPILOT_NATIVE_WORKER_SESSION = previous;
        }
        expect(fixer.fix).not.toHaveBeenCalled();
        return result;
    }
    it('fails without preparation, aborting the merge and preserving the exact remote head', async () => {
        const result = await synchronize(false);
        expect(result.success).toBe(false); expect(remoteHead()).toBe(childSha); expect(git('rev-parse', 'HEAD')).toBe(childSha);
        expect(git('status', '--porcelain')).toBe('');
    });
    it('prepares merged manifests from trusted main, verifies twice, and pushes only the same managed ref', async () => {
        const result = await synchronize(true, ['node verify.mjs', 'node verify.mjs']);
        expect(result).toMatchObject({ success: true, payload: { outcome: 'merged-cleanly', verificationCount: 2 } });
        expect(remoteHead()).toBe(git('rev-parse', 'HEAD')); expect(remoteHead()).not.toBe(childSha);
        expect(git('show', `${remoteHead()}:dependencies.lock`)).toBe('version-two');
        expect(git('show', `${remoteHead()}:${VERIFICATION_SETUP_PATH}`)).toContain('candidate helper must never execute');
        expect(git('--git-dir', remote, 'for-each-ref', '--format=%(refname)', 'refs/heads').split('\n').sort())
            .toEqual(['refs/heads/develop', `refs/heads/${branch}`, 'refs/heads/main']);
    });
    it('skips setup in dry runs even when the trusted helper is invalid', async () => {
        git('update-ref', 'refs/remotes/origin/main', childSha);
        const result = await synchronize(true, ['node verify.mjs'], true);
        expect(result).toMatchObject({ success: true, payload: { outcome: 'dry-run-clean' } }); expect(remoteHead()).toBe(childSha);
    });
    it('does not run setup for aligned branches', async () => {
        git('merge', '--no-edit', 'develop'); git('push', 'origin', branch); childSha = remoteHead();
        git('update-ref', 'refs/remotes/origin/main', childSha);
        expect(await synchronize(true)).toMatchObject({ success: true, payload: { outcome: 'already-aligned' } });
        expect(remoteHead()).toBe(childSha);
    });
    it('retains existing no-command policy without invoking an invalid helper', async () => {
        git('update-ref', 'refs/remotes/origin/main', childSha);
        expect(await synchronize(true, [])).toMatchObject({ success: true, payload: { verificationCount: 0 } });
    });
    it('aborts and withholds push when trusted setup fails', async () => {
        git('update-ref', 'refs/remotes/origin/main', childSha);
        const result = await synchronize(true);
        expect(result.success).toBe(false); expect(remoteHead()).toBe(childSha); expect(git('status', '--porcelain')).toBe('');
    });
});
