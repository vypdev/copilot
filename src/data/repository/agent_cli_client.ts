import { spawn } from 'node:child_process';
import { parseAgentCommand } from './agent_command_parser';
import { buildAgentCliEnvironment } from './agent_authentication';
import type { AgentProvider } from '../model/agent';

export interface AgentCliRequest {
    command: string;
    prompt: string;
    provider?: AgentProvider;
    modelProvider?: string;
    environment?: NodeJS.ProcessEnv;
    promptMode?: 'stdin' | 'argv';
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
        if (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0) {
            throw new AgentCliError('Agent CLI timeout must be a finite positive number.', 'configuration');
        }
        if (request.maxOutputBytes !== undefined && (!Number.isFinite(request.maxOutputBytes) || request.maxOutputBytes <= 0)) {
            throw new AgentCliError('Agent CLI maxOutputBytes must be a finite positive number.', 'configuration');
        }
        let executable: string;
        let args: string[];
        try {
            [executable, ...args] = splitCommand(request.command);
        } catch (error: unknown) {
            throw new AgentCliError(error instanceof Error ? error.message : String(error), 'configuration');
        }
        return new Promise((resolve, reject) => {
            const promptMode = request.promptMode ?? 'stdin';
            if (promptMode !== 'stdin' && promptMode !== 'argv') {
                throw new AgentCliError('Agent CLI promptMode must be stdin or argv.', 'configuration');
            }
            const child = spawn(
                executable,
                promptMode === 'argv' ? [...args, request.prompt] : args,
                {
                    cwd: request.cwd,
                    env: buildAgentCliEnvironment(request.provider, request.environment, request.modelProvider),
                    stdio: ['pipe', 'pipe', 'pipe'],
                    shell: false,
                },
            );
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
            child.stdin.end(promptMode === 'stdin' ? request.prompt : undefined);
        });
    }
}
