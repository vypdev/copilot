import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { load } from 'js-yaml';
import type { PreparedVerificationSetup, VerificationSetupFile } from '../application/ports/verification_setup_ports';
import { DISABLED_VERIFICATION_SETUP } from '../application/ports/verification_setup_ports';
import { VERIFICATION_SETUP_DIRECTORY, VERIFICATION_SETUP_LIMITS, VerificationSetupError } from '../application/policies/verification_setup_policy';
import { prepareUntrustedCommandEnvironment } from './untrusted_command_environment';

/** Only immutable Git objects are read. Errors remain deferred on non-verifying routes. */
export function captureVerificationSetup(enabled: boolean, mainBranch: string, root = process.cwd()): PreparedVerificationSetup {
    if (!enabled) return DISABLED_VERIFICATION_SETUP;
    let sourceSha: string | undefined;
    let runtime: ReturnType<typeof prepareUntrustedCommandEnvironment> | undefined;
    let snapshot: PreparedVerificationSetup;
    try {
        runtime = prepareUntrustedCommandEnvironment();
        const environment = runtime.environment;
        if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$/u.test(mainBranch) || mainBranch.includes('..')
            || mainBranch.includes('//') || mainBranch.endsWith('/') || mainBranch.endsWith('.lock')) throw new Error();
        const workspace = realpathSync(root);
        const git = (...args: string[]): Buffer => {
            const result = spawnSync('git', ['--no-replace-objects', ...args], { cwd: workspace, env: environment,
                shell: false, windowsHide: true, timeout: 5_000, maxBuffer: VERIFICATION_SETUP_LIMITS.snapshotBytes + 4096 });
            if (result.error || result.status !== 0) throw new Error();
            return result.stdout;
        };
        const sha = git('rev-parse', '--verify', `refs/remotes/origin/${mainBranch}^{commit}`).toString('utf8').trim();
        if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(sha)) throw new Error();
        sourceSha = sha;
        const entries = git('ls-tree', '-rz', sourceSha, '--', VERIFICATION_SETUP_DIRECTORY).toString('utf8').split('\0').filter(Boolean);
        if (!entries.length || entries.length > VERIFICATION_SETUP_LIMITS.files) throw new VerificationSetupError('helper-invalid');
        let total = 0;
        const files: VerificationSetupFile[] = entries.map(entry => {
            const match = /^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t(.+)$/u.exec(entry);
            if (!match || !match[3].startsWith(`${VERIFICATION_SETUP_DIRECTORY}/`)) throw new VerificationSetupError('helper-invalid');
            const path = match[3].slice(VERIFICATION_SETUP_DIRECTORY.length + 1);
            if (!/^[A-Za-z0-9_./-]{1,200}$/u.test(path) || path.split('/').some(part => !part || part === '.' || part === '..' || part.endsWith('.') || /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/iu.test(part))) throw new VerificationSetupError('helper-invalid');
            const bytes = git('cat-file', 'blob', match[2]);
            total += bytes.length;
            const digest = createHash(match[2].length === 40 ? 'sha1' : 'sha256').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
            if (bytes.length > VERIFICATION_SETUP_LIMITS.scriptBytes || total > VERIFICATION_SETUP_LIMITS.snapshotBytes || digest !== match[2]) throw new VerificationSetupError('helper-invalid');
            return Object.freeze({ path, base64: bytes.toString('base64'), executable: match[1] === '100755' });
        });
        const manifest = files.find(file => file.path === 'action.yml');
        if (!manifest) throw new VerificationSetupError('helper-invalid');
        const bytes = Buffer.from(manifest.base64, 'base64');
        const text = bytes.toString('utf8');
        if (!bytes.length || !bytes.equals(Buffer.from(text)) || text.includes('\0')) throw new VerificationSetupError('helper-invalid');
        let action: { runs?: { using?: unknown; steps?: unknown[] } } | null;
        try { action = load(text) as typeof action; } catch { throw new VerificationSetupError('helper-invalid'); }
        if (action?.runs?.using !== 'composite' || !Array.isArray(action.runs.steps) || !action.runs.steps.length || action.runs.steps.length > 32) throw new VerificationSetupError('helper-invalid');
        if (action.runs.steps.some(step => !step || typeof step !== 'object' || 'uses' in step && typeof step.uses === 'string' && step.uses.startsWith('./'))) throw new VerificationSetupError('helper-invalid');
        const toolRoot = environment.RUNNER_TOOL_CACHE ? realpathSync(environment.RUNNER_TOOL_CACHE) : undefined;
        snapshot = Object.freeze({ kind: 'ready', files: Object.freeze(files), sourceSha, workspace, ...(toolRoot ? { toolRoot } : {}) });
    } catch (error) {
        snapshot = Object.freeze({ kind: 'blocked', reason: error instanceof VerificationSetupError ? error.reason : 'source-unavailable', ...(sourceSha ? { sourceSha } : {}) });
    }
    try { runtime?.cleanup(); }
    catch { snapshot = Object.freeze({ kind: 'blocked', reason: 'source-unavailable', ...(sourceSha ? { sourceSha } : {}) }); }
    return snapshot;
}
