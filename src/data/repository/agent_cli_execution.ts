import { spawn } from 'node:child_process';
import { buildAgentCliEnvironment } from './agent_authentication';
import { AgentCliError, type AgentCliRequest } from './agent_cli_contracts';

const MAX_STDERR_BYTES = 8 * 1024;

export interface PreparedAgentCliRequest extends AgentCliRequest {
    executable: string;
    args: string[];
    promptMode: 'stdin' | 'argv';
    maxOutputBytes: number;
}

export function runAgentCli(request: PreparedAgentCliRequest): Promise<string> {
    return new Promise((resolve, reject) => {
        const child = spawn(request.executable, request.promptMode === 'argv' ? [...request.args, request.prompt] : request.args, {
            cwd: request.cwd,
            env: buildAgentCliEnvironment(request.provider, request.environment, request.modelProvider),
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: false,
        });
        const lifecycle = createProcessLifecycle(child, request, resolve, reject);
        child.stdout.on('data', lifecycle.appendStdout);
        child.stderr.on('data', lifecycle.appendStderr);
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
    let stderr = '';
    let outputBytes = 0;
    let settled = false;
    const timer = setTimeout(() => {
        terminate(child);
        finishReject(new AgentCliError(`Agent CLI timed out after ${request.timeoutMs}ms.`, 'timeout'));
    }, request.timeoutMs);

    const finishResolve = (value: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', abort);
        resolve(value);
    };
    const finishReject = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', abort);
        reject(error);
    };
    const abort = () => {
        terminate(child);
        finishReject(new AgentCliError('Agent CLI execution was cancelled.', 'cancelled'));
    };
    const appendStdout = (chunk: Buffer) => {
        outputBytes += chunk.byteLength;
        if (outputBytes > request.maxOutputBytes) {
            terminate(child);
            finishReject(new AgentCliError(`Agent CLI output exceeded the ${request.maxOutputBytes}-byte limit.`, 'output'));
            return;
        }
        stdout += chunk.toString();
    };
    const appendStderr = (chunk: Buffer) => {
        if (stderr.length < MAX_STDERR_BYTES) stderr += chunk.toString().slice(0, MAX_STDERR_BYTES - stderr.length);
    };
    const onError = (error: Error) => finishReject(new AgentCliError(`Unable to start agent CLI: ${error.message}`, 'process'));
    const onClose = (code: number | null) => {
        if (code !== 0) {
            const detail = stderr.trim() ? `: ${stderr.trim().slice(0, 1000)}` : '';
            finishReject(new AgentCliError(`Agent CLI exited with code ${code}${detail}`, 'process', code === 75));
            return;
        }
        const output = stdout.trim();
        if (!output) {
            finishReject(new AgentCliError('Agent CLI returned empty output.', 'output'));
            return;
        }
        finishResolve(output);
    };
    return { appendStdout, appendStderr, onError, onClose, abort };
}

function terminate(child: ReturnType<typeof spawn>): void {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    setImmediate(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
    });
}
