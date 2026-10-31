import { cleanupNativeSourceRuntime } from './native_verification_source_runtime';
import { verificationExecutable } from './verification_executable';
import { nativeWorkerSecrets, redactNativeWorkerLogs } from './native_verification_redaction';
import { removeNativeVerificationProfiles } from './native_verification_profiles';
import * as core from '@actions/core';
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, openSync, readSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { privateJvmHomeOption } from './private_jvm_environment';
import { createPrivateVerificationRuntimeRoot } from './agents/agent_private_install_root';
import { trustedWindowsSystemTool } from './agents/agent_trusted_system_tools';
import { getGithubActionInput } from './github_action_input';
import { VerificationSetupError, VERIFICATION_SETUP_LIMITS } from '../application/policies/verification_setup_policy';
import { nativePause, nativeSession, readNativeRecord, writeNativeRecord, type NativeVerificationRequest, type NativeVerificationResponse } from './native_verification_protocol';
import { cleanupNativeVerificationAction, stageNativeVerificationAction } from './native_verification_staging';
import { captureVerificationSetupAtCommit, verificationSetupDigest } from './verification_setup_snapshot';

function emitWorkerOutput(root: string): void {
    const file = join(root, 'worker-output');
    if (process.env.GITHUB_OUTPUT && existsSync(file)) appendFileSync(process.env.GITHUB_OUTPUT, requireRead(file));
    const summary = join(root, 'worker-summary');
    if (process.env.GITHUB_STEP_SUMMARY && existsSync(summary) && !readNativeRecord(root, 'summary-emitted.json')) {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, requireRead(summary, 1_048_576));
        writeNativeRecord(root, 'summary-emitted.json', { emitted: true });
    }
}

function requireRead(file: string, limit = 262_144): Buffer {
    const fd = openSync(file, 'r');
    try { const size = statSync(file).size; if (size > limit) throw new VerificationSetupError('output-limit'); const data = Buffer.alloc(size); readSync(fd, data, 0, data.length, 0); return data; }
    finally { closeSync(fd); }
}

/** Drain complete lines so runner masking and workflow commands keep their native framing. */
export function drainNativeWorkerLog(root: string, flush = false): void {
    const file = join(root, 'worker-log');
    if (!existsSync(file)) return;
    const cursor = readNativeRecord<{offset: number}>(root, 'log-cursor.json')?.offset ?? 0;
    const fd = openSync(file, 'r');
    let offset = cursor;
    try {
        const buffer = Buffer.alloc(65_536);
        let pending = Buffer.alloc(0);
        let size: number;
        while ((size = readSync(fd, buffer, 0, buffer.length, offset + pending.length))) {
            pending = Buffer.concat([pending, buffer.subarray(0, size)]);
            const lastLine = pending.lastIndexOf(10);
            if (lastLine >= 0) {
                const complete = pending.subarray(0, lastLine + 1);
                process.stdout.write(complete);
                offset += complete.length;
                pending = pending.subarray(lastLine + 1);
            }
            // Existing action logs may contain long lines; retain framing without unbounded buffering.
            if (pending.length > 1_048_576) throw new VerificationSetupError('output-limit');
        }
        if (flush && pending.length) { process.stdout.write(pending); offset += pending.length; }
        writeNativeRecord(root, 'log-cursor.json', { offset });
    } finally { closeSync(fd); }
}

export async function awaitNativeBoundary(root: string, timeoutMs = 7_200_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (true) {
        drainNativeWorkerLog(root);
        const done = readNativeRecord<{exitCode: number}>(root, 'done.json');
        if (done) {
            drainNativeWorkerLog(root, true);
            emitWorkerOutput(root);
            core.setOutput('verification-setup-pending', 'false');
            if (done.exitCode !== 0) core.setFailed('Copilot execution failed; inspect the preceding operation result.');
            return;
        }
        const request = readNativeRecord<NativeVerificationRequest>(root, 'request.json', 32_768);
        if (request) {
            if (!/^[a-f0-9-]{36}$/u.test(request.id) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(request.sourceSha)
                || !/^[a-f0-9]{64}$/u.test(request.digest) || !request.environment || typeof request.environment.HOME !== 'string') throw new VerificationSetupError('handoff-invalid');
            const home = request.environment.HOME;
            if (!isAbsolute(home) || /[\r\n\0]/u.test(home)
                || request.environment.JDK_JAVA_OPTIONS !== privateJvmHomeOption(home)
                || request.environment.GRADLE_USER_HOME !== join(home, '.gradle')) throw new VerificationSetupError('handoff-invalid');
            core.setOutput('verification-request', request.id);
            core.setOutput('verification-source', request.sourceSha);
            core.setOutput('verification-digest', request.digest);
            core.saveState('native-verification-digest', request.digest);
            core.saveState('native-verification-source', request.sourceSha);
            for (const key of ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PATH', 'JAVA_HOME', 'JDK_JAVA_OPTIONS', 'GRADLE_USER_HOME', 'TMP', 'TEMP', 'TMPDIR']) {
                const value = request.environment[key] ?? '';
                if (typeof value !== 'string' || /[\r\n\0]/u.test(value)) throw new VerificationSetupError('handoff-invalid');
                core.setOutput(`verification-${key.toLowerCase()}`, value);
            }
            core.setOutput('verification-setup-pending', 'true');
            return;
        }
        if (Date.now() >= deadline) throw new VerificationSetupError('timeout');
        const session = nativeSession(root);
        try { process.kill(session.pid, 0); } catch { throw new VerificationSetupError('process-failed'); }
        await nativePause(100);
    }
}

export async function continueNativeVerification(root: string, id: string, outcome: string, environment = process.env): Promise<void> {
    nativeSession(root);
    const request = readNativeRecord<NativeVerificationRequest>(root, 'request.json', 32_768);
    if (!request || request.id !== id || !/^[a-f0-9-]{36}$/u.test(id)
        || existsSync(join(root, `response-${id}.json`))) throw new VerificationSetupError('handoff-invalid');
    const response: NativeVerificationResponse = { id, success: outcome === 'success', path: environment.PATH ?? '',
        ...(environment.JAVA_HOME ? { javaHome: environment.JAVA_HOME } : {}) };
    rmSync(join(root, 'request.json'));
    writeNativeRecord(root, `response-${id}.json`, response);
    await awaitNativeBoundary(root);
}

export async function cleanupNativeVerification(root: string, waitMs = 10_000, deferProfileCleanup = false): Promise<void> {
    if (!existsSync(root)) return;
    const session = nativeSession(root);
    if (!readNativeRecord(root, 'done.json')) {
        writeNativeRecord(root, 'cancel.json', { cancelled: true });
        const deadline = Date.now() + waitMs;
        while (!readNativeRecord(root, 'done.json') && Date.now() < deadline) await nativePause(100);
        if (!readNativeRecord(root, 'done.json')) {
            try {
                if (process.platform === 'win32') spawnSync(trustedWindowsSystemTool('taskkill.exe'), ['/PID', String(session.pid), '/T', '/F'], { windowsHide: true, shell: false, timeout: 5_000, stdio: 'ignore' });
                else process.kill(-session.pid, 'SIGKILL');
            } catch { /* Worker may have exited while cancellation completed. */ }
        }
    }
    if (!deferProfileCleanup) cleanupNativeVerificationAction(root, session.workspace);
    drainNativeWorkerLog(root, true);
    if (!deferProfileCleanup) { removeNativeVerificationProfiles(root); rmSync(root, { recursive: true, force: true }); }
}

async function startNativeVerification(): Promise<void> {
    for (const secret of nativeWorkerSecrets(process.env)) core.setSecret(secret);
    const git = verificationExecutable('git', { PATH: process.env.PATH ?? '', PATHEXT: process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM' });
    core.saveState('native-verification-git', git);
    core.setOutput('verification-git', git);
    const root = realpathSync(createPrivateVerificationRuntimeRoot());
    for (const name of ['worker-output', 'worker-env', 'worker-path', 'worker-log', 'worker-summary']) writeFileSync(join(root, name), '', { flag: 'wx', mode: 0o600 });
    const log = openSync(join(root, 'worker-log'), 'a');
    try {
        const worker = spawn(process.execPath, [process.argv[1]], { cwd: process.cwd(), detached: true, windowsHide: true,
            stdio: ['ignore', log, log], env: { ...process.env, COPILOT_NATIVE_PHASE: '', COPILOT_NATIVE_WORKER_SESSION: root,
                GITHUB_STEP_SUMMARY: join(root, 'worker-summary'), GITHUB_OUTPUT: join(root, 'worker-output'), GITHUB_ENV: join(root, 'worker-env'), GITHUB_PATH: join(root, 'worker-path') } });
        await new Promise<void>((resolve, reject) => { worker.once('spawn', resolve); worker.once('error', reject); });
        worker.unref();
        writeNativeRecord(root, 'session.json', { schemaVersion: 1, workspace: realpathSync(process.cwd()), run: process.env.GITHUB_RUN_ID ?? '',
            attempt: process.env.GITHUB_RUN_ATTEMPT ?? '', job: process.env.GITHUB_JOB ?? '', pid: worker.pid });
        core.saveState('native-verification-ticket', root);
        core.saveState('native-verification-owner', 'true');
        core.setOutput('verification-ticket', root);
        await awaitNativeBoundary(root);
    } catch (error) {
        if (existsSync(join(root, 'session.json'))) await cleanupNativeVerification(root);
        else rmSync(root, { recursive: true, force: true });
        throw error;
    } finally { closeSync(log); }
}

/** Native phases are runner-only control messages; no credentials or agent operations are replayed. */
export async function runNativeVerificationEntry(run: () => Promise<void>): Promise<void> {
    const post = core.getState('copilot-native-post');
    if (post === 'true') {
        const root = core.getState('native-verification-ticket');
        if (root && core.getState('native-verification-owner') === 'true') await cleanupNativeVerification(root);
        else if (root && existsSync(root) && core.getState('native-verification-source')) {
            const session = nativeSession(root);
            try {
                const snapshot = captureVerificationSetupAtCommit(core.getState('native-verification-source'), session.workspace, core.getState('native-verification-git'));
                if (snapshot.kind !== 'ready' || verificationSetupDigest(snapshot) !== core.getState('native-verification-digest')) throw new VerificationSetupError('helper-invalid');
                stageNativeVerificationAction(snapshot, root);
            } catch {
                // A later native post must fail to load rather than execute candidate-modified metadata.
                cleanupNativeVerificationAction(root, session.workspace);
                throw new VerificationSetupError('helper-invalid');
            }
        }
        const sourceRuntime = core.getState('native-source-runtime');
        if (sourceRuntime) cleanupNativeSourceRuntime(sourceRuntime, realpathSync(process.cwd()));
        return;
    }
    core.saveState('copilot-native-post', 'true');
    if (process.env.COPILOT_NATIVE_PHASE === 'prepare' && process.env.COPILOT_NATIVE_RUNTIME_CACHE) core.saveState('native-source-runtime', process.env.COPILOT_NATIVE_RUNTIME_CACHE);
    const worker = process.env.COPILOT_NATIVE_WORKER_SESSION;
    if (worker) {
        const deadline = Date.now() + 30_000;
        while (!readNativeRecord(worker, 'session.json')) {
            if (Date.now() >= deadline) throw new VerificationSetupError('timeout');
            await nativePause(10);
        }
        if (nativeSession(worker).pid !== process.pid) throw new VerificationSetupError('handoff-invalid');
        const restoreLog = redactNativeWorkerLogs();
        try { await run(); }
        finally { restoreLog(); writeNativeRecord(worker, 'done.json', { exitCode: Number(process.exitCode ?? 0) }); }
        return;
    }
    const phase = process.env.COPILOT_NATIVE_PHASE;
    if (!phase || phase === 'prepare' && getGithubActionInput('verification-setup') !== 'true') { await run(); return; }
    if (process.env.GITHUB_ACTIONS !== 'true') throw new VerificationSetupError('native-workflow-required');
    if (phase === 'prepare') { await startNativeVerification(); return; }
    const root = process.env.COPILOT_NATIVE_TICKET;
    if (!root) throw new VerificationSetupError('handoff-invalid');
    nativeSession(root);
    core.saveState('native-verification-ticket', root);
    core.saveState('native-verification-source', process.env.COPILOT_NATIVE_SOURCE ?? '');
    core.saveState('native-verification-digest', process.env.COPILOT_NATIVE_DIGEST ?? '');
    core.saveState('native-verification-git', process.env.COPILOT_NATIVE_GIT ?? '');
    if (phase === 'continue') {
        await continueNativeVerification(root, process.env.COPILOT_NATIVE_REQUEST ?? '', process.env.COPILOT_NATIVE_OUTCOME ?? '');
        return;
    }
    if (phase === 'finish') {
        nativeSession(root);
        const done = readNativeRecord<{exitCode: number}>(root, 'done.json');
        if (done) { emitWorkerOutput(root); if (done.exitCode !== 0) core.setFailed('Copilot execution failed.'); }
        else core.setFailed(`Repository setup did not complete within ${VERIFICATION_SETUP_LIMITS.requests} native verification boundaries. Pending verification and subsequent publication are blocked; inspect earlier operation results for completed effects.`);
        await cleanupNativeVerification(root, 10_000, true);
        return;
    }
    throw new VerificationSetupError('handoff-invalid');
}
