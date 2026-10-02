import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import type { AgentExecutionPlan, AgentOutputProtocol } from '../../domain/agent_execution_plan';
import { AgentCliError } from './agent_cli_contracts';
import { verifyWindowsRuntimePathPrivate } from '../../infrastructure/agents/windows_runtime_acl';
import { validateAgentExecutableFile } from '../../infrastructure/agents/agent_executable_file';

const MAX_STDERR_BYTES = 8 * 1024;

export function runAgentCli(plan: AgentExecutionPlan, prompt: string, signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
        let runtimeDirectory: string | undefined;
        try {
            runtimeDirectory = verifyOwnedRuntimeDirectory(plan.runtimeDirectory);
            verifyAdmittedPlan(plan, runtimeDirectory);
            if (Buffer.byteLength(prompt, 'utf8') > plan.maxPromptBytes) {
                throw new AgentCliError(`Agent CLI prompt exceeded the ${plan.maxPromptBytes}-byte limit.`, 'configuration');
            }
        } catch (error) {
            if (runtimeDirectory) cleanupRuntimeDirectory(runtimeDirectory);
            reject(error instanceof AgentCliError ? error : new AgentCliError('Agent execution plan integrity check failed.', 'configuration'));
            return;
        }
        const cleanup = () => cleanupRuntimeDirectory(runtimeDirectory);
        const child = (() => {
            try {
                return spawn(plan.executable, [
                    ...(plan.launcherArgv || []),
                    ...plan.argv,
                    ...(plan.promptMode === 'final-argv' ? [prompt] : []),
                ], {
                    cwd: plan.workspace,
                    env: plan.environment,
                    stdio: ['pipe', 'pipe', 'pipe'],
                    shell: false,
                    detached: process.platform !== 'win32',
                });
            } catch {
                cleanup();
                reject(new AgentCliError('Unable to start agent CLI.', 'process'));
                return undefined;
            }
        })();
        if (!child) return;
        const lifecycle = createAgentProcessLifecycle(
            child,
            plan,
            signal,
            (value) => { cleanup(); resolve(value); },
            (error) => { cleanup(); reject(error); },
        );
        child.stdout.on('data', lifecycle.appendStdout);
        child.stderr.on('data', lifecycle.appendStderr);
        child.stdin.once('error', lifecycle.onStdinError);
        child.once('error', lifecycle.onError);
        child.once('close', lifecycle.onClose);
        if (signal?.aborted) return lifecycle.abort();
        signal?.addEventListener('abort', lifecycle.abort, { once: true });
        child.stdin.end(plan.promptMode === 'stdin' ? prompt : undefined);
    });
}

export function createAgentProcessLifecycle(
    child: ReturnType<typeof spawn>,
    plan: AgentExecutionPlan,
    signal: AbortSignal | undefined,
    resolve: (value: string) => void,
    reject: (error: Error) => void,
) {
    const stdoutChunks: Buffer[] = [];
    let stderrBytes = 0;
    let outputBytes = 0;
    let settled = false;
    let terminationError: Error | undefined;
    const timers: { timeout?: NodeJS.Timeout; force?: NodeJS.Timeout } = {};

    const finishResolve = (value: string) => {
        if (settled) return;
        settled = true;
        if (timers.timeout) clearTimeout(timers.timeout);
        if (timers.force) clearTimeout(timers.force);
        signal?.removeEventListener('abort', abort);
        resolve(value);
    };
    const finishReject = (error: Error) => {
        if (settled) return;
        settled = true;
        if (timers.timeout) clearTimeout(timers.timeout);
        if (timers.force) clearTimeout(timers.force);
        signal?.removeEventListener('abort', abort);
        reject(error);
    };
    const beginTermination = (error: Error) => {
        if (settled || terminationError) return;
        terminationError = error;
        if (timers.timeout) clearTimeout(timers.timeout);
        signalProcessTree(child, 'SIGTERM');
        timers.force = setTimeout(() => {
            if (child.exitCode === null) signalProcessTree(child, 'SIGKILL');
        }, 5_000);
        timers.force.unref();
    };
    const abort = () => {
        beginTermination(new AgentCliError('Agent CLI execution was cancelled.', 'cancelled'));
    };
    const appendStdout = (chunk: Buffer) => {
        if (settled || terminationError) return;
        outputBytes += chunk.byteLength;
        if (outputBytes > plan.maxOutputBytes) {
            beginTermination(new AgentCliError(`Agent CLI output exceeded the ${plan.maxOutputBytes}-byte limit.`, 'output'));
            return;
        }
        stdoutChunks.push(chunk);
    };
    const appendStderr = (chunk: Buffer) => {
        if (settled || terminationError) return;
        outputBytes += chunk.byteLength;
        if (outputBytes > plan.maxOutputBytes) {
            beginTermination(new AgentCliError(`Agent CLI output exceeded the ${plan.maxOutputBytes}-byte limit.`, 'output'));
            return;
        }
        stderrBytes = Math.min(stderrBytes + chunk.byteLength, MAX_STDERR_BYTES);
    };
    const onStdinError = () => beginTermination(new AgentCliError('Unable to send the prompt to the agent CLI.', 'process'));
    const onError = () => finishReject(new AgentCliError('Unable to start agent CLI.', 'process'));
    const onClose = (code: number | null) => {
        if (terminationError) {
            finishReject(terminationError);
            return;
        }
        if (code !== 0) {
            const diagnostic = stderrBytes > 0 ? ' Diagnostic output was suppressed for safety.' : '';
            finishReject(new AgentCliError(`Agent CLI exited with code ${code}.${diagnostic}`, 'process', code === 75, code ?? undefined));
            return;
        }
        try {
            finishResolve(decodeAgentCliOutput(plan.outputProtocol, Buffer.concat(stdoutChunks).toString('utf8')));
        } catch (error) {
            finishReject(error instanceof AgentCliError
                ? error
                : new AgentCliError('Agent CLI returned invalid output.', 'output'));
        }
    };
    timers.timeout = setTimeout(() => {
        beginTermination(new AgentCliError(`Agent CLI timed out after ${plan.timeoutMs}ms.`, 'timeout'));
    }, plan.timeoutMs);
    return { appendStdout, appendStderr, onStdinError, onError, onClose, abort };
}

export function decodeAgentCliOutput(protocol: AgentOutputProtocol, raw: string): string {
    if (protocol === 'plain-text') {
        const output = raw.trim();
        if (!output) throw new AgentCliError('Agent CLI returned empty output.', 'output');
        return output;
    }
    if (protocol === 'json-lines-text-events') return decodeJsonLinesTextEvents(raw);
    return assertNeverOutputProtocol(protocol);
}

function decodeJsonLinesTextEvents(raw: string): string {
    const lines = raw.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
    const text: string[] = [];
    for (const line of lines) {
        let event: unknown;
        try {
            event = JSON.parse(line);
        } catch {
            throw new AgentCliError('Agent CLI returned malformed JSON event output.', 'output');
        }
        if (!event || typeof event !== 'object' || Array.isArray(event)) {
            throw new AgentCliError('Agent CLI returned an invalid JSON event.', 'output');
        }
        const record = event as Record<string, unknown>;
        const part = record.part;
        if (record.type === 'text' && part && typeof part === 'object' && !Array.isArray(part)) {
            const value = (part as Record<string, unknown>).text;
            if (typeof value === 'string') text.push(value);
        }
    }
    const output = text.join('').trim();
    if (!output) throw new AgentCliError('Agent CLI returned no text completion events.', 'output');
    return output;
}

function assertNeverOutputProtocol(protocol: never): never {
    throw new AgentCliError(`Unsupported agent output protocol: ${String(protocol)}`, 'configuration');
}

function verifyOwnedRuntimeDirectory(requestedPath: string): string {
    const runtimeDirectory = realpathSync(requestedPath);
    const expectedParent = realpathSync(tmpdir());
    const name = basename(runtimeDirectory);
    const stats = statSync(runtimeDirectory);
    if (lstatSync(requestedPath).isSymbolicLink()
        || dirname(runtimeDirectory) !== expectedParent
        || !/^copilot-agent-runtime-[A-Za-z0-9_-]{6}$/u.test(name)
        || !stats.isDirectory()
        || (process.platform !== 'win32' && (stats.mode & 0o077) !== 0)) {
        throw new Error('Managed runtime directory is not an owned private execution directory.');
    }
    if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) {
        throw new Error('Managed runtime directory has an unexpected owner.');
    }
    verifyWindowsRuntimePathPrivate(runtimeDirectory, true);
    return runtimeDirectory;
}

function verifyAdmittedPlan(plan: AgentExecutionPlan, runtimeDirectory: string): void {
    if (process.platform === 'win32' && !/\.exe$/iu.test(plan.executable)) {
        throw new Error('Windows command wrappers cannot execute an admitted agent plan.');
    }
    if (plan.launcherArgv?.length) {
        if (plan.launcherArgv.length !== 1
            || (process.platform !== 'win32' && plan.executable !== process.execPath)
            || !isAbsolute(plan.executable)
            || !isAbsolute(plan.launcherArgv[0]) || !plan.launcherSha256) {
            throw new Error('Managed agent launcher is invalid.');
        }
        if (process.platform === 'win32') verifyWindowsLauncherTrust(plan.executable, plan.launcherArgv[0]);
        const launcher = realpathSync(plan.launcherArgv[0]);
        if (launcher !== plan.launcherArgv[0]
            || !statSync(launcher).isFile()
            || createHash('sha256').update(readFileSync(launcher)).digest('hex') !== plan.launcherSha256) {
            throw new Error('Managed agent launcher changed after preflight.');
        }
    } else if (plan.launcherSha256) {
        throw new Error('Managed agent launcher hash has no launcher.');
    }
    for (const artifact of plan.artifacts) {
        const path = realpathSync(artifact.path);
        const relation = relative(runtimeDirectory, path);
        if (lstatSync(artifact.path).isSymbolicLink()
            || relation.startsWith('..')
            || relation === ''
            || isAbsolute(relation)) {
            throw new Error('Managed artifact escaped its runtime directory.');
        }
        const stats = statSync(path);
        if (!stats.isFile() || (process.platform !== 'win32' && (stats.mode & 0o077) !== 0)) {
            throw new Error('Managed artifact permissions changed.');
        }
        verifyWindowsRuntimePathPrivate(path, false);
        const actual = createHash('sha256').update(readFileSync(path)).digest('hex');
        if (actual !== artifact.sha256) throw new Error('Managed artifact hash changed.');
    }
}

/** Recheck a separate Windows interpreter and package entrypoint immediately before spawn. */
export function verifyWindowsLauncherTrust(
    executable: string,
    launcher: string,
    validate: (path: string) => void = validateAgentExecutableFile,
): void {
    if (realpathSync(executable) !== executable) {
        throw new Error('Managed agent interpreter changed after preflight.');
    }
    validate(executable);
    validate(launcher);
}

function cleanupRuntimeDirectory(runtimeDirectory: string): void {
    rmSync(runtimeDirectory, { recursive: true, force: true });
}

function signalProcessTree(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
    try {
        if (process.platform === 'win32' && child.pid) {
            const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';
            execFileSync(join(systemRoot, 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], {
                stdio: 'ignore', timeout: 5_000, windowsHide: true,
            });
        } else if (child.pid) {
            process.kill(-child.pid, signal);
        } else {
            child.kill(signal);
        }
    } catch {
        // The process may have exited between the lifecycle check and signal.
        try { child.kill(signal); } catch { /* Already exited. */ }
    }
}
