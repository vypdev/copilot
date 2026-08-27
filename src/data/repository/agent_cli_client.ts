import { spawn } from 'node:child_process';
import { parseAgentCommand } from './agent_command_parser';

export interface AgentCliRequest {
    command: string;
    prompt: string;
    timeoutMs: number;
    signal?: AbortSignal;
    cwd?: string;
    maxOutputBytes?: number;
}

const DEFAULT_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_STDERR_BYTES = 8 * 1024;

export class AgentCliError extends Error {
    constructor(
        message: string,
        readonly category: 'configuration' | 'timeout' | 'cancelled' | 'process' | 'output',
        readonly retryable = false,
    ) {
        super(message);
        this.name = 'AgentCliError';
    }
}

function splitCommand(command: string): string[] {
    const parsed = parseAgentCommand(command);
    return [parsed.executable, ...parsed.args];
}

export class AgentCliClient {
    async execute(request: AgentCliRequest): Promise<string> {
        let executable: string;
        let args: string[];
        try {
            [executable, ...args] = splitCommand(request.command);
        } catch (error: unknown) {
            throw new AgentCliError(error instanceof Error ? error.message : String(error), 'configuration');
        }
        return new Promise((resolve, reject) => {
            const child = spawn(executable, args, { cwd: request.cwd, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
            let stdout = '';
            let stderr = '';
            let outputBytes = 0;
            let settled = false;
            const maxOutputBytes = request.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
            const terminate = () => {
                if (child.exitCode !== null) return;
                child.kill('SIGTERM');
                setImmediate(() => {
                    if (child.exitCode === null) child.kill('SIGKILL');
                });
            };
            const timer = setTimeout(() => {
                terminate();
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
                terminate();
                finishReject(new AgentCliError('Agent CLI execution was cancelled.', 'cancelled'));
            };
            const appendStdout = (chunk: Buffer) => {
                outputBytes += chunk.byteLength;
                if (outputBytes > maxOutputBytes) {
                    terminate();
                    finishReject(new AgentCliError(`Agent CLI output exceeded the ${maxOutputBytes}-byte limit.`, 'output'));
                    return;
                }
                stdout += chunk.toString();
            };
            if (request.signal?.aborted) return abort();
            request.signal?.addEventListener('abort', abort, { once: true });
            child.stdout.on('data', appendStdout);
            child.stderr.on('data', (chunk: Buffer) => {
                if (stderr.length < MAX_STDERR_BYTES) stderr += chunk.toString().slice(0, MAX_STDERR_BYTES - stderr.length);
            });
            child.once('error', (error) => finishReject(new AgentCliError(`Unable to start agent CLI: ${error.message}`, 'process')));
            child.once('close', (code) => {
                if (code !== 0) {
                    const detail = stderr.trim() ? `: ${stderr.trim().slice(0, 1000)}` : '';
                    return finishReject(new AgentCliError(`Agent CLI exited with code ${code}${detail}`, 'process', code === 75));
                }
                const output = stdout.trim();
                if (!output) return finishReject(new AgentCliError('Agent CLI returned empty output.', 'output'));
                finishResolve(output);
            });
            child.stdin.end(request.prompt);
        });
    }
}
