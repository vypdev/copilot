import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentCapability } from '../../../domain/agent';
import type { AgentExecutionPlan } from '../../../domain/agent_execution_plan';
import { createAgentProcessLifecycle, runAgentCli } from '../../../data/repository/agent_cli_execution';
import { AgentExecutionPlanner } from '../agent_execution_planner';
import { admitQualificationInvestigationPlan, isAdmittedQualificationInvestigation } from '../qualification_investigation_admission';
import { sourceSnapshotFixture } from './source_snapshot_fixture';
import * as providerPolicies from '../../../application/policies/agent_execution/agent_execution_policy_dispatcher';

let f: ReturnType<typeof sourceSnapshotFixture>;
const owned: string[] = [];
const controller = () => new AbortController();
const request = (signal = controller().signal) => ({
    configuration: { provider: 'codex' as const, modelProvider: 'openai', model: 'gpt-6-luna', effort: 'xhigh' },
    capability: 'findings' as const, prompt: 'Inspect the supplied change.', timeoutMs: 20,
    environment: { PATH: process.env.PATH, UNRELATED_SECRET: 'must-not-reach-child' }, signal,
});
function prepare(signal = controller().signal, overrides = {}): AgentExecutionPlan {
    const p = f.planner().prepareQualificationInvestigation({ ...request(signal), ...overrides });
    owned.push(p.runtimeDirectory);
    return p;
}
async function until(predicate: () => boolean): Promise<void> {
    const fixtureDeadline = Date.now() + 5_000;
    while (!predicate()) {
        if (Date.now() >= fixtureDeadline) throw new Error('Controlled process fixture did not reach its expected state.');
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}

beforeAll(() => { f = sourceSnapshotFixture(); });
afterEach(() => { for (const directory of owned.splice(0)) rmSync(directory, { recursive: true, force: true }); });
afterAll(() => f.cleanup());

it('ev974-C01 preserves the ordinary timer and removes it only for an admitted investigation', () => {
    const c = controller(), research = prepare(c.signal);
    const ordinary = f.planner().prepare(request(c.signal)); owned.push(ordinary.runtimeDirectory);
    jest.useFakeTimers();
    try {
        const normalKill = jest.fn(), researchKill = jest.fn(), normalReject = jest.fn(), researchReject = jest.fn();
        const normal = createAgentProcessLifecycle({ exitCode: null, kill: normalKill } as never,
            ordinary, c.signal, jest.fn(), normalReject);
        const investigation = createAgentProcessLifecycle({ exitCode: null, kill: researchKill } as never,
            research, c.signal, jest.fn(), researchReject);
        jest.advanceTimersByTime(900_001);
        normal.onClose(null);
        expect(normalReject).toHaveBeenCalledWith(expect.objectContaining({ category: 'timeout' }));
        expect(normalKill).toHaveBeenCalled(); expect(researchKill).not.toHaveBeenCalled();
        investigation.abort(); investigation.onClose(null);
        expect(researchKill).toHaveBeenCalledWith('SIGTERM');
        expect(researchReject).toHaveBeenCalledWith(expect.objectContaining({ category: 'cancelled' }));
    } finally { jest.useRealTimers(); }
});

it('ev974-C02 retains canonical workspace, ordinary read-only Codex argv, native schema and isolated credentials', () => {
    const schema = { type: 'object', properties: { findings: { type: 'array', items: { type: 'string' } } },
        required: ['findings'], additionalProperties: false };
    const p = prepare(controller().signal, { outputSchema: schema });
    expect(p).toMatchObject({ workspace: f.root, workspaceMode: 'read-only', childNetwork: 'deny',
        approval: 'never', sessionPersistence: false, output: 'native-and-local-json-schema', qualificationInvestigation: true });
    expect(p.brokeredVerification).toBeUndefined();
    expect(p.argv).toEqual(expect.arrayContaining(['--sandbox', 'read-only', '--strict-config', '--ignore-user-config',
        '--model', 'gpt-6-luna', 'model_reasoning_effort="xhigh"', '--output-schema']));
    expect(p.environment.UNRELATED_SECRET).toBeUndefined();
    expect(p.artifacts.some(a => a.purpose === 'output-schema')).toBe(true);
    expect(Object.isFrozen(p)).toBe(true); expect(Object.isFrozen(p.argv)).toBe(true);
    expect(Object.isFrozen(p.environment)).toBe(true); expect(Object.isFrozen(p.artifacts[0])).toBe(true);
    expect(Object.isFrozen(p.runtimeContract)).toBe(true);
});

// This native POSIX process-tree control is distinct from Windows acceptance.
(process.platform === 'win32' ? it.skip : it)('ev974-C03 keeps a real child past its ordinary bound, then cancels descendants and cleans runtime', async () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), 'copilot-investigation-process-')));
    const ready = join(directory, 'ready'), stopped = join(directory, 'stopped');
    const fixture = join(directory, 'fixture.cjs'), executable = join(directory, 'codex');
    const childScript = `process.on('SIGTERM',()=>{require('node:fs').writeFileSync(${JSON.stringify(stopped)},'terminated');process.exit(0)});
        require('node:fs').writeFileSync(${JSON.stringify(ready)},String(process.pid));
        setInterval(()=>{},1000);`;
    writeFileSync(fixture, `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childScript)}],{stdio:'ignore'});setInterval(()=>{},1000);`);
    const quote = (s: string) => `'${s.replace(/'/gu, `'"'"'`)}'`;
    writeFileSync(executable, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(fixture)} "$@"\n`);
    chmodSync(executable, 0o700);
    const planner = new AgentExecutionPlanner({ resolveWorkspace: () => f.root,
        resolveExecutable: () => executable, readVersion: () => 'codex-cli 0.169.1' });
    const c = controller(), p = planner.prepareQualificationInvestigation(request(c.signal));
    const started = performance.now();
    const outcome = runAgentCli(p, 'Fixture input', c.signal).catch(error => error);
    try {
        await until(() => existsSync(ready) && performance.now() - started > p.timeoutMs);
        expect(process.kill(Number(readFileSync(ready, 'utf8')), 0)).toBe(true);
        expect(existsSync(p.runtimeDirectory)).toBe(true);
        c.abort();
        expect(await outcome).toMatchObject({ category: 'cancelled' });
        await until(() => existsSync(stopped));
        expect(existsSync(p.runtimeDirectory)).toBe(false);
        expect(readFileSync(stopped, 'utf8')).toBe('terminated');
        // The parent may exit on TERM while a descendant ignores it. Closing
        // the parent's pipes must not cancel cleanup of that surviving group.
        rmSync(ready);
        const stubborn = `process.on('SIGTERM',()=>{});require('node:fs').writeFileSync(${JSON.stringify(ready)},String(process.pid));setInterval(()=>{},1000);`;
        writeFileSync(fixture, `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(stubborn)}],{stdio:'ignore'});setInterval(()=>{},1000);`);
        const other = controller(), second = planner.prepareQualificationInvestigation(request(other.signal));
        const running = runAgentCli(second, 'Fixture input', other.signal).catch(error => error);
        let pid: number | undefined;
        try {
            await until(() => existsSync(ready)); pid = Number(readFileSync(ready, 'utf8'));
            other.abort(); expect(await running).toMatchObject({ category: 'cancelled' });
            await until(() => {
                try { process.kill(pid!, 0); return false; }
                catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true; throw error; }
            });
            pid = undefined;
            expect(existsSync(second.runtimeDirectory)).toBe(false);
        } finally {
            other.abort(); await running;
            if (pid) { try { process.kill(pid, 'SIGKILL'); } catch { /* Owned fixture already exited. */ } }
            rmSync(second.runtimeDirectory, { recursive: true, force: true });
        }
    } finally {
        c.abort(); await outcome;
        rmSync(directory, { recursive: true, force: true });
        rmSync(p.runtimeDirectory, { recursive: true, force: true });
    }
}, 15_000);

it('ev974-C04 rejects fixer capability before preparing any runtime or process', () => {
    const planner = f.planner(), spy = jest.spyOn(planner, 'prepare');
    expect(() => planner.prepareQualificationInvestigation({ ...request(), capability: 'fixer' })).toThrow(/requires findings/);
    expect(spy).not.toHaveBeenCalled();
});

it('ev974-C05 rejects all other roles, absent cancellation, and a canceled operation', () => {
    for (const capability of ['planner', 'reviewer', 'tester', 'language'] as AgentCapability[]) {
        expect(() => f.planner().prepareQualificationInvestigation({ ...request(), capability })).toThrow(/requires findings/);
    }
    expect(() => f.planner().prepareQualificationInvestigation({ ...request(), signal: undefined })).toThrow(/explicit cancellation/);
    const c = controller(); c.abort();
    expect(() => f.planner().prepareQualificationInvestigation(request(c.signal))).toThrow(/cancelled/);
});

it('ev974-C06 rejects immutable SDD source and retains its ordinary materialized source deadline', () => {
    expect(() => f.planner().prepareQualificationInvestigation({ ...request(), sourceSnapshot: f.source })).toThrow(/no source snapshot/);
    const p = f.prepare(); owned.push(p.runtimeDirectory);
    expect(p.sourceSnapshot).toEqual(f.source); expect(p.sourceDeadlineMs).toBeGreaterThan(performance.now());
    expect(p.timeoutMs).toBeLessThanOrEqual(30_000); expect(p.workspace).not.toBe(f.root);
    expect(p.qualificationInvestigation).toBeUndefined();
    expect(isAdmittedQualificationInvestigation(p)).toBe(false);
});

it('ev974-C07 rejects forged, copied, changed-authority and different-signal plans and cleans owned artifacts', async () => {
    const c = controller(), p = prepare(c.signal);
    expect(isAdmittedQualificationInvestigation(p, c.signal)).toBe(true);
    expect(isAdmittedQualificationInvestigation(p)).toBe(false);
    expect(isAdmittedQualificationInvestigation(p, controller().signal)).toBe(false);
    const directPlan = admitQualificationInvestigationPlan({ ...p, launcherArgv: undefined }, c.signal);
    expect(isAdmittedQualificationInvestigation(directPlan, c.signal)).toBe(true);
    for (const delta of [{ capability: 'fixer' }, { workspaceMode: 'workspace-write' }, { sourceSnapshot: f.source },
        { sourceDeadlineMs: 1 }, { brokeredVerification: true }, { childNetwork: 'allow' }, { approval: 'always' },
        { sessionPersistence: true }]) {
        expect(() => admitQualificationInvestigationPlan({ ...p, ...delta } as AgentExecutionPlan, c.signal)).toThrow(/read-only findings authority/);
    }
    const forged = { ...p, workspaceMode: 'workspace-write' as const };
    await expect(runAgentCli(forged, '', c.signal)).rejects.toMatchObject({ category: 'configuration' });
    expect(existsSync(p.runtimeDirectory)).toBe(false);
    const other = prepare(c.signal);
    await expect(runAgentCli(other, '', controller().signal)).rejects.toMatchObject({ category: 'configuration' });
    expect(existsSync(other.runtimeDirectory)).toBe(false);
    const canceled = prepare(c.signal); c.abort();
    await expect(runAgentCli(canceled, '', c.signal)).rejects.toMatchObject({ category: 'cancelled' });
    expect(existsSync(canceled.runtimeDirectory)).toBe(false);
    const originalPolicy = providerPolicies.buildProviderExecutionPolicy;
    let rejectedDirectory: string | undefined;
    const policy = jest.spyOn(providerPolicies, 'buildProviderExecutionPolicy').mockImplementationOnce(input => {
        rejectedDirectory = input.runtimeDirectory;
        return { ...originalPolicy(input), workspaceMode: 'workspace-write' };
    });
    try {
        expect(() => f.planner().prepareQualificationInvestigation(request())).toThrow(/read-only findings authority/);
        expect(rejectedDirectory).toBeDefined();
        expect(existsSync(rejectedDirectory!)).toBe(false);
    } finally { policy.mockRestore(); }
});

it('ev974-C08 retains nested/foreign-root and ambient configuration rejection; environment cannot grant admission', () => {
    expect(() => new AgentExecutionPlanner().prepareQualificationInvestigation({ ...request(), cwd: join(process.cwd(), 'src') }))
        .toThrow(/canonical repository root/);
    const priorActions = process.env.GITHUB_ACTIONS, priorWorkspace = process.env.GITHUB_WORKSPACE;
    try {
        process.env.GITHUB_ACTIONS = 'true'; process.env.GITHUB_WORKSPACE = f.root;
        expect(() => new AgentExecutionPlanner().prepareQualificationInvestigation({ ...request(), cwd: process.cwd() }))
            .toThrow(/canonical GitHub checkout/);
    } finally {
        if (priorActions === undefined) delete process.env.GITHUB_ACTIONS; else process.env.GITHUB_ACTIONS = priorActions;
        if (priorWorkspace === undefined) delete process.env.GITHUB_WORKSPACE; else process.env.GITHUB_WORKSPACE = priorWorkspace;
    }
    const ambient = join(f.root, '.opencode'); mkdirSync(ambient);
    try {
        expect(() => f.planner('opencode').prepareQualificationInvestigation({ ...request(),
            configuration: { provider: 'opencode', model: 'fixture-model' } })).toThrow(/project configuration/);
    } finally { rmSync(ambient, { recursive: true, force: true }); }
    const p = f.planner().prepare({ ...request(), environment: { COPILOT_QUALIFICATION_INVESTIGATION: 'true' } });
    owned.push(p.runtimeDirectory);
    expect(p.qualificationInvestigation).toBeUndefined();
    expect(isAdmittedQualificationInvestigation(p, request().signal)).toBe(false);
    // The only production registration caller must remain the ordinary planner.
    const callers = readdirSync('src', { recursive: true }).filter((file): file is string => typeof file === 'string'
        && file.endsWith('.ts') && !file.includes('__tests__') && !file.endsWith('qualification_investigation_admission.ts'))
        .filter(file => /\badmitQualificationInvestigationPlan\(/u.test(readFileSync(join('src', file), 'utf8')))
        .map(file => join('src', file).replace(/\\/gu, '/')).sort();
    expect(callers).toEqual(['src/infrastructure/agents/agent_execution_planner.ts']);
});
