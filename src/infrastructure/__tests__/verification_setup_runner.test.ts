import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { GitCommitAdapter } from '../git_commit_adapter';
import { prepareUntrustedCommandEnvironment } from '../untrusted_command_environment';
import { prepareRepositoryVerification } from '../verification_setup_runner';
import { applyVerificationSetupResult } from '../verification_setup_result';
import { runVerificationSetupProcess } from '../verification_setup_process';
import type { PreparedVerificationSetup } from '../../application/ports/verification_setup_ports';
import { VerificationSetupError } from '../../application/policies/verification_setup_policy';
import { runVerifyCommands } from '../../application/usecases/steps/commit/bugbot/verify_command_runner';

const sourceSha = 'a'.repeat(40);
describe('repository verification setup execution', () => {
    let root: string;
    let runtime: ReturnType<typeof prepareUntrustedCommandEnvironment>;
    const setup = (script = 'export {};'): PreparedVerificationSetup => Object.freeze({ kind: 'ready', script, sourceSha, workspace: root, node: process.execPath });
    beforeEach(() => {
        root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'copilot-setup-runner-')));
        runtime = prepareUntrustedCommandEnvironment({ PATH: process.env.PATH, SystemRoot: process.env.SystemRoot });
        jest.spyOn(process, 'cwd').mockReturnValue(root);
    });
    afterEach(() => { jest.restoreAllMocks(); runtime.cleanup(); fs.rmSync(root, { recursive: true, force: true }); });

    it('skips disabled setup and defers blocked snapshots until actual verification', async () => {
        await prepareRepositoryVerification({ kind: 'disabled' }, runtime.environment);
        const execute = jest.fn().mockResolvedValue(0);
        const adapter = new GitCommitAdapter(execute, jest.fn(), { kind: 'blocked', reason: 'source-unavailable' });
        await adapter.execute('git', ['status'], { untrusted: true });
        await expect(adapter.execute('node', ['test'], { untrusted: true, verifyRuntimePrerequisites: true })).rejects.toMatchObject({ reason: 'source-unavailable' });
        expect(execute).toHaveBeenCalledTimes(1);
    });
    it('does not prepare for an empty command list', async () => {
        const execute = jest.fn();
        expect(await runVerifyCommands([], execute)).toEqual({ success: true });
        expect(execute).not.toHaveBeenCalled();
    });
    it('executes trusted standalone ESM in candidate cwd, without process/agent credentials', async () => {
        const script = `import fs from 'node:fs';
            for (const key of ['PAT','GITHUB_TOKEN','OPENAI_API_KEY','AWS_SECRET_ACCESS_KEY','CODEX_HOME','NODE_OPTIONS','GIT_CONFIG_VALUE_0'])
                if (process.env[key]) throw new Error('credential leaked');
            if (process.env.COPILOT_VERIFICATION_SETUP_PROTOCOL !== '1') throw new Error('protocol');
            fs.writeFileSync('observed.json', JSON.stringify({cwd:process.cwd(),home:process.env.HOME,sha:process.env.COPILOT_VERIFICATION_SETUP_SOURCE_SHA}));`;
        await prepareRepositoryVerification(setup(script), runtime.environment);
        expect(JSON.parse(fs.readFileSync(join(root, 'observed.json'), 'utf8'))).toEqual({ cwd: root, home: runtime.environment.HOME, sha: sourceSha });
        expect(runtime.environment).not.toHaveProperty('COPILOT_VERIFICATION_SETUP_RESULT');
    });
    it('refreshes setup from changed candidate manifests for each command, before probes in the same environment', async () => {
        const script = `import fs from 'node:fs'; import path from 'node:path';
            const bin=path.join(process.env.HOME,'bin'); fs.mkdirSync(bin);
            fs.writeFileSync(path.join(bin,'candidate'),fs.readFileSync('manifest.json'));
            fs.appendFileSync('preparations','1');
            fs.writeFileSync(process.env.COPILOT_VERIFICATION_SETUP_RESULT,JSON.stringify({schemaVersion:1,path:[bin],environment:{JAVA_HOME:bin}}));`;
        const order: string[] = []; const homes: string[] = [];
        let observed: Record<string, string> | undefined;
        const adapter = new GitCommitAdapter(async (_program, _args, options) => {
            order.push('verify'); expect(options?.env).toBe(observed); homes.push(options!.env!.HOME);
            expect(fs.readFileSync(join(options!.env!.JAVA_HOME, 'candidate'), 'utf8')).toBe(fs.readFileSync(join(root, 'manifest.json'), 'utf8'));
            return 0;
        }, environment => {
            order.push('preflight'); observed = environment;
            expect(environment.PATH.split(delimiter)[0]).toBe(environment.JAVA_HOME);
        }, setup(script));
        fs.writeFileSync(join(root, 'manifest.json'), 'first');
        await adapter.execute('node', ['test'], { untrusted: true, verifyRuntimePrerequisites: true });
        fs.writeFileSync(join(root, 'manifest.json'), 'changed');
        await adapter.execute('node', ['test'], { untrusted: true, verifyRuntimePrerequisites: true });
        expect(order).toEqual(['preflight','verify','preflight','verify']);
        expect(new Set(homes).size).toBe(2); expect(homes.every(home => !fs.existsSync(home))).toBe(true);
        expect(fs.readFileSync(join(root, 'preparations'), 'utf8')).toBe('11');
    });
    it('rejects a workspace switch before running any helper code', async () => {
        jest.mocked(process.cwd).mockReturnValue(runtime.environment.HOME);
        await expect(prepareRepositoryVerification(setup(), runtime.environment)).rejects.toMatchObject({ reason: 'workspace-changed' });
    });
    it('retains safe exit metadata and never emits helper output or raw exception text', async () => {
        await expect(prepareRepositoryVerification(setup('console.error("secret @everyone"); process.exit(7);'), runtime.environment))
            .rejects.toMatchObject({ reason: 'process-failed', exitCode: 7, message: expect.stringContaining('Exit status: 7') });
    });
    it('withholds verification and cleans the private home when setup fails', async () => {
        const execute = jest.fn(); const preflight = jest.fn();
        const adapter = new GitCommitAdapter(execute, preflight, setup('throw new Error("secret");'));
        const result = await runVerifyCommands(['node test'], (program, args) => adapter.execute(program, args, { untrusted: true, verifyRuntimePrerequisites: true }));
        expect(result).toMatchObject({ success: false, error: expect.stringContaining('Verification, commit and push are withheld') });
        expect(result.error).not.toContain('secret'); expect(execute).not.toHaveBeenCalled(); expect(preflight).not.toHaveBeenCalled();
    });
    it('fails closed on private script write errors without exposing filesystem details', async () => {
        const error = jest.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => { throw new Error('secret-path'); });
        await expect(prepareRepositoryVerification(setup(), runtime.environment)).rejects.toMatchObject({ reason: 'process-failed' });
        error.mockRestore();
    });
    it.each([
        ['process.exit(4);', 'process-failed', { timeoutMs: 5_000, outputBytes: 65_536 }],
        ['setInterval(()=>{},1000);', 'timeout', { timeoutMs: 100, outputBytes: 65_536 }],
        ['process.stdout.write("x".repeat(100000));', 'output-limit', { timeoutMs: 5_000, outputBytes: 100 }],
        ['process.stderr.write("x".repeat(100000));', 'output-limit', { timeoutMs: 5_000, outputBytes: 100 }],
    ])('bounds process execution %#', async (script, reason, limits) => {
        const file = join(runtime.environment.HOME, 'bounded.mjs'); fs.writeFileSync(file, script);
        await expect(runVerificationSetupProcess(process.execPath, file, root, runtime.environment, sourceSha, limits)).rejects.toMatchObject({ reason });
    });
    it('maps spawn failure to a sanitized closed diagnostic', async () => {
        await expect(runVerificationSetupProcess(join(root, 'missing-node'), 'script', root, runtime.environment, sourceSha)).rejects.toBeInstanceOf(VerificationSetupError);
    });
    it('terminates setup on cancellation and removes its signal listeners', async () => {
        const file = join(runtime.environment.HOME, 'cancel.mjs'); fs.writeFileSync(file, 'setInterval(()=>{},1000);');
        const before = process.listenerCount('SIGTERM');
        const once = jest.spyOn(process, 'once');
        const running = runVerificationSetupProcess(process.execPath, file, root, runtime.environment, sourceSha);
        const cancel = once.mock.calls.find(([signal]) => signal === 'SIGTERM')![1];
        cancel();
        await expect(running).rejects.toMatchObject({ reason: 'cancelled' });
        expect(process.listenerCount('SIGTERM')).toBe(before);
    });
});

describe('bounded setup result filesystem contract', () => {
    let root: string; let environment: Record<string, string>; let result: string;
    beforeEach(() => {
        root = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'copilot-setup-result-')));
        environment = { HOME: root, PATH: 'baseline' }; result = join(root, 'result.json');
    });
    afterEach(() => { jest.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
    it('accepts an absent result without changing verification environment', () => {
        applyVerificationSetupResult(result, environment, [root]); expect(environment).toEqual({ HOME: root, PATH: 'baseline' });
    });
    it('prepends approved directories and changes only JAVA_HOME', () => {
        const bin = join(root, 'bin'); fs.mkdirSync(bin);
        fs.writeFileSync(result, JSON.stringify({ schemaVersion: 1, path: [bin], environment: { JAVA_HOME: root } }));
        applyVerificationSetupResult(result, environment, [root]);
        expect(environment).toEqual({ HOME: root, PATH: `${bin}${delimiter}baseline`, JAVA_HOME: root });
    });
    it('supports a PATH addition with no inherited PATH', () => {
        delete environment.PATH; fs.writeFileSync(result, JSON.stringify({ schemaVersion: 1, path: [root] }));
        applyVerificationSetupResult(result, environment, [root]); expect(environment.PATH).toBe(root);
    });
    it.each([
        'not json secret', 'x'.repeat(16_385), JSON.stringify({ schemaVersion: 1, environment: { PAT: 'secret' } }),
        JSON.stringify({ schemaVersion: 1, path: ['relative'] }),
    ])('rejects unsafe result content %#', content => {
        fs.writeFileSync(result, content);
        expect(() => applyVerificationSetupResult(result, environment, [root])).toThrow(expect.objectContaining({ reason: 'result-invalid' }));
        expect(environment).toEqual({ HOME: root, PATH: 'baseline' });
    });
    it('rejects directory results', () => {
        fs.mkdirSync(result); expect(() => applyVerificationSetupResult(result, environment, [root])).toThrow(VerificationSetupError);
    });
    it('rejects hard-linked result files', () => {
        const original = join(root, 'original'); fs.writeFileSync(original, '{"schemaVersion":1}'); fs.linkSync(original, result);
        expect(() => applyVerificationSetupResult(result, environment, [root])).toThrow(VerificationSetupError);
    });
    it.each(['outside', 'traversal', 'delimiter', 'missing', 'file', 'link'])('rejects %s PATH directories', kind => {
        const outside = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'copilot-setup-outside-')));
        const file = join(root, 'ordinary'); fs.writeFileSync(file, 'text');
        const link = join(root, 'link'); fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
        const values: Record<string, string> = { outside, traversal: join(root, 'child') + '/../../escape', delimiter: root + delimiter + outside, missing: join(root, 'missing'), file, link };
        fs.writeFileSync(result, JSON.stringify({ schemaVersion: 1, path: [values[kind]] }));
        try { expect(() => applyVerificationSetupResult(result, environment, [root])).toThrow(VerificationSetupError); }
        finally { fs.rmSync(outside, { recursive: true, force: true }); }
    });
    it('does not apply partial PATH changes when JAVA_HOME is rejected', () => {
        fs.writeFileSync(result, JSON.stringify({ schemaVersion: 1, path: [root], environment: { JAVA_HOME: '/outside/untrusted' } }));
        expect(() => applyVerificationSetupResult(result, environment, [root])).toThrow(VerificationSetupError);
        expect(environment.PATH).toBe('baseline');
    });
    it('rejects a result replaced between lstat and open', () => {
        fs.writeFileSync(result, '{"schemaVersion":1}'); const original = fs.fstatSync;
        jest.spyOn(fs, 'fstatSync').mockImplementation(((fd: number, options: {bigint?: boolean}) => {
            const stat = original(fd, options as { bigint: true }); return { ...stat, ino: stat.ino + 1n };
        }) as typeof fs.fstatSync);
        expect(() => applyVerificationSetupResult(result, environment, [root])).toThrow(VerificationSetupError);
    });
    it('bounds a result that grows after its initial stat', () => {
        fs.writeFileSync(result, '{"schemaVersion":1}');
        jest.spyOn(fs, 'readSync').mockReturnValueOnce(16_385);
        expect(() => applyVerificationSetupResult(result, environment, [root])).toThrow(VerificationSetupError);
    });
    it('rejects a result mutated during the bounded read', () => {
        fs.writeFileSync(result, '{"schemaVersion":1}'); const original = fs.fstatSync; let calls = 0;
        jest.spyOn(fs, 'fstatSync').mockImplementation(((fd: number, options: {bigint?: boolean}) => {
            const stat = original(fd, options as { bigint: true }); calls++;
            return calls === 2 ? { ...stat, mtimeNs: stat.mtimeNs + 1n } : stat;
        }) as typeof fs.fstatSync);
        expect(() => applyVerificationSetupResult(result, environment, [root])).toThrow(VerificationSetupError);
    });
    it('maps access denial without exposing raw filesystem diagnostics', () => {
        jest.spyOn(fs, 'lstatSync').mockImplementationOnce(() => { throw Object.assign(new Error('secret path'), { code: 'EACCES' }); });
        expect(() => applyVerificationSetupResult(result, environment, [root])).toThrow(expect.objectContaining({ reason: 'result-invalid', message: expect.not.stringContaining('secret') }));
    });
});
