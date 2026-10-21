import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import type { PreparedVerificationSetup } from '../application/ports/verification_setup_ports';
import { DISABLED_VERIFICATION_SETUP } from '../application/ports/verification_setup_ports';
import { VERIFICATION_SETUP_LIMITS, VERIFICATION_SETUP_PATH, VerificationSetupError } from '../application/policies/verification_setup_policy';
import { prepareUntrustedCommandEnvironment } from './untrusted_command_environment';

/** No network, agent, worktree-file reads, or credentials. Acquisition errors are deferred until verification. */
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
                shell: false, windowsHide: true, timeout: 5_000, maxBuffer: VERIFICATION_SETUP_LIMITS.scriptBytes + 4096 });
            if (result.error || result.status !== 0) throw new Error();
            return result.stdout;
        };
        const candidateSha = git('rev-parse', '--verify', `refs/remotes/origin/${mainBranch}^{commit}`).toString('utf8').trim();
        if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(candidateSha)) throw new Error();
        sourceSha = candidateSha;
        const entry = git('ls-tree', '-z', sourceSha, '--', VERIFICATION_SETUP_PATH).toString('utf8');
        const match = /^(100644|100755) blob ([a-f0-9]{40}|[a-f0-9]{64})\t\.copilot\/verification-setup\.mjs\0$/u.exec(entry);
        if (!match) throw new VerificationSetupError('helper-invalid');
        const bytes = git('cat-file', 'blob', match[2]);
        const digest = createHash(match[2].length === 40 ? 'sha1' : 'sha256').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
        const script = bytes.toString('utf8');
        if (!bytes.length || bytes.length > VERIFICATION_SETUP_LIMITS.scriptBytes || digest !== match[2]
            || !Buffer.from(script).equals(bytes) || script.includes('\0')) throw new VerificationSetupError('helper-invalid');
        const toolRoot = environment.RUNNER_TOOL_CACHE ? realpathSync(environment.RUNNER_TOOL_CACHE) : undefined;
        snapshot = Object.freeze({ kind: 'ready', script, sourceSha, workspace, node: process.execPath, ...(toolRoot ? { toolRoot } : {}) });
    } catch (error) {
        snapshot = Object.freeze({ kind: 'blocked', reason: error instanceof VerificationSetupError ? error.reason : 'source-unavailable', ...(sourceSha ? { sourceSha } : {}) });
    }
    try { runtime?.cleanup(); }
    catch { snapshot = Object.freeze({ kind: 'blocked', reason: 'source-unavailable', ...(sourceSha ? { sourceSha } : {}) }); }
    return snapshot;
}
