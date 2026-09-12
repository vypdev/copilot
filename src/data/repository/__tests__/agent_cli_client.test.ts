import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentExecutionObserverPort } from '../../../application/ports/agent_execution_observation_ports';
import type { AgentExecutionPlan } from '../../../domain/agent_execution_plan';
import { AgentCliClient } from '../agent_cli_client';
import { AgentCliError } from '../agent_cli_contracts';
import { createAgentProcessLifecycle, decodeAgentCliOutput } from '../agent_cli_execution';

function plan(script: string, overrides: Partial<AgentExecutionPlan> = {}): AgentExecutionPlan {
    const runtimeDirectory = mkdtempSync(join(tmpdir(), 'copilot-agent-runtime-'));
    const artifactPath = join(runtimeDirectory, 'gitconfig');
    writeFileSync(artifactPath, '', { mode: 0o600 });
    return {
        provider: 'codex', capability: 'findings', executable: process.execPath,
        argv: ['-e', script], promptMode: 'final-argv', outputProtocol: 'plain-text', workspace: process.cwd(),
        workspaceMode: 'read-only', childNetwork: 'deny', approval: 'never',
        sessionPersistence: false, output: 'text', timeoutMs: 5_000,
        maxPromptBytes: 512 * 1024, maxOutputBytes: 4 * 1024 * 1024,
        environment: { PATH: process.env.PATH || '' }, runtimeDirectory,
        artifacts: [{ path: artifactPath, sha256: createHash('sha256').update('').digest('hex'), purpose: 'git-config' }],
        runtimeContract: { provider: 'codex', version: 'codex-cli 0.153.4', manifestRevision: 'test' },
        ...overrides,
    };
}

function client(executionPlan: AgentExecutionPlan, observer?: AgentExecutionObserverPort): AgentCliClient {
    return new AgentCliClient({ prepare: () => executionPlan }, observer);
}

describe('AgentCliClient admitted process execution', () => {
    it('passes final-argv prompts literally without shell evaluation', async () => {
        const executionPlan = plan('process.stdout.write(process.argv[1])');
        await expect(client(executionPlan).execute({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings',
            prompt: '$(touch should-not-run); literal', timeoutMs: 5_000,
        })).resolves.toBe('$(touch should-not-run); literal');
        expect(existsSync(executionPlan.runtimeDirectory)).toBe(false);
    });

    it('emits bounded admission and completion observations without request content', async () => {
        const observe = jest.fn();
        const executionPlan = plan('process.stdout.write("READY")');
        await expect(client(executionPlan, { observe }).execute({
            configuration: { provider: 'codex', model: 'secret-model' }, capability: 'findings',
            prompt: 'secret prompt', timeoutMs: 5_000, environment: { OPENAI_API_KEY: 'secret-key' },
        })).resolves.toBe('READY');

        expect(observe).toHaveBeenNthCalledWith(1, {
            state: 'started', phase: 'plan', provider: 'codex', capability: 'findings',
        });
        expect(observe).toHaveBeenNthCalledWith(2, expect.objectContaining({
            state: 'admitted', phase: 'preflight', manifestRevision: 'test',
            version: 'codex-cli 0.153.4', workspaceMode: 'read-only', outputContract: 'text',
            artifactHashes: [executionPlan.artifacts[0].sha256],
        }));
        expect(observe).toHaveBeenNthCalledWith(3, expect.objectContaining({
            state: 'completed', phase: 'run', outputBytes: 5,
        }));
        expect(JSON.stringify(observe.mock.calls)).not.toMatch(/secret prompt|secret-model|secret-key|OPENAI_API_KEY/);
    });

    it('emits semantic preflight and run failures and ignores observer failures', async () => {
        const observe = jest.fn();
        const request = {
            configuration: { provider: 'codex' as const, model: 'model' }, capability: 'findings' as const,
            prompt: 'p', timeoutMs: 5_000,
        };
        const planningFailure = new AgentCliClient({
            prepare: () => { throw new AgentCliError('rejected', 'configuration'); },
        }, { observe });
        await expect(planningFailure.execute(request)).rejects.toMatchObject({ category: 'configuration' });
        expect(observe).toHaveBeenLastCalledWith(expect.objectContaining({
            state: 'failed', phase: 'preflight', failureCategory: 'configuration',
            semanticCode: 'agent.policy-rejected', retryable: false,
        }));

        await expect(client(plan('process.exit(75)'), { observe }).execute(request))
            .rejects.toMatchObject({ category: 'process', retryable: true });
        expect(observe).toHaveBeenLastCalledWith(expect.objectContaining({
            state: 'failed', phase: 'run', failureCategory: 'process',
            semanticCode: 'agent.failed', retryable: true,
        }));

        const throwingObserver = { observe: () => { throw new Error('telemetry unavailable'); } };
        await expect(client(plan('process.stdout.write("READY")'), throwingObserver).execute(request)).resolves.toBe('READY');
    });

    it('supports the admitted stdin prompt protocol', async () => {
        const executionPlan = plan('process.stdin.pipe(process.stdout)', { promptMode: 'stdin' });
        await expect(client(executionPlan).execute({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings',
            prompt: 'stdin prompt', timeoutMs: 5_000,
        })).resolves.toBe('stdin prompt');
    });

    it('decodes bounded JSON-line text events without exposing transport metadata', async () => {
        const script = 'process.stdout.write(JSON.stringify({type:"step_start"})+"\\n"+JSON.stringify({type:"text",part:{type:"text",text:"READY"}})+"\\n")';
        const executionPlan = plan(script, { outputProtocol: 'json-lines-text-events' });
        await expect(client(executionPlan).execute({
            configuration: { provider: 'opencode', model: 'model' }, capability: 'findings',
            prompt: 'p', timeoutMs: 5_000,
        })).resolves.toBe('READY');
    });

    it('rejects malformed or textless JSON-line output', async () => {
        await expect(client(plan('process.stdout.write("not-json")', {
            outputProtocol: 'json-lines-text-events',
        })).execute({
            configuration: { provider: 'opencode', model: 'model' }, capability: 'findings',
            prompt: 'p', timeoutMs: 5_000,
        })).rejects.toMatchObject({ category: 'output' });
        await expect(client(plan('process.stdout.write(JSON.stringify({type:"step_start"}))', {
            outputProtocol: 'json-lines-text-events',
        })).execute({
            configuration: { provider: 'opencode', model: 'model' }, capability: 'findings',
            prompt: 'p', timeoutMs: 5_000,
        })).rejects.toMatchObject({ category: 'output' });
    });

    it('rejects invalid JSON event values and unsupported admitted protocols', () => {
        for (const value of ['null', '[]', '"text"']) {
            expect(() => decodeAgentCliOutput('json-lines-text-events', value)).toThrow('invalid JSON event');
        }
        expect(() => decodeAgentCliOutput(
            'json-lines-text-events',
            JSON.stringify({ type: 'text', part: { type: 'text', text: 42 } }),
        )).toThrow('no text completion events');
        expect(() => decodeAgentCliOutput('unsupported' as never, 'output')).toThrow('Unsupported agent output protocol');
    });

    it('maps timeout and cancellation to semantic failures', async () => {
        await expect(client(plan('setTimeout(() => {}, 5000)', { timeoutMs: 20 })).execute({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'p', timeoutMs: 20,
        })).rejects.toMatchObject({ category: 'timeout' });

        const controller = new AbortController();
        const pending = client(plan('setTimeout(() => {}, 5000)')).execute({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings',
            prompt: 'p', timeoutMs: 5_000, signal: controller.signal,
        });
        controller.abort();
        await expect(pending).rejects.toMatchObject({ category: 'cancelled' });
    });

    it('rejects nonzero, empty, and oversized process output', async () => {
        await expect(client(plan('process.exit(2)')).execute({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'p', timeoutMs: 5_000,
        })).rejects.toMatchObject({ category: 'process' });
        await expect(client(plan('process.stdout.write("   ")')).execute({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'p', timeoutMs: 5_000,
        })).rejects.toMatchObject({ category: 'output' });
        await expect(client(plan('process.stderr.write("large")', { maxOutputBytes: 4 })).execute({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'p', timeoutMs: 5_000,
        })).rejects.toMatchObject({ category: 'output' });
        await expect(client(plan('process.stdout.write("large")', { maxOutputBytes: 4 })).execute({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'p', timeoutMs: 5_000,
        })).rejects.toMatchObject({ category: 'output' });
    });

    it('suppresses stderr and marks only the designated provider exit as retryable', async () => {
        const request = {
            configuration: { provider: 'codex' as const, model: 'model' }, capability: 'findings' as const,
            prompt: 'p', timeoutMs: 5_000,
        };
        await expect(client(plan('process.stderr.write("secret diagnostic"); process.exit(2)')).execute(request))
            .rejects.toMatchObject({ category: 'process', retryable: false, message: expect.not.stringContaining('secret diagnostic') });
        await expect(client(plan('process.exit(75)')).execute(request))
            .rejects.toMatchObject({ category: 'process', retryable: true });
    });

    it('rejects process start failures without exposing raw configuration', async () => {
        await expect(client(plan('unused', { executable: '/missing/copilot-agent' })).execute({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'secret', timeoutMs: 5_000,
        })).rejects.toMatchObject({ category: 'process' });
        await expect(client(plan('unused', { executable: null as never })).execute({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'secret', timeoutMs: 5_000,
        })).rejects.toMatchObject({ category: 'process' });
    });

    it('rejects a prompt beyond the admitted byte limit before spawn', async () => {
        await expect(client(plan('process.stdout.write("unexpected")', { maxPromptBytes: 1 })).execute({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'too long', timeoutMs: 5_000,
        })).rejects.toMatchObject({ category: 'configuration' });
    });

    it('honors a signal that is already aborted when execution starts', async () => {
        const controller = new AbortController();
        controller.abort();
        await expect(client(plan('setTimeout(() => {}, 5000)')).execute({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings',
            prompt: 'p', timeoutMs: 5_000, signal: controller.signal,
        })).rejects.toMatchObject({ category: 'cancelled' });
    });

    it('keeps lifecycle settlement idempotent under late process events', () => {
        jest.useFakeTimers();
        const executionPlan = plan('unused');
        const kill = jest.fn();
        const child = { exitCode: null, pid: undefined, kill } as never;
        const resolve = jest.fn();
        const reject = jest.fn();
        try {
            const lifecycle = createAgentProcessLifecycle(child, executionPlan, undefined, resolve, reject);
            lifecycle.abort();
            lifecycle.abort();
            lifecycle.appendStdout(Buffer.from('late stdout'));
            lifecycle.appendStderr(Buffer.from('late stderr'));
            jest.advanceTimersByTime(5_000);
            expect(kill).toHaveBeenNthCalledWith(1, 'SIGTERM');
            expect(kill).toHaveBeenNthCalledWith(2, 'SIGKILL');
            lifecycle.onClose(null);
            lifecycle.onClose(null);
            expect(reject).toHaveBeenCalledTimes(1);

            const resolved = createAgentProcessLifecycle(child, executionPlan, undefined, resolve, reject);
            resolved.appendStdout(Buffer.from('READY'));
            resolved.onClose(0);
            resolved.onClose(0);
            expect(resolve).toHaveBeenCalledTimes(1);

            const stdinFailure = createAgentProcessLifecycle(child, executionPlan, undefined, resolve, reject);
            stdinFailure.onStdinError();
            stdinFailure.onClose(null);
            expect(reject).toHaveBeenCalledTimes(2);
        } finally {
            rmSync(executionPlan.runtimeDirectory, { recursive: true, force: true });
            jest.useRealTimers();
        }
    });

    it('fails closed when an admitted artifact changes before spawn', async () => {
        const executionPlan = plan('process.stdout.write("unexpected")');
        writeFileSync(executionPlan.artifacts[0].path, 'tampered');
        chmodSync(executionPlan.artifacts[0].path, 0o600);
        await expect(client(executionPlan).execute({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'p', timeoutMs: 5_000,
        })).rejects.toMatchObject({ category: 'configuration' });
    });

    it('never deletes an unverified runtime directory supplied by a malformed plan', async () => {
        const unsafeDirectory = mkdtempSync(join(tmpdir(), 'copilot-agent-unsafe-'));
        const artifactPath = join(unsafeDirectory, 'artifact');
        writeFileSync(artifactPath, 'safe', { mode: 0o600 });
        const admittedPlan = plan('process.stdout.write("unexpected")');
        try {
            await expect(client({
                ...admittedPlan,
                runtimeDirectory: unsafeDirectory,
                artifacts: [{
                    path: artifactPath,
                    sha256: createHash('sha256').update('safe').digest('hex'),
                    purpose: 'provider-config',
                }],
            }).execute({
                configuration: { provider: 'codex', model: 'model' }, capability: 'findings',
                prompt: 'p', timeoutMs: 5_000,
            })).rejects.toMatchObject({ category: 'configuration' });
            expect(existsSync(unsafeDirectory)).toBe(true);
            expect(existsSync(artifactPath)).toBe(true);
        } finally {
            rmSync(admittedPlan.runtimeDirectory, { recursive: true, force: true });
            rmSync(unsafeDirectory, { recursive: true, force: true });
        }
    });

    it('rejects escaped, non-file, and permission-broadened artifacts', async () => {
        const outsideDirectory = mkdtempSync(join(tmpdir(), 'copilot-agent-outside-artifact-'));
        const outsidePath = join(outsideDirectory, 'artifact');
        writeFileSync(outsidePath, 'outside', { mode: 0o600 });
        try {
            await expect(client(plan('process.stdout.write("unexpected")', {
                artifacts: [{ path: outsidePath, sha256: createHash('sha256').update('outside').digest('hex'), purpose: 'git-config' }],
            })).execute({
                configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'p', timeoutMs: 5_000,
            })).rejects.toMatchObject({ category: 'configuration' });

            const directoryPlan = plan('process.stdout.write("unexpected")');
            const artifactDirectory = join(directoryPlan.runtimeDirectory, 'directory-artifact');
            mkdirSync(artifactDirectory);
            await expect(client({ ...directoryPlan, artifacts: [{
                path: artifactDirectory, sha256: createHash('sha256').update('').digest('hex'), purpose: 'git-config',
            }] }).execute({
                configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'p', timeoutMs: 5_000,
            })).rejects.toMatchObject({ category: 'configuration' });

            const permissionPlan = plan('process.stdout.write("unexpected")');
            chmodSync(permissionPlan.artifacts[0].path, 0o644);
            await expect(client(permissionPlan).execute({
                configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'p', timeoutMs: 5_000,
            })).rejects.toMatchObject({ category: 'configuration' });
        } finally {
            rmSync(outsideDirectory, { recursive: true, force: true });
        }
    });
});
