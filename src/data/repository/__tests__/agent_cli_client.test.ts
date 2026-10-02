import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, sep } from 'node:path';
import type { AgentExecutionObserverPort } from '../../../application/ports/agent_execution_observation_ports';
import type { AgentExecutionPlan } from '../../../domain/agent_execution_plan';
import { AgentCliClient } from '../agent_cli_client';
import { AgentCliError } from '../agent_cli_contracts';
import { createAgentProcessLifecycle, decodeAgentCliOutput, verifyWindowsLauncherTrust } from '../agent_cli_execution';
import { makeWindowsRuntimePathPrivate } from '../../../infrastructure/agents/windows_runtime_acl';

// Multi-case fixtures run native ACL tools for every plan on Windows. This Jest
// budget includes that setup; each admitted child keeps its own 5-second limit.
const MULTI_CASE_TEST_TIMEOUT_MS = process.platform === 'win32' ? 30_000 : 20_000;

function plan(script: string, overrides: Partial<AgentExecutionPlan> = {}): AgentExecutionPlan {
    const runtimeDirectory = mkdtempSync(join(tmpdir(), 'copilot-agent-runtime-'));
    makeWindowsRuntimePathPrivate(runtimeDirectory, true);
    const artifactPath = join(runtimeDirectory, 'gitconfig');
    writeFileSync(artifactPath, '', { mode: 0o600 });
    makeWindowsRuntimePathPrivate(artifactPath, false);
    return {
        provider: 'codex', capability: 'findings', executable: process.execPath,
        argv: ['-e', script], promptMode: 'final-argv', outputProtocol: 'plain-text', workspace: process.cwd(),
        workspaceMode: 'read-only', childNetwork: 'deny', approval: 'never',
        sessionPersistence: false, output: 'text', timeoutMs: 5_000,
        maxPromptBytes: 512 * 1024, maxOutputBytes: 4 * 1024 * 1024,
        environment: {
            PATH: process.env.PATH || '',
            ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot || 'C:\\Windows' } : {}),
        }, runtimeDirectory,
        artifacts: [{ path: artifactPath, sha256: createHash('sha256').update('').digest('hex'), purpose: 'git-config' }],
        runtimeContract: { provider: 'codex', version: 'codex-cli 0.156.1', manifestRevision: 'test' },
        ...overrides,
    };
}

function client(executionPlan: AgentExecutionPlan, observer?: AgentExecutionObserverPort): AgentCliClient {
    return new AgentCliClient({ prepare: () => executionPlan }, observer);
}

describe('AgentCliClient admitted process execution', () => {
    it('rechecks a canonical Windows interpreter and package entrypoint before spawn', () => {
        const directory = mkdtempSync(join(tmpdir(), 'copilot-launcher-trust-'));
        const executable = join(directory, 'node.exe');
        const alias = join(directory, 'alias.exe');
        const launcher = join(directory, 'codex.js');
        writeFileSync(executable, 'fixture');
        writeFileSync(launcher, 'fixture');
        const validate = jest.fn();
        try {
            verifyWindowsLauncherTrust(realpathSync(executable), launcher, validate);
            expect(validate.mock.calls).toEqual([[realpathSync(executable)], [launcher]]);
            if (process.platform !== 'win32') {
                symlinkSync(executable, alias);
                expect(() => verifyWindowsLauncherTrust(alias, launcher, validate)).toThrow('interpreter changed');
            } else {
                const changed = `${directory}${sep}..${sep}${basename(directory)}${sep}node.exe`;
                expect(() => verifyWindowsLauncherTrust(changed, launcher, validate)).toThrow('interpreter changed');
            }
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });

    (process.platform === 'win32' ? it.skip : it)('rejects a runtime directory owned by a different user', async () => {
        const executionPlan = plan('process.stdout.write("unexpected")');
        if (typeof process.getuid !== 'function') return;
        const current = process.getuid();
        const spy = jest.spyOn(process, 'getuid').mockReturnValue(current + 1);
        try {
            await expect(client(executionPlan).execute({
                configuration: { provider: 'codex', model: 'model' }, capability: 'findings',
                prompt: 'fixture', timeoutMs: 5_000,
            })).rejects.toMatchObject({ category: 'configuration' });
        } finally {
            spy.mockRestore();
            rmSync(executionPlan.runtimeDirectory, { recursive: true, force: true });
        }
    });

    it('passes final-argv prompts literally without shell evaluation', async () => {
        const executionPlan = plan('process.stdout.write(process.argv[1])');
        await expect(client(executionPlan).execute({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings',
            prompt: '$(touch should-not-run); literal', timeoutMs: 5_000,
        })).resolves.toBe('$(touch should-not-run); literal');
        expect(existsSync(executionPlan.runtimeDirectory)).toBe(false);
    });

    it('executes a verified Node package launcher and rejects a changed launcher', async () => {
        const packageDirectory = mkdtempSync(join(tmpdir(), 'copilot-agent-package-'));
        const launcher = join(packageDirectory, 'codex.js');
        const source = 'process.stdout.write(process.argv[3])';
        writeFileSync(launcher, source);
        const executable = process.platform === 'win32' ? join(packageDirectory, 'node.exe') : process.execPath;
        if (process.platform === 'win32') {
            copyFileSync(process.execPath, executable);
            makeWindowsRuntimePathPrivate(executable, false);
            makeWindowsRuntimePathPrivate(launcher, false);
        }
        const canonicalLauncher = realpathSync(launcher);
        try {
            const executionPlan = plan('unused', {
                executable: process.platform === 'win32' ? realpathSync(executable) : process.execPath,
                launcherArgv: [canonicalLauncher],
                launcherSha256: createHash('sha256').update(source).digest('hex'),
                argv: ['exec'],
            });
            await expect(client(executionPlan).execute({
                configuration: { provider: 'codex', model: 'model' }, capability: 'findings',
                prompt: 'literal & $(ignored) "quoted"', timeoutMs: 5_000,
            })).resolves.toBe('literal & $(ignored) "quoted"');

            const changedPlan = plan('unused', {
                executable: process.platform === 'win32' ? realpathSync(executable) : process.execPath,
                launcherArgv: [canonicalLauncher],
                launcherSha256: createHash('sha256').update(source).digest('hex'),
            });
            writeFileSync(launcher, 'process.stdout.write("tampered")');
            await expect(client(changedPlan).execute({
                configuration: { provider: 'codex', model: 'model' }, capability: 'findings',
                prompt: 'secret', timeoutMs: 5_000,
            })).rejects.toMatchObject({ category: 'configuration' });
            expect(existsSync(changedPlan.runtimeDirectory)).toBe(false);
        } finally {
            rmSync(packageDirectory, { recursive: true, force: true });
        }
    }, MULTI_CASE_TEST_TIMEOUT_MS);

    it.each([
        { name: 'extra launcher arguments', launcherArgv: ['/fixture/a.js', '/fixture/b.js'], launcherSha256: 'hash' },
        { name: 'relative launcher', launcherArgv: ['a.js'], launcherSha256: 'hash' },
        { name: 'missing launcher hash', launcherArgv: ['/fixture/a.js'] },
        { name: 'hash without a launcher', launcherSha256: 'hash' },
    ])('rejects $name before a process starts', async (override) => {
        const executionPlan = plan('process.stdout.write("unexpected")', override);
        await expect(client(executionPlan).execute({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings',
            prompt: 'secret', timeoutMs: 5_000,
        })).rejects.toMatchObject({ category: 'configuration' });
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
            version: 'codex-cli 0.156.1', workspaceMode: 'read-only', outputContract: 'text',
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
            semanticCode: 'agent.failed', retryable: true, exitCode: 75,
        }));

        const throwingObserver = { observe: () => { throw new Error('telemetry unavailable'); } };
        await expect(client(plan('process.stdout.write("READY")'), throwingObserver).execute(request)).resolves.toBe('READY');
    }, MULTI_CASE_TEST_TIMEOUT_MS);

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
    }, MULTI_CASE_TEST_TIMEOUT_MS);

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
    }, MULTI_CASE_TEST_TIMEOUT_MS);

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
    }, MULTI_CASE_TEST_TIMEOUT_MS);

    it('suppresses stderr and marks only the designated provider exit as retryable', async () => {
        const request = {
            configuration: { provider: 'codex' as const, model: 'model' }, capability: 'findings' as const,
            prompt: 'p', timeoutMs: 5_000,
        };
        await expect(client(plan('process.stderr.write("secret diagnostic"); process.exit(2)')).execute(request))
            .rejects.toMatchObject({ category: 'process', retryable: false, exitCode: 2, message: expect.not.stringContaining('secret diagnostic') });
        await expect(client(plan('process.exit(75)')).execute(request))
            .rejects.toMatchObject({ category: 'process', retryable: true });
    }, MULTI_CASE_TEST_TIMEOUT_MS);

    it('rejects process start failures without exposing raw configuration', async () => {
        await expect(client(plan('unused', { executable: process.platform === 'win32'
            ? 'C:\\missing\\copilot-agent.exe' : '/missing/copilot-agent' })).execute({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'secret', timeoutMs: 5_000,
        })).rejects.toMatchObject({ category: 'process' });
        await expect(client(plan('unused', { executable: null as never })).execute({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'secret', timeoutMs: 5_000,
        })).rejects.toMatchObject({ category: process.platform === 'win32' ? 'configuration' : 'process' });
    }, MULTI_CASE_TEST_TIMEOUT_MS);

    (process.platform === 'win32' ? it : it.skip)('rejects a Windows command wrapper before spawn', async () => {
        const executionPlan = plan('unused', { executable: join(tmpdir(), 'agent.cmd') });
        await expect(client(executionPlan).execute({
            configuration: { provider: 'codex', model: 'model' }, capability: 'findings',
            prompt: 'fixture', timeoutMs: 5_000,
        })).rejects.toMatchObject({ category: 'configuration' });
        expect(existsSync(executionPlan.runtimeDirectory)).toBe(false);
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
            resolved.abort();
            expect(resolve).toHaveBeenCalledTimes(1);

            const exitedChild = { exitCode: 0, pid: undefined, kill: jest.fn() } as never;
            const exited = createAgentProcessLifecycle(exitedChild, executionPlan, undefined, resolve, reject);
            exited.abort();
            jest.advanceTimersByTime(5_000);
            expect((exitedChild as { kill: jest.Mock }).kill).toHaveBeenCalledTimes(1);
            exited.onClose(0);

            const stdinFailure = createAgentProcessLifecycle(child, executionPlan, undefined, resolve, reject);
            stdinFailure.onStdinError();
            stdinFailure.onClose(null);
            expect(reject).toHaveBeenCalledTimes(3);
        } finally {
            rmSync(executionPlan.runtimeDirectory, { recursive: true, force: true });
            jest.useRealTimers();
        }
    });

    it('handles a signal-only child exit and a process termination race without stderr', () => {
        jest.useFakeTimers();
        const executionPlan = plan('unused');
        const child = { exitCode: null, pid: undefined, kill: jest.fn(() => { throw new Error('already exited'); }) } as never;
        const reject = jest.fn();
        try {
            const aborted = createAgentProcessLifecycle(child, executionPlan, undefined, jest.fn(), reject);
            aborted.abort();
            expect((child as { kill: jest.Mock }).kill).toHaveBeenCalledTimes(2);
            aborted.onClose(null);
            expect(reject).toHaveBeenCalledWith(expect.objectContaining({ category: 'cancelled' }));

            const signalOnly = createAgentProcessLifecycle(child, executionPlan, undefined, jest.fn(), reject);
            signalOnly.onClose(null);
            expect(reject).toHaveBeenLastCalledWith(expect.objectContaining({
                category: 'process', exitCode: undefined, retryable: false,
            }));
        } finally {
            rmSync(executionPlan.runtimeDirectory, { recursive: true, force: true });
            jest.useRealTimers();
        }
    });

    it('maps an unexpected decoder failure to a bounded output error', () => {
        const executionPlan = plan('unused');
        const malformedPlan = Object.defineProperty({ ...executionPlan }, 'outputProtocol', {
            get: () => { throw new Error('unsafe decoder detail'); },
        }) as AgentExecutionPlan;
        const reject = jest.fn();
        try {
            const lifecycle = createAgentProcessLifecycle({ exitCode: 0 } as never, malformedPlan,
                undefined, jest.fn(), reject);
            lifecycle.onClose(0);
            expect(reject).toHaveBeenCalledWith(expect.objectContaining({
                category: 'output', message: expect.not.stringContaining('unsafe decoder detail'),
            }));
        } finally {
            rmSync(executionPlan.runtimeDirectory, { recursive: true, force: true });
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

    it('rejects a runtime path that has the managed name but is a file', async () => {
        const file = mkdtempSync(join(tmpdir(), 'copilot-agent-runtime-'));
        rmSync(file, { recursive: true, force: true });
        writeFileSync(file, 'fixture');
        const admittedPlan = plan('process.stdout.write("unexpected")');
        try {
            await expect(client({ ...admittedPlan, runtimeDirectory: file }).execute({
                configuration: { provider: 'codex', model: 'model' }, capability: 'findings',
                prompt: 'p', timeoutMs: 5_000,
            })).rejects.toMatchObject({ category: 'configuration' });
            expect(existsSync(file)).toBe(true);
        } finally {
            rmSync(file, { force: true });
            rmSync(admittedPlan.runtimeDirectory, { recursive: true, force: true });
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
            if (process.platform === 'win32') {
                execFileSync('icacls.exe', [permissionPlan.artifacts[0].path, '/grant', '*S-1-1-0:R'], { stdio: 'ignore' });
            } else {
                chmodSync(permissionPlan.artifacts[0].path, 0o644);
            }
            await expect(client(permissionPlan).execute({
                configuration: { provider: 'codex', model: 'model' }, capability: 'findings', prompt: 'p', timeoutMs: 5_000,
            })).rejects.toMatchObject({ category: 'configuration' });
        } finally {
            rmSync(outsideDirectory, { recursive: true, force: true });
        }
    }, MULTI_CASE_TEST_TIMEOUT_MS);
});
