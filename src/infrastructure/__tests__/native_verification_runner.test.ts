import fs from 'node:fs';
import { join, delimiter } from 'node:path';
import { prepareRepositoryVerification } from '../verification_setup_runner';
import { GitCommitAdapter } from '../git_commit_adapter';
import { runVerifyCommands } from '../../application/usecases/steps/commit/bugbot/verify_command_runner';
import { writeNativeRecord } from '../native_verification_protocol';
import { nativeVerificationFixture, COMPOSITE } from './native_verification_fixture';

// The test driver supplies native runner results; production never interprets YAML.
describe('native verification boundary', () => {
    let f: ReturnType<typeof nativeVerificationFixture>;
    beforeEach(() => { f = nativeVerificationFixture(); });
    afterEach(() => { jest.restoreAllMocks(); f.cleanup(); });
    it('does no work for disabled setup', async () => {
        await prepareRepositoryVerification({ kind: 'disabled' }, f.runtime.environment);
        expect(fs.existsSync(join(f.session, 'request.json'))).toBe(false);
    });
    it('defers blocked acquisition until an actual verifier runs', async () => {
        const execute = jest.fn().mockResolvedValue(0);
        const adapter = new GitCommitAdapter(execute, jest.fn(), { kind: 'blocked', reason: 'source-unavailable' });
        await adapter.execute('git', ['status'], { untrusted: true });
        await expect(adapter.execute('node', ['test'], { untrusted: true, verifyRuntimePrerequisites: true })).rejects.toMatchObject({ reason: 'source-unavailable' });
        expect(execute).toHaveBeenCalledTimes(1);
    });
    it('executes no setup for empty verification lists', async () => {
        const execute = jest.fn(); expect(await runVerifyCommands([], execute)).toEqual({ success: true }); expect(execute).not.toHaveBeenCalled();
    });
    it('fails closed in the local CLI or an old workflow without native continuation', async () => {
        delete process.env.COPILOT_NATIVE_WORKER_SESSION;
        await expect(prepareRepositoryVerification(f.setup, f.runtime.environment)).rejects.toMatchObject({ reason: 'native-workflow-required' });
    });
    it('stages only pinned YAML and assets, then restores the candidate byte for byte', async () => {
        fs.mkdirSync(f.action, { recursive: true }); fs.writeFileSync(join(f.action, 'action.yml'), 'candidate');
        const running = prepareRepositoryVerification(f.setup, f.runtime.environment);
        expect(fs.readFileSync(join(f.action, 'action.yml'), 'utf8')).toBe(COMPOSITE);
        expect(fs.readFileSync(join(f.action, 'scripts/prepare.sh'), 'utf8')).toBe('echo reviewed');
        f.respond(); await running;
        expect(fs.readFileSync(join(f.action, 'action.yml'), 'utf8')).toBe('candidate');
        expect(fs.existsSync(join(f.action, 'scripts'))).toBe(false);
    });
    it('removes a temporary action absent from the candidate', async () => {
        const running = prepareRepositoryVerification(f.setup, f.runtime.environment); f.respond(); await running;
        expect(fs.existsSync(f.action)).toBe(false); expect(f.git('status', '--porcelain')).toBe('');
    });
    it('prepares each changed candidate with a fresh HOME before preflight and verification', async () => {
        const homes: string[] = []; const order: string[] = [];
        const adapter = new GitCommitAdapter(async (_p, _a, options) => { order.push('verify'); homes.push(options!.env!.HOME); return 0; }, () => { order.push('preflight'); }, f.setup);
        for (const version of ['first', 'changed']) {
            fs.writeFileSync(join(f.root, 'manifest'), version);
            const running = adapter.execute('node', ['test'], { untrusted: true, verifyRuntimePrerequisites: true });
            f.respond(request => {
                expect(fs.readFileSync(join(f.root, 'manifest'), 'utf8')).toBe(version);
                for (const key of ['PAT', 'GITHUB_TOKEN', 'OPENAI_API_KEY', 'CODEX_HOME', 'NODE_OPTIONS']) expect(request.environment).not.toHaveProperty(key);
                return {};
            });
            await running;
        }
        expect(order).toEqual(['preflight', 'verify', 'preflight', 'verify']); expect(new Set(homes).size).toBe(2);
        expect(homes.every(home => fs.existsSync(home))).toBe(true);
    });
    it('accepts only validated runtime directory additions and JAVA_HOME', async () => {
        const bin = join(f.root, 'tools'); fs.mkdirSync(bin); const running = prepareRepositoryVerification(f.setup, f.runtime.environment);
        f.respond(request => ({ path: `${bin}${delimiter}${request.environment.PATH}`, javaHome: bin })); await running;
        expect(f.runtime.environment.PATH.split(delimiter)[0]).toBe(bin); expect(f.runtime.environment.JAVA_HOME).toBe(bin);
    });
    it('drops earlier profiles from the runner PATH instead of reusing their readiness', async () => {
        const adapter = new GitCommitAdapter(async (_p, _a, options) => { expect(options!.env!.PATH).not.toContain('stale-tools'); return 0; }, () => {}, f.setup);
        let firstHome = '';
        const first = adapter.execute('node', ['test'], { untrusted: true, verifyRuntimePrerequisites: true });
        f.respond(request => { firstHome = request.environment.HOME; fs.mkdirSync(join(firstHome, 'stale-tools')); return {}; }); await first;
        const second = adapter.execute('node', ['test'], { untrusted: true, verifyRuntimePrerequisites: true });
        f.respond(request => ({ path: `${join(firstHome, 'stale-tools')}${delimiter}${request.environment.PATH}` })); await second;
    });
    it.each(['tracked', 'untracked', 'index', 'head'])('withholds verification when setup changes the %s candidate', async kind => {
        if (kind === 'untracked') fs.writeFileSync(join(f.root, 'new-file'), 'candidate');
        const running = prepareRepositoryVerification(f.setup, f.runtime.environment);
        if (kind === 'tracked') fs.writeFileSync(join(f.root, 'manifest'), 'modified');
        if (kind === 'untracked') fs.writeFileSync(join(f.root, 'new-file'), 'modified');
        if (kind === 'index') { fs.writeFileSync(join(f.root, 'manifest'), 'modified'); f.git('add', '.'); }
        if (kind === 'head') { f.git('commit', '--allow-empty', '-m', 'unexpected'); }
        f.respond(); await expect(running).rejects.toMatchObject({ reason: 'candidate-changed' });
        expect(fs.existsSync(f.action)).toBe(false);
    });
    it.each([{success: false}, {id: 'wrong'}, {path: 1}, {javaHome: 1}, {path: '/outside/invalid'}])('rejects failed or malformed native outcomes %j', async response => {
        const running = prepareRepositoryVerification(f.setup, f.runtime.environment); f.respond(() => response);
        await expect(running).rejects.toThrow('Verification, commit and push are withheld');
        expect(fs.existsSync(f.action)).toBe(false);
    });
    it('withholds the command and probes after a setup failure', async () => {
        const execute = jest.fn(); const preflight = jest.fn(); const adapter = new GitCommitAdapter(execute, preflight, f.setup);
        const running = adapter.execute('node', ['test'], { untrusted: true, verifyRuntimePrerequisites: true }); f.respond(() => ({ success: false }));
        await expect(running).rejects.toMatchObject({ reason: 'process-failed' }); expect(execute).not.toHaveBeenCalled(); expect(preflight).not.toHaveBeenCalled();
    });
    it('cancels a pending setup and restores the candidate', async () => {
        const running = prepareRepositoryVerification(f.setup, f.runtime.environment); writeNativeRecord(f.session, 'cancel.json', { cancelled: true });
        await expect(running).rejects.toMatchObject({ reason: 'cancelled' }); expect(fs.existsSync(f.action)).toBe(false);
    });
    it('times out without retrying or publishing', async () => {
        let now = 0; jest.spyOn(Date, 'now').mockImplementation(() => now);
        const running = prepareRepositoryVerification(f.setup, f.runtime.environment); now = 300_001;
        await expect(running).rejects.toMatchObject({ reason: 'timeout' }); expect(fs.existsSync(f.action)).toBe(false);
    });
    it('enforces the fixed native invocation ceiling', async () => {
        writeNativeRecord(f.session, 'request-count.json', { count: 20 });
        await expect(prepareRepositoryVerification(f.setup, f.runtime.environment)).rejects.toMatchObject({ reason: 'handoff-invalid' });
    });
    it('rejects workspace switches before setup', async () => {
        await expect(prepareRepositoryVerification({ ...f.setup, workspace: f.session } as typeof f.setup, f.runtime.environment)).rejects.toMatchObject({ reason: 'workspace-changed' });
    });
});
