import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import * as actionsExec from '@actions/exec';
import { GitCommitAdapter } from '../git_commit_adapter';
import { captureVerificationPythonLibraries } from '../verification_python_library_environment';
import { prepareRepositoryVerification } from '../verification_setup_runner';
import type { PreparedVerificationSetup } from '../../application/ports/verification_setup_ports';
import { VerificationPrerequisiteError } from '../../application/policies/verification_runtime_policy';

jest.mock('../verification_python_library_environment', () => ({ captureVerificationPythonLibraries: jest.fn() }));
jest.mock('../verification_setup_runner', () => ({ prepareRepositoryVerification: jest.fn() }));

describe('Git verification Python preparation boundary', () => {
    const source = { kind: 'disabled' } as const;
    const snapshot = (): PreparedVerificationSetup => ({
        kind: 'ready', files: [], sourceSha: 'a'.repeat(40), workspace: process.cwd(), toolRoot: '/snapshot/cache',
    });
    const options = { untrusted: true, verifyRuntimePrerequisites: true };
    let before: NodeJS.ProcessEnv;
    let prepare: jest.Mock<void, [Record<string, string>]>;
    beforeEach(() => {
        before = { ...process.env }; delete process.env.COPILOT_NATIVE_WORKER_SESSION;
        process.env.RUNNER_TOOL_CACHE = '/runner/original'; process.env.LD_LIBRARY_PATH = '/foreign/parent';
        jest.clearAllMocks();
        prepare = jest.fn();
        jest.mocked(captureVerificationPythonLibraries).mockImplementation(root => {
            return environment => { prepare(environment); environment.LD_LIBRARY_PATH = root + '/lib'; };
        });
        jest.mocked(prepareRepositoryVerification).mockResolvedValue(undefined);
    });
    afterEach(() => { jest.restoreAllMocks(); process.env = before; });

    it('prepares the same child environment after native setup and before the real verification boundary', async () => {
        const order: string[] = [];
        let environment: Record<string, string> | undefined;
        jest.mocked(prepareRepositoryVerification).mockImplementation(async (_setup, env) => { order.push('setup'); environment = env; });
        prepare.mockImplementation(env => { expect(env).toBe(environment); order.push('libraries'); });
        const check = jest.fn(env => { expect(env).toBe(environment); expect(env.LD_LIBRARY_PATH).toBe('/snapshot/cache/lib'); order.push('preflight'); });
        const dependencies = jest.fn(async env => { expect(env).toBe(environment); order.push('dependencies'); });
        const execute = jest.fn(async (_program, _args, call) => { expect(call.env).toBe(environment); order.push('verifier'); return 0; });
        await new GitCommitAdapter(execute, check, snapshot(), dependencies).execute('python', ['-m', 'pytest'], options);
        expect(order).toEqual(['setup', 'libraries', 'preflight', 'dependencies', 'verifier']);
        expect(fs.existsSync(environment!.HOME)).toBe(false);
        expect(process.env.LD_LIBRARY_PATH).toBe('/foreign/parent');
    });
    it('keeps ordinary trusted and untrusted Git operations outside runtime preparation', async () => {
        const execute = jest.fn(async (_program, _args, call) => {
            if (call?.env) expect(call.env).not.toHaveProperty('LD_LIBRARY_PATH');
            return 0;
        });
        const check = jest.fn(); const dependencies = jest.fn();
        const adapter = new GitCommitAdapter(execute, check, source, dependencies);
        await adapter.execute('git', ['status']); await adapter.execute('git', ['diff'], { untrusted: true });
        expect(prepare).not.toHaveBeenCalled(); expect(prepareRepositoryVerification).not.toHaveBeenCalled();
        expect(check).not.toHaveBeenCalled(); expect(dependencies).not.toHaveBeenCalled();
    });
    it('captures the runner cache before a later candidate-time environment change', async () => {
        const execute = jest.fn(async (_program, _args, call) => { expect(call.env.LD_LIBRARY_PATH).toBe('/runner/original/lib'); return 0; });
        const adapter = new GitCommitAdapter(execute, jest.fn(), source, async () => undefined);
        process.env.RUNNER_TOOL_CACHE = '/runner/new';
        await adapter.execute('python', ['--version'], options);
        expect(captureVerificationPythonLibraries).toHaveBeenCalledWith('/runner/original');
    });
    it('uses the immutable native snapshot cache instead of the current runner environment', async () => {
        const execute = jest.fn(async (_program, _args, call) => { expect(call.env.LD_LIBRARY_PATH).toBe('/snapshot/cache/lib'); return 0; });
        await new GitCommitAdapter(execute, jest.fn(), snapshot(), async () => undefined).execute('python', ['--version'], options);
        expect(captureVerificationPythonLibraries).toHaveBeenCalledWith('/snapshot/cache');
    });
    it('resolves the configured native command from the prepared child PATH instead of the parent PATH', async () => {
        const directory = fs.mkdtempSync(path.join(tmpdir(), 'copilot-python-command-'));
        const file = path.join(directory, 'fixture-verifier' + (process.platform === 'win32' ? '.CMD' : ''));
        fs.writeFileSync(file, 'fixture command is never executed by this boundary spy', { mode: 0o755 });
        jest.mocked(prepareRepositoryVerification).mockImplementation(async (_setup, env) => { env.PATH = directory + path.delimiter + env.PATH; });
        const execution = jest.spyOn(actionsExec, 'exec').mockResolvedValue(0);
        try {
            await new GitCommitAdapter(undefined, jest.fn(), snapshot(), async () => undefined).execute('fixture-verifier', ['complete-command'], options);
            expect(execution).toHaveBeenCalledWith(file, ['complete-command'], expect.objectContaining({
                env: expect.objectContaining({ LD_LIBRARY_PATH: '/snapshot/cache/lib' }),
            }));
        } finally { fs.rmSync(directory, { recursive: true, force: true }); }
    });
    it('preserves a setup failure without probing or executing the verifier and cleans its profile', async () => {
        const failure = new Error('setup failed'); let home = '';
        jest.mocked(prepareRepositoryVerification).mockImplementation(async (_setup, env) => { home = env.HOME; throw failure; });
        const check = jest.fn(); const execute = jest.fn(); const dependencies = jest.fn();
        await expect(new GitCommitAdapter(execute, check, snapshot(), dependencies).execute('python', ['-m', 'pytest'], options)).rejects.toBe(failure);
        expect(prepare).not.toHaveBeenCalled(); expect(check).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
        expect(dependencies).not.toHaveBeenCalled(); expect(fs.existsSync(home)).toBe(false);
    });
    it('keeps unavailable Python blocked after library preparation and never executes the configured command', async () => {
        const failure = new VerificationPrerequisiteError('unavailable', { runtime: 'python', version: '3.11' });
        let home = '';
        const check = jest.fn(env => { home = env.HOME; expect(env.LD_LIBRARY_PATH).toBe('/runner/original/lib'); throw failure; });
        const execute = jest.fn(); const dependencies = jest.fn();
        await expect(new GitCommitAdapter(execute, check, source, dependencies).execute('python', ['-m', 'pytest'], options)).rejects.toBe(failure);
        expect(prepare).toHaveBeenCalledTimes(1); expect(execute).not.toHaveBeenCalled(); expect(dependencies).not.toHaveBeenCalled();
        expect(fs.existsSync(home)).toBe(false);
    });
    it('preserves the configured verifier nonzero exit result and cleans its profile', async () => {
        let home = '';
        const execute = jest.fn(async (_program, _args, call) => { home = call.env.HOME; return 7; });
        expect(await new GitCommitAdapter(execute, jest.fn(), source, async () => undefined).execute('python', ['-m', 'pytest'], options)).toBe(7);
        expect(fs.existsSync(home)).toBe(false);
    });
    it('preserves a configured verifier exception and cleans its profile', async () => {
        const failure = new Error('verifier failed'); let home = '';
        const execute = jest.fn(async (_program, _args, call) => { home = call.env.HOME; throw failure; });
        await expect(new GitCommitAdapter(execute, jest.fn(), source, async () => undefined).execute('python', ['-m', 'pytest'], options)).rejects.toBe(failure);
        expect(fs.existsSync(home)).toBe(false);
    });
    it('prepares distinct profiles on each verification without exposing provider credentials or mutating Node', async () => {
        process.env.PAT = 'fixture-parent-credential'; const parent = { ...process.env }; const profiles: string[] = [];
        const execute = jest.fn(async (_program, _args, call) => {
            profiles.push(call.env.HOME); expect(call.env).not.toHaveProperty('PAT');
            expect(call.env.LD_LIBRARY_PATH).toBe('/runner/original/lib'); return 0;
        });
        const adapter = new GitCommitAdapter(execute, jest.fn(), source, async () => undefined);
        await adapter.execute('python', ['-m', 'pytest'], options); await adapter.execute('python', ['-m', 'pytest'], options);
        expect(new Set(profiles).size).toBe(2); expect(profiles.every(home => !fs.existsSync(home))).toBe(true);
        expect(prepare).toHaveBeenCalledTimes(2); expect(process.env).toEqual(parent);
    });
});
