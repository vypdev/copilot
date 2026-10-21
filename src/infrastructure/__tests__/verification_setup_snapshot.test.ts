import cp from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureVerificationSetup } from '../verification_setup_snapshot';
import { VERIFICATION_SETUP_PATH } from '../../application/policies/verification_setup_policy';
import * as environment from '../untrusted_command_environment';

describe('trusted repository setup snapshot', () => {
    let root: string;
    const git = (...args: string[]) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    const commit = (script: string | Buffer): string => {
        mkdirSync(join(root, '.github/actions/copilot-verification-setup'), { recursive: true });
        writeFileSync(join(root, VERIFICATION_SETUP_PATH), script);
        git('add', '.'); git('commit', '-m', 'fixture');
        const sha = git('rev-parse', 'HEAD');
        git('update-ref', 'refs/remotes/origin/main', sha);
        return sha;
    };
    beforeEach(() => {
        root = realpathSync(mkdtempSync(join(tmpdir(), 'copilot-setup-snapshot-')));
        git('init'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.test');
    });
    afterEach(() => { jest.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });

    it('does no acquisition when disabled, even with absent workspace/ref', () => {
        expect(captureVerificationSetup(false, 'invalid', '/missing')).toEqual({ kind: 'disabled' });
    });
    it('pins trusted bytes and SHA before candidate changes or remote-ref mutation', () => {
        const sha = commit('runs:\n  using: composite\n  steps:\n    - run: echo trusted\n      shell: bash\n');
        const snapshot = captureVerificationSetup(true, 'main', root);
        commit('throw new Error("candidate");');
        expect(snapshot).toMatchObject({ kind: 'ready', sourceSha: sha, files: [expect.objectContaining({ path: 'action.yml' })], workspace: root });
        expect(Object.isFrozen(snapshot)).toBe(true);
    });
    it('defers acquisition failure on query/no-op routes', () => {
        expect(captureVerificationSetup(true, 'main', '/absent/workspace')).toEqual({ kind: 'blocked', reason: 'source-unavailable' });
    });
    it('defers private acquisition cleanup failure instead of failing a read-only route', () => {
        const cleanup = jest.fn(() => { throw new Error('private runtime failure'); });
        jest.spyOn(environment, 'prepareUntrustedCommandEnvironment').mockReturnValue({ environment: {}, cleanup });
        expect(captureVerificationSetup(true, '--invalid', root)).toEqual({ kind: 'blocked', reason: 'source-unavailable' });
        expect(cleanup).toHaveBeenCalledTimes(1);
    });
    it('defers missing trusted refs without consulting the candidate helper', () => {
        expect(captureVerificationSetup(true, 'main', root)).toEqual({ kind: 'blocked', reason: 'source-unavailable' });
    });
    it('captures the canonical trusted tool root independently of later environment changes', () => {
        commit('runs:\n  using: composite\n  steps:\n    - run: echo ready\n      shell: bash\n'); const previous = process.env.RUNNER_TOOL_CACHE;
        try {
            process.env.RUNNER_TOOL_CACHE = root;
            expect(captureVerificationSetup(true, 'main', root)).toMatchObject({ kind: 'ready', toolRoot: root });
        } finally { if (previous === undefined) delete process.env.RUNNER_TOOL_CACHE; else process.env.RUNNER_TOOL_CACHE = previous; }
    });
    it('verifies SHA-256 Git object stores without truncating their identity', () => {
        rmSync(join(root, '.git'), { recursive: true }); git('init', '--object-format=sha256');
        git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.test');
        const sha = commit('runs:\n  using: composite\n  steps:\n    - run: echo ready\n      shell: bash\n'); expect(sha).toHaveLength(64);
        expect(captureVerificationSetup(true, 'main', root)).toMatchObject({ kind: 'ready', sourceSha: sha });
    });
    it('rejects enabled missing helpers at the captured trusted SHA', () => {
        git('commit', '--allow-empty', '-m', 'empty'); const sha = git('rev-parse', 'HEAD');
        git('update-ref', 'refs/remotes/origin/main', sha);
        expect(captureVerificationSetup(true, 'main', root)).toEqual({ kind: 'blocked', reason: 'helper-invalid', sourceSha: sha });
    });
    it.each(['--bad', 'main..branch', 'a//b', 'a/', 'a.lock', 'a\nbranch'])('rejects unsafe trusted source %j', branch => {
        expect(captureVerificationSetup(true, branch, root)).toMatchObject({ kind: 'blocked', reason: 'source-unavailable' });
    });
    it.each([Buffer.from(''), Buffer.from([255, 254]), Buffer.from('a\0b'), Buffer.alloc(65_537, 97)])('rejects unsafe helper bytes %#', bytes => {
        commit(bytes);
        expect(captureVerificationSetup(true, 'main', root)).toMatchObject({ kind: 'blocked', reason: 'helper-invalid' });
    });
    it('rejects Git symlink mode without following the candidate filesystem', () => {
        commit('target'); const blob = git('rev-parse', `HEAD:${VERIFICATION_SETUP_PATH}`);
        git('update-index', '--cacheinfo', `120000,${blob},${VERIFICATION_SETUP_PATH}`); git('commit', '-m', 'link');
        git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
        expect(captureVerificationSetup(true, 'main', root)).toMatchObject({ reason: 'helper-invalid' });
    });
    it('never forwards runner credentials or inherited auth profiles to Git reads', () => {
        commit('runs:\n  using: composite\n  steps:\n    - run: echo ready\n      shell: bash\n');
        const original = cp.spawnSync;
        const reads = jest.spyOn(cp, 'spawnSync').mockImplementation(((program: string, args: string[], options: cp.SpawnSyncOptions) => {
            expect(options.env).not.toHaveProperty('PAT');
            expect(options.env).not.toHaveProperty('OPENAI_API_KEY');
            expect(options.env?.HOME).not.toBe(process.env.HOME);
            expect(options.shell).toBe(false);
            return original(program, args, options);
        }) as typeof cp.spawnSync);
        expect(captureVerificationSetup(true, 'main', root).kind).toBe('ready');
        expect(reads).toHaveBeenCalledTimes(3);
    });
    it('detects corrupted blob responses instead of executing mismatched bytes', () => {
        commit('runs:\n  using: composite\n  steps:\n    - run: echo ready\n      shell: bash\n'); const original = cp.spawnSync;
        jest.spyOn(cp, 'spawnSync').mockImplementation(((program: string, args: string[], options: cp.SpawnSyncOptions) => {
            const value = original(program, args, options);
            return args.includes('cat-file') ? { ...value, stdout: Buffer.from('different') } : value;
        }) as typeof cp.spawnSync);
        expect(captureVerificationSetup(true, 'main', root)).toMatchObject({ reason: 'helper-invalid' });
    });
});

// These metadata failures are independent native contract cases, not shell execution tests.
describe('native composite metadata validation', () => {
    let root: string;
    const git = (...args: string[]) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    beforeEach(() => {
        root = realpathSync(mkdtempSync(join(tmpdir(), 'copilot-native-metadata-'))); git('init'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.test');
        mkdirSync(join(root, '.github/actions/copilot-verification-setup'), { recursive: true });
    });
    afterEach(() => rmSync(root, { recursive: true, force: true }));
    it.each([
        'runs: {using: node24, main: index.js}', 'runs: {using: composite, steps: []}', 'runs: [',
        'runs: {using: composite, steps: [null]}', 'runs: {using: composite, steps: [{uses: "./candidate-action"}]}',
        'runs:\n  using: composite\n  steps:\n' + Array(33).fill('    - run: echo x\n      shell: bash\n').join(''),
    ])('rejects invalid native metadata %#', metadata => {
        writeFileSync(join(root, VERIFICATION_SETUP_PATH), metadata); git('add', '.'); git('commit', '-m', 'fixture'); git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
        expect(captureVerificationSetup(true, 'main', root)).toMatchObject({ kind: 'blocked', reason: 'helper-invalid' });
    });
    it('captures reviewed auxiliary script bytes independently of candidate edits', () => {
        writeFileSync(join(root, VERIFICATION_SETUP_PATH), 'runs: {using: composite, steps: [{run: "echo ready", shell: bash}]}');
        writeFileSync(join(root, '.github/actions/copilot-verification-setup/prepare.sh'), 'reviewed'); git('add', '.'); git('commit', '-m', 'fixture'); git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD'));
        const snapshot = captureVerificationSetup(true, 'main', root); writeFileSync(join(root, '.github/actions/copilot-verification-setup/prepare.sh'), 'candidate');
        expect(snapshot).toMatchObject({kind: 'ready', files: expect.arrayContaining([expect.objectContaining({path: 'prepare.sh', base64: Buffer.from('reviewed').toString('base64')})])});
    });
});
