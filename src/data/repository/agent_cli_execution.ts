import { spawn } from 'node:child_process';
import { AgentCliError, type AgentCliRequest } from './agent_cli_contracts';
import { enforceAgentExecutionPolicy } from './agent_execution_policy';
import { prepareAgentRuntimeEnvironment } from './agent_runtime_environment';
import { prepareAgentOutputSchema } from './agent_output_schema';

const MAX_STDERR_BYTES = 8 * 1024;

export interface PreparedAgentCliRequest extends AgentCliRequest {
    executable: string;
    args: string[];
    promptMode: 'stdin' | 'argv';
    maxOutputBytes: number;
    maxPromptBytes: number;
}

export function runAgentCli(request: PreparedAgentCliRequest): Promise<string> {
    return new Promise((resolve, reject) => {
        const outputSchema = prepareAgentOutputSchema(request.provider, request.outputSchema);
        let controlledArgs: string[];
        let runtime: ReturnType<typeof prepareAgentRuntimeEnvironment>;
        try {
            controlledArgs = enforceAgentExecutionPolicy(
                request.provider,
                request.capability,
                request.args,
                outputSchema.path,
            );
            runtime = prepareAgentRuntimeEnvironment(
                request.provider,
                request.capability,
                request.environment,
                request.modelProvider,
            );
        } catch (error) {
            outputSchema.cleanup();
            reject(error);
            return;
        }
        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            runtime.cleanup();
            outputSchema.cleanup();
        };
        const child = (() => {
            try {
                return spawn(request.executable, request.promptMode === 'argv' ? [...controlledArgs, request.prompt] : controlledArgs, {
                    cwd: request.cwd,
                    env: runtime.environment,
                    stdio: ['pipe', 'pipe', 'pipe'],
                    shell: false,
                    detached: process.platform !== 'win32',
                });
            } catch (error: unknown) {
                cleanup();
                reject(new AgentCliError(`Unable to start agent CLI: ${error instanceof Error ? error.message : String(error)}`, 'process'));
                return undefined;
            }
        })();
        if (!child) return;
        const lifecycle = createProcessLifecycle(
            child,
            request,
            (value) => { cleanup(); resolve(value); },
            (error) => { cleanup(); reject(error); },
        );
        child.stdout.on('data', lifecycle.appendStdout);
        child.stderr.on('data', lifecycle.appendStderr);
        child.stdin.once('error', lifecycle.onStdinError);
        child.once('error', lifecycle.onError);
        child.once('close', lifecycle.onClose);
        if (request.signal?.aborted) return lifecycle.abort();
        request.signal?.addEventListener('abort', lifecycle.abort, { once: true });
        child.stdin.end(request.promptMode === 'stdin' ? request.prompt : undefined);
    });
}

function createProcessLifecycle(
    child: ReturnType<typeof spawn>,
    request: PreparedAgentCliRequest,
    resolve: (value: string) => void,
    reject: (error: Error) => void,
) {
    let stdout = '';
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
        request.signal?.removeEventListener('abort', abort);
        resolve(value);
    };
    const finishReject = (error: Error) => {
        if (settled) return;
        settled = true;
        if (timers.timeout) clearTimeout(timers.timeout);
        if (timers.force) clearTimeout(timers.force);
        request.signal?.removeEventListener('abort', abort);
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
        if (outputBytes > request.maxOutputBytes) {
            beginTermination(new AgentCliError(`Agent CLI output exceeded the ${request.maxOutputBytes}-byte limit.`, 'output'));
            return;
        }
        stdout += chunk.toString();
    };
    const appendStderr = (chunk: Buffer) => {
        if (settled || terminationError) return;
        stderrBytes = Math.min(stderrBytes + chunk.byteLength, MAX_STDERR_BYTES);
    };
    const onStdinError = () => beginTermination(new AgentCliError('Unable to send the prompt to the agent CLI.', 'process'));
    const onError = (error: Error) => finishReject(new AgentCliError(`Unable to start agent CLI: ${error.message}`, 'process'));
    const onClose = (code: number | null) => {
        if (terminationError) {
            finishReject(terminationError);
            return;
        }
        if (code !== 0) {
            const diagnostic = stderrBytes > 0 ? ' Diagnostic output was suppressed for safety.' : '';
            finishReject(new AgentCliError(`Agent CLI exited with code ${code}.${diagnostic}`, 'process', code === 75));
            return;
        }
        const output = stdout.trim();
        if (!output) {
            finishReject(new AgentCliError('Agent CLI returned empty output.', 'output'));
            return;
        }
        finishResolve(output);
    };
    timers.timeout = setTimeout(() => {
        beginTermination(new AgentCliError(`Agent CLI timed out after ${request.timeoutMs}ms.`, 'timeout'));
    }, request.timeoutMs);
    return { appendStdout, appendStderr, onStdinError, onError, onClose, abort };
}

function signalProcessTree(child: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
    try {
        if (process.platform !== 'win32' && child.pid) {
            process.kill(-child.pid, signal);
        } else {
            child.kill(signal);
        }
    } catch {
        // The process may have exited between the lifecycle check and signal.
    }
}
