import fs from 'node:fs';
import cp from 'node:child_process';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import * as core from '@actions/core';
import * as protocol from '../native_verification_protocol';
import { awaitNativeBoundary, cleanupNativeVerification, continueNativeVerification, drainNativeWorkerLog, runNativeVerificationEntry } from '../native_verification_controller';
import { stageNativeVerificationAction } from '../native_verification_staging';
import { nativeVerificationFixture } from './native_verification_fixture';

jest.mock('@actions/core', () => ({ setOutput: jest.fn(), saveState: jest.fn(), getState: jest.fn(() => ''), getInput: jest.fn(() => 'true'), setFailed: jest.fn(), setSecret: jest.fn() }));

describe('native Actions phase controller', () => {
    let f: ReturnType<typeof nativeVerificationFixture>; let before: NodeJS.ProcessEnv;
    const roots: string[] = [];
    const done = (exitCode = 0) => protocol.writeNativeRecord(f.session, 'done.json', { exitCode });
    const request = (edit: Record<string, unknown> = {}) => protocol.writeNativeRecord(f.session, 'request.json', {
        id: f.id, sourceSha: 'a'.repeat(40), digest: 'b'.repeat(64), environment: f.runtime.environment, ...edit,
    });
    beforeEach(() => { before = { ...process.env }; f = nativeVerificationFixture(); jest.clearAllMocks(); jest.mocked(core.getState).mockReturnValue(''); jest.mocked(core.getInput).mockReturnValue('true'); });
    afterEach(async () => {
        jest.restoreAllMocks();
        for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
        f.cleanup(); process.env = before;
    });
    it('emits a pending request with only the closed runtime outputs', async () => {
        request(); await awaitNativeBoundary(f.session);
        expect(core.setOutput).toHaveBeenCalledWith('verification-setup-pending', 'true');
        expect(core.setOutput).toHaveBeenCalledWith('verification-request', f.id);
        expect(core.setOutput).toHaveBeenCalledWith('verification-home', f.runtime.environment.HOME);
    });
    it.each(['JDK_JAVA_OPTIONS', 'GRADLE_USER_HOME'])('emits the current profile-derived %s for native setup', async key => {
        request(); await awaitNativeBoundary(f.session);
        expect(core.setOutput).toHaveBeenCalledWith(`verification-${key.toLowerCase()}`, f.runtime.environment[key]);
    });
    it.each(['JDK_JAVA_OPTIONS', 'GRADLE_USER_HOME'].flatMap(key => ['missing', 'foreign'].map(kind => [key, kind])))(
        'rejects %s %s before emitting any native metadata', async (key, kind) => {
            const environment = { ...f.runtime.environment };
            if (kind === 'missing') delete environment[key];
            else environment[key] = '/foreign/unapproved';
            request({ environment });
            await expect(awaitNativeBoundary(f.session)).rejects.toThrow('handoff-invalid');
            expect(core.setOutput).not.toHaveBeenCalled();
        });
    it.each([{id: 'wrong'}, {sourceSha: 'wrong'}, {environment: {}}, {environment: {HOME: '\nsecret'}}, {environment: {HOME: 'relative'}}])('rejects malformed pending request %j', async edit => {
        request(edit); await expect(awaitNativeBoundary(f.session)).rejects.toThrow('handoff-invalid');
    });
    it.each([7, 'invalid\nruntime-metadata'])('rejects malformed ordinary runtime metadata %j after validating the private locations', async value => {
        request({ environment: { ...f.runtime.environment, PATH: value } });
        await expect(awaitNativeBoundary(f.session)).rejects.toThrow('handoff-invalid');
        expect(core.setOutput).not.toHaveBeenCalledWith('verification-path', value);
    });
    it('reports completion and copies native action outputs into the current step', async () => {
        process.env.GITHUB_OUTPUT = join(f.session, 'parent-output'); fs.writeFileSync(join(f.session, 'worker-output'), 'telemetry=value\n'); done();
        await awaitNativeBoundary(f.session);
        expect(fs.readFileSync(process.env.GITHUB_OUTPUT, 'utf8')).toBe('telemetry=value\n');
        expect(core.setOutput).toHaveBeenCalledWith('verification-setup-pending', 'false'); expect(core.setFailed).not.toHaveBeenCalled();
    });
    it('preserves worker failure instead of treating a resolved entrypoint as success', async () => {
        done(1); await awaitNativeBoundary(f.session); expect(core.setFailed).toHaveBeenCalled();
    });
    it('publishes the existing Job Summary once at completion', async () => {
        process.env.GITHUB_STEP_SUMMARY = join(f.session, 'parent-summary'); fs.writeFileSync(join(f.session, 'worker-summary'), 'Verified candidate\n'); done();
        await awaitNativeBoundary(f.session); await awaitNativeBoundary(f.session);
        expect(fs.readFileSync(process.env.GITHUB_STEP_SUMMARY, 'utf8')).toBe('Verified candidate\n');
    });
    it('rejects oversized worker outputs without forwarding them', async () => {
        process.env.GITHUB_OUTPUT = join(f.session, 'parent-output'); fs.writeFileSync(join(f.session, 'worker-output'), 'x'.repeat(262_145)); done();
        await expect(awaitNativeBoundary(f.session)).rejects.toThrow('output-limit');
    });
    it('bounds the operation wait without restarting the agent', async () => {
        await expect(awaitNativeBoundary(f.session, 0)).rejects.toThrow('timeout');
    });
    it('waits for a live worker before publishing the late request with its current private profile', async () => {
        jest.spyOn(process, 'kill').mockReturnValue(true);
        const pause = jest.spyOn(protocol, 'nativePause').mockImplementation(async () => { request(); });
        await awaitNativeBoundary(f.session);
        expect(pause).toHaveBeenCalledWith(100);
        expect(core.setOutput).toHaveBeenCalledWith('verification-gradle_user_home', f.runtime.environment.GRADLE_USER_HOME);
        expect(core.setOutput).toHaveBeenCalledWith('verification-setup-pending', 'true');
    });
    it('detects a worker that exited before a result or handoff', async () => {
        jest.spyOn(process, 'kill').mockImplementation(() => { throw new Error('not alive'); });
        await expect(awaitNativeBoundary(f.session)).rejects.toThrow('process-failed');
    });
    it('frames log lines once and flushes the remaining final line', () => {
        fs.writeFileSync(join(f.session, 'worker-log'), '::add-mask::secret\nlast');
        const out = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
        drainNativeWorkerLog(f.session); drainNativeWorkerLog(f.session); drainNativeWorkerLog(f.session, true);
        expect(out.mock.calls.map(call => Buffer.from(call[0] as Buffer).toString()).join('')).toBe('::add-mask::secret\nlast');
    });
    it('streams logs larger than a single read buffer', () => {
        const data = 'line\n'.repeat(20_000); fs.writeFileSync(join(f.session, 'worker-log'), data);
        const out = jest.spyOn(process.stdout, 'write').mockReturnValue(true); drainNativeWorkerLog(f.session, true);
        expect(out.mock.calls.map(call => Buffer.from(call[0] as Buffer).toString()).join('')).toBe(data);
    });
    it('bounds a worker log line rather than accumulating unbounded memory', () => {
        fs.writeFileSync(join(f.session, 'worker-log'), 'x'.repeat(1_100_000));
        expect(() => drainNativeWorkerLog(f.session)).toThrow('output-limit');
    });
    it.each(['success', 'failure', 'cancelled', 'skipped'])('delivers native %s and waits for the existing operation', async outcome => {
        request(); const write = protocol.writeNativeRecord;
        jest.spyOn(protocol, 'writeNativeRecord').mockImplementation((root, name, value) => { write(root, name, value); if (name.startsWith('response-')) write(root, 'done.json', { exitCode: 0 }); });
        await continueNativeVerification(f.session, f.id, outcome, {
            PATH: 'approved', JAVA_HOME: 'java',
            JDK_JAVA_OPTIONS: '-Duser.home=/foreign', GRADLE_USER_HOME: '/foreign/gradle',
            LD_LIBRARY_PATH: '/foreign/loader', LD_PRELOAD: '/foreign/preload',
        });
        expect(protocol.readNativeRecord(f.session, `response-${f.id}.json`)).toEqual({ id: f.id, success: outcome === 'success', path: 'approved', javaHome: 'java' });
        expect(fs.existsSync(join(f.session, 'request.json'))).toBe(false);
    });
    it('rejects a replayed continuation', async () => {
        request(); protocol.writeNativeRecord(f.session, `response-${f.id}.json`, {});
        await expect(continueNativeVerification(f.session, f.id, 'success')).rejects.toThrow('handoff-invalid');
    });
    it('delivers a continuation without inherited PATH or JAVA_HOME as an empty closed result', async () => {
        request(); const write = protocol.writeNativeRecord;
        jest.spyOn(protocol, 'writeNativeRecord').mockImplementation((root, name, value) => { write(root, name, value); if (name.startsWith('response-')) write(root, 'done.json', { exitCode: 0 }); });
        await continueNativeVerification(f.session, f.id, 'success', {});
        expect(protocol.readNativeRecord(f.session, `response-${f.id}.json`)).toEqual({ id: f.id, success: true, path: '' });
    });
    it('rejects continuation after the request has disappeared without writing a response', async () => {
        await expect(continueNativeVerification(f.session, f.id, 'success', {})).rejects.toThrow('handoff-invalid');
        expect(fs.existsSync(join(f.session, `response-${f.id}.json`))).toBe(false);
    });
    it('rejects a malformed snapshot digest before emitting setup metadata', async () => {
        request({ digest: 'invalid' });
        await expect(awaitNativeBoundary(f.session)).rejects.toThrow('handoff-invalid');
        expect(core.setOutput).not.toHaveBeenCalled();
    });
    it('rejects a stale request before signaling the worker', async () => {
        request(); await expect(continueNativeVerification(f.session, 'wrong', 'success')).rejects.toThrow('handoff-invalid');
    });
    it('cleans a completed operation and makes post-job cleanup idempotent', async () => {
        done(); await cleanupNativeVerification(f.session); await cleanupNativeVerification(f.session); expect(fs.existsSync(f.session)).toBe(false);
    });
    it('cancels and kills a stuck worker before restoring its candidate action', async () => {
        fs.mkdirSync(f.action, { recursive: true }); fs.writeFileSync(join(f.action, 'action.yml'), 'candidate'); stageNativeVerificationAction(f.setup as never, f.session);
        const kill = jest.spyOn(process, 'kill').mockReturnValue(true); jest.spyOn(cp, 'spawnSync').mockReturnValue({status: 0} as never);
        await cleanupNativeVerification(f.session, 0); expect(fs.readFileSync(join(f.action, 'action.yml'), 'utf8')).toBe('candidate');
        if (process.platform !== 'win32') expect(kill).toHaveBeenCalledWith(-process.pid, 'SIGKILL');
    });
    it('allows an already-exited worker during cancellation', async () => {
        jest.spyOn(process, 'kill').mockImplementation(() => { throw new Error('exited'); }); jest.spyOn(cp, 'spawnSync').mockReturnValue({status: 0} as never);
        await cleanupNativeVerification(f.session, 0); expect(fs.existsSync(f.session)).toBe(false);
    });
    it('runs an admitted operation directly when there is no native phase', async () => {
        delete process.env.COPILOT_NATIVE_WORKER_SESSION; delete process.env.COPILOT_NATIVE_PHASE; const run = jest.fn(); await runNativeVerificationEntry(run); expect(run).toHaveBeenCalledTimes(1);
    });
    it('keeps opt-out workflows on their ordinary entrypoint', async () => {
        delete process.env.COPILOT_NATIVE_WORKER_SESSION; process.env.COPILOT_NATIVE_PHASE = 'prepare'; jest.mocked(core.getInput).mockReturnValue('false');
        const run = jest.fn(); await runNativeVerificationEntry(run); expect(run).toHaveBeenCalledTimes(1);
    });
    it('executes the worker callback once and retains its final status', async () => {
        const run = jest.fn().mockResolvedValue(undefined); await runNativeVerificationEntry(run);
        expect(run).toHaveBeenCalledTimes(1); expect(protocol.readNativeRecord(f.session, 'done.json')).toEqual({ exitCode: 0 });
    });
    it('rejects native phases outside GitHub Actions', async () => {
        delete process.env.COPILOT_NATIVE_WORKER_SESSION; process.env.COPILOT_NATIVE_PHASE = 'prepare'; delete process.env.GITHUB_ACTIONS;
        await expect(runNativeVerificationEntry(jest.fn())).rejects.toThrow('native-workflow-required');
    });
    it('rejects a worker session owned by a different process', async () => {
        const session = protocol.nativeSession(f.session); protocol.writeNativeRecord(f.session, 'session.json', { ...session, pid: process.pid + 1 });
        const run = jest.fn(); await expect(runNativeVerificationEntry(run)).rejects.toThrow('handoff-invalid'); expect(run).not.toHaveBeenCalled();
    });
    it('waits for publication of its initial worker session with a fixed deadline', async () => {
        fs.rmSync(join(f.session, 'session.json')); let now = 0; jest.spyOn(Date, 'now').mockImplementation(() => now++ ? 30_001 : 0);
        await expect(runNativeVerificationEntry(jest.fn())).rejects.toThrow('timeout');
    });
    it('starts the worker callback after its owner publishes the session', async () => {
        const session = protocol.nativeSession(f.session); fs.rmSync(join(f.session, 'session.json'));
        const pause = jest.spyOn(protocol, 'nativePause').mockImplementation(async () => { protocol.writeNativeRecord(f.session, 'session.json', session); });
        const run = jest.fn().mockResolvedValue(undefined);
        await runNativeVerificationEntry(run);
        expect(pause).toHaveBeenCalledWith(10); expect(run).toHaveBeenCalledTimes(1);
        expect(protocol.readNativeRecord(f.session, 'done.json')).toEqual({ exitCode: 0 });
    });
    it('rejects a native continuation without a ticket', async () => {
        delete process.env.COPILOT_NATIVE_WORKER_SESSION; process.env.GITHUB_ACTIONS = 'true'; process.env.COPILOT_NATIVE_PHASE = 'continue'; delete process.env.COPILOT_NATIVE_TICKET;
        await expect(runNativeVerificationEntry(jest.fn())).rejects.toThrow('handoff-invalid');
    });
    it('rejects unknown phases without running the operation', async () => {
        delete process.env.COPILOT_NATIVE_WORKER_SESSION; process.env.GITHUB_ACTIONS = 'true'; process.env.COPILOT_NATIVE_PHASE = 'unknown'; process.env.COPILOT_NATIVE_TICKET = f.session;
        await expect(runNativeVerificationEntry(jest.fn())).rejects.toThrow('handoff-invalid');
    });
    it('finishes a successful operation and removes its private state', async () => {
        delete process.env.COPILOT_NATIVE_WORKER_SESSION; process.env.GITHUB_ACTIONS = 'true'; process.env.COPILOT_NATIVE_PHASE = 'finish'; process.env.COPILOT_NATIVE_TICKET = f.session; done();
        await runNativeVerificationEntry(jest.fn()); expect(core.setFailed).not.toHaveBeenCalled(); expect(fs.existsSync(f.session)).toBe(true);
    });
    it('finishes failed operations without overriding their status', async () => {
        delete process.env.COPILOT_NATIVE_WORKER_SESSION; process.env.GITHUB_ACTIONS = 'true'; process.env.COPILOT_NATIVE_PHASE = 'finish'; process.env.COPILOT_NATIVE_TICKET = f.session; done(1);
        await runNativeVerificationEntry(jest.fn()); expect(core.setFailed).toHaveBeenCalled();
    });
    it('routes a native continuation to the existing worker without replaying the operation', async () => {
        request(); delete process.env.COPILOT_NATIVE_WORKER_SESSION;
        process.env.GITHUB_ACTIONS = 'true'; process.env.COPILOT_NATIVE_PHASE = 'continue'; process.env.COPILOT_NATIVE_TICKET = f.session;
        process.env.COPILOT_NATIVE_REQUEST = f.id; process.env.COPILOT_NATIVE_OUTCOME = 'success';
        const write = protocol.writeNativeRecord;
        jest.spyOn(protocol, 'writeNativeRecord').mockImplementation((root, name, value) => { write(root, name, value); if (name.startsWith('response-')) write(root, 'done.json', { exitCode: 0 }); });
        const run = jest.fn(); await runNativeVerificationEntry(run);
        expect(run).not.toHaveBeenCalled();
        expect(protocol.readNativeRecord(f.session, `response-${f.id}.json`)).toMatchObject({ id: f.id, success: true });
    });
    it('blocks publication at an exhausted boundary and cancels the pending worker', async () => {
        delete process.env.COPILOT_NATIVE_WORKER_SESSION; process.env.GITHUB_ACTIONS = 'true'; process.env.COPILOT_NATIVE_PHASE = 'finish'; process.env.COPILOT_NATIVE_TICKET = f.session;
        jest.spyOn(protocol, 'nativePause').mockImplementation(async () => { done(1); });
        const run = jest.fn(); await runNativeVerificationEntry(run);
        expect(run).not.toHaveBeenCalled(); expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Pending verification and subsequent publication are blocked'));
        expect(protocol.readNativeRecord(f.session, 'cancel.json')).toEqual({ cancelled: true });
        expect(fs.existsSync(f.session)).toBe(true);
    });
    it('uses the post phase only for cleanup', async () => {
        jest.mocked(core.getState).mockImplementation(key => key === 'copilot-native-post' || key === 'native-verification-owner' ? 'true' : key === 'native-verification-ticket' ? f.session : ''); done(); const run = jest.fn();
        await runNativeVerificationEntry(run); expect(run).not.toHaveBeenCalled(); expect(fs.existsSync(f.session)).toBe(false);
    });
    it('allows post phases without an active verification session', async () => {
        jest.mocked(core.getState).mockImplementation(key => key === 'copilot-native-post' ? 'true' : ''); const run = jest.fn(); await runNativeVerificationEntry(run); expect(run).not.toHaveBeenCalled();
    });
    it('starts one detached worker with private output channels and no credential file', async () => {
        delete process.env.COPILOT_NATIVE_WORKER_SESSION; process.env.GITHUB_ACTIONS = 'true'; process.env.COPILOT_NATIVE_PHASE = 'prepare';
        jest.spyOn(cp, 'spawn').mockImplementation((_program, _args, options) => {
            const root = options!.env!.COPILOT_NATIVE_WORKER_SESSION!; roots.push(root); const child = new EventEmitter() as EventEmitter & {pid: number; unref(): void};
            child.pid = 12345; child.unref = jest.fn(); queueMicrotask(() => { protocol.writeNativeRecord(root, 'done.json', { exitCode: 0 }); child.emit('spawn'); }); return child as never;
        });
        const run = jest.fn(); await runNativeVerificationEntry(run); expect(run).not.toHaveBeenCalled(); expect(cp.spawn).toHaveBeenCalledTimes(1);
        expect(core.saveState).toHaveBeenCalledWith('native-verification-ticket', roots[0]); expect(fs.readdirSync(roots[0])).not.toContain('credentials');
    });
    it('cleans a failed worker launch', async () => {
        delete process.env.COPILOT_NATIVE_WORKER_SESSION; process.env.GITHUB_ACTIONS = 'true'; process.env.COPILOT_NATIVE_PHASE = 'prepare';
        jest.spyOn(cp, 'spawn').mockImplementation((_program, _args, options) => {
            roots.push(options!.env!.COPILOT_NATIVE_WORKER_SESSION!); const child = new EventEmitter(); queueMicrotask(() => child.emit('error', new Error('spawn'))); return child as never;
        });
        await expect(runNativeVerificationEntry(jest.fn())).rejects.toThrow('spawn'); expect(fs.existsSync(roots[0])).toBe(false);
    });
});
