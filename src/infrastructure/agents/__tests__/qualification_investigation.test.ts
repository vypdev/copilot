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
import type { QualificationOperationIdentity, QualificationOperationRecord, QualificationOperationScope, QualificationOperationStopped } from '../../../application/ports/qualification_operation_scope_ports';
import { qualificationOperationIdentity, requireCompleteQualificationOperations, requireQualificationOperationStopped, sameQualificationOperation } from '../../../application/policies/qualification_operation_scope_policy';
import { bindQualificationOperationPlan, hasQualificationOperationPlan, qualificationOperationTermination, requireQualificationOperationScope, stopQualificationOperationPlan, withQualificationOperationScope } from '../qualification_operation_scope';

let f: ReturnType<typeof sourceSnapshotFixture>;
const owned: string[] = [];
const controller = () => new AbortController();
// Live semantic-port leases keep the original controls focused on the ordinary
// SDK, not on Docker. Their synthetic confirmations are not native acceptance.
const leases: { release(): void; done: Promise<unknown> }[] = [];
const stopHooks = new Map<AbortSignal, () => Promise<void>>();
const completedFixtureStops = new Set<AbortSignal>();
let leaseId = 0;
function inFixtureScope<T>(signal: AbortSignal, execute: () => T): T {
    if (signal.aborted) return execute();
    const number = ++leaseId, scopeId = number.toString(16).padStart(64, '0');
    const identity: QualificationOperationIdentity = { ownerId: 'a'.repeat(64), operationId: 'sdk-fixture-' + number,
        planSha256: 'b'.repeat(64), implementation: 'c'.repeat(40), imageSha256: 'd'.repeat(64), purpose: 'native-control' };
    let release!: () => void, confirm!: (value: QualificationOperationStopped) => void, fail!: (error: unknown) => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const stopped = new Promise<QualificationOperationStopped>((resolve, reject) => { confirm = resolve; fail = reject; });
    const port: QualificationOperationScope = { identity, scopeId, signal, stopped, requestStop() {
        void Promise.resolve().then(() => stopHooks.get(signal)?.()).then(() => {
            completedFixtureStops.add(signal);
            confirm({ identity, scopeId, namespaceInitStopped: true });
        }, fail);
    } };
    let value!: T, failure: { error: unknown } | undefined;
    const done = withQualificationOperationScope(port, async () => {
        try { value = execute(); } catch (error) { failure = { error }; throw error; }
        await held;
    }).catch(() => undefined);
    leases.push({ release, done });
    if (failure) throw failure.error;
    return value;
}
function scopedPrepare(planner: AgentExecutionPlanner, input: Parameters<AgentExecutionPlanner['prepareQualificationInvestigation']>[0]) {
    return input.signal ? inFixtureScope(input.signal, () => planner.prepareQualificationInvestigation(input))
        : planner.prepareQualificationInvestigation(input);
}
const request = (signal = controller().signal) => ({
    configuration: { provider: 'codex' as const, modelProvider: 'openai', model: 'gpt-6-luna', effort: 'xhigh' },
    capability: 'findings' as const, prompt: 'Inspect the supplied change.', timeoutMs: 20,
    environment: { PATH: process.env.PATH, UNRELATED_SECRET: 'must-not-reach-child' }, signal,
});
function prepare(signal = controller().signal, overrides = {}): AgentExecutionPlan {
    const p = scopedPrepare(f.planner(), { ...request(signal), ...overrides });
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
afterEach(async () => {
    const current = leases.splice(0); for (const lease of current) lease.release(); await Promise.all(current.map(lease => lease.done));
    stopHooks.clear(); completedFixtureStops.clear();
    for (const directory of owned.splice(0)) rmSync(directory, { recursive: true, force: true });
});
afterAll(() => f.cleanup());

it('ev974-C01 preserves the ordinary timer and removes it only for an admitted investigation', async () => {
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
        jest.useRealTimers(); await until(() => researchReject.mock.calls.length > 0);
        expect(researchKill).not.toHaveBeenCalled();
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
    const ready = join(directory, 'ready'), stopped = join(directory, 'stopped'), leader = join(directory, 'leader');
    const fixture = join(directory, 'fixture.cjs'), executable = join(directory, 'codex');
    const childScript = `process.on('SIGTERM',()=>{require('node:fs').writeFileSync(${JSON.stringify(stopped)},'terminated');process.exit(0)});
        require('node:fs').writeFileSync(${JSON.stringify(ready)},String(process.pid));
        setInterval(()=>{},1000);`;
    const prefix = `require('node:fs').writeFileSync(${JSON.stringify(leader)},String(process.pid));`;
    writeFileSync(fixture, prefix + `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(childScript)}],{stdio:'ignore'});setInterval(()=>{},1000);`);
    const quote = (s: string) => `'${s.replace(/'/gu, `'"'"'`)}'`;
    writeFileSync(executable, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(fixture)} "$@"\n`);
    chmodSync(executable, 0o700);
    const planner = new AgentExecutionPlanner({ resolveWorkspace: () => f.root,
        resolveExecutable: () => executable, readVersion: () => 'codex-cli 0.169.1' });
    async function stopFixture(graceful: boolean) {
        const pid = Number(readFileSync(leader, 'utf8')), child = Number(readFileSync(ready, 'utf8'));
        try { process.kill(-pid, 'SIGTERM'); } catch { /* Owned fixture may already have exited. */ }
        if (graceful) await until(() => existsSync(stopped));
        try { process.kill(-pid, 'SIGKILL'); } catch { /* Owned group already stopped. */ }
        await until(() => { try { process.kill(child, 0); return false; } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ESRCH') return true; throw error;
        } });
    }
    const c = controller(), p = scopedPrepare(planner, request(c.signal));
    stopHooks.set(c.signal, () => stopFixture(true));
    const started = performance.now();
    const outcome = runAgentCli(p, 'Fixture input', c.signal).catch(error => error);
    try {
        await until(() => existsSync(ready) && performance.now() - started > p.timeoutMs);
        expect(process.kill(Number(readFileSync(ready, 'utf8')), 0)).toBe(true);
        expect(existsSync(p.runtimeDirectory)).toBe(true);
        c.abort();
        expect(await outcome).toMatchObject({ category: 'cancelled' });
        expect(completedFixtureStops.has(c.signal)).toBe(true);
        await until(() => existsSync(stopped));
        expect(existsSync(p.runtimeDirectory)).toBe(false);
        expect(readFileSync(stopped, 'utf8')).toBe('terminated');
        // The parent may exit on TERM while a descendant ignores it. Closing
        // the parent's pipes must not cancel cleanup of that surviving group.
        rmSync(ready);
        const stubborn = `process.on('SIGTERM',()=>{});require('node:fs').writeFileSync(${JSON.stringify(ready)},String(process.pid));setInterval(()=>{},1000);`;
        writeFileSync(fixture, prefix + `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(stubborn)}],{stdio:'ignore'});setInterval(()=>{},1000);`);
        const other = controller(), second = scopedPrepare(planner, request(other.signal));
        stopHooks.set(other.signal, () => stopFixture(false));
        const running = runAgentCli(second, 'Fixture input', other.signal).catch(error => error);
        let pid: number | undefined;
        try {
            await until(() => existsSync(ready)); pid = Number(readFileSync(ready, 'utf8'));
            other.abort(); expect(await running).toMatchObject({ category: 'cancelled' });
            // The stop hook already observed this exact descendant's ESRCH
            // before confirming. Require that ordering before SDK settlement;
            // a later bare PID lookup cannot identify the completed operation.
            expect(completedFixtureStops.has(other.signal)).toBe(true);
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
    const directPlan = inFixtureScope(c.signal, () => admitQualificationInvestigationPlan({ ...p, launcherArgv: undefined }, c.signal));
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
        expect(() => scopedPrepare(f.planner(), request())).toThrow(/read-only findings authority/);
        expect(rejectedDirectory).toBeDefined();
        expect(existsSync(rejectedDirectory!)).toBe(false);
    } finally { policy.mockRestore(); }
});

it('ev974-C08 retains nested/foreign-root and ambient configuration rejection; environment cannot grant admission', () => {
    expect(() => scopedPrepare(new AgentExecutionPlanner(), { ...request(), cwd: join(process.cwd(), 'src') }))
        .toThrow(/canonical repository root/);
    const priorActions = process.env.GITHUB_ACTIONS, priorWorkspace = process.env.GITHUB_WORKSPACE;
    try {
        process.env.GITHUB_ACTIONS = 'true'; process.env.GITHUB_WORKSPACE = f.root;
        expect(() => scopedPrepare(new AgentExecutionPlanner(), { ...request(), cwd: process.cwd() }))
            .toThrow(/canonical GitHub checkout/);
    } finally {
        if (priorActions === undefined) delete process.env.GITHUB_ACTIONS; else process.env.GITHUB_ACTIONS = priorActions;
        if (priorWorkspace === undefined) delete process.env.GITHUB_WORKSPACE; else process.env.GITHUB_WORKSPACE = priorWorkspace;
    }
    const ambient = join(f.root, '.opencode'); mkdirSync(ambient);
    try {
        expect(() => scopedPrepare(f.planner('opencode'), { ...request(),
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

// Component controls for the forthcoming contained route. These live semantic
// ports do not claim a real Linux namespace or the four native SDK cases.
describe('whole-operation scope policy and live binding components', () => {
    const identity = (): QualificationOperationIdentity => ({ ownerId: 'a'.repeat(64), operationId: 'case-001',
        planSha256: 'b'.repeat(64), implementation: 'c'.repeat(40), imageSha256: 'd'.repeat(64), purpose: 'corpus-case' });
    function scope(auto = true) {
        const c = new AbortController(), id = identity(), scopeId = 'e'.repeat(64);
        let confirm!: (proof: QualificationOperationStopped) => void, fail!: (error: Error) => void;
        const stopped = new Promise<QualificationOperationStopped>((resolve, reject) => { confirm = resolve; fail = reject; });
        const proof = (): QualificationOperationStopped => ({ identity: identity(), scopeId, namespaceInitStopped: true });
        const requestStop = jest.fn(() => { if (auto) confirm(proof()); });
        const port: QualificationOperationScope = { identity: id, scopeId, signal: c.signal, stopped, requestStop };
        return { c, port, proof, confirm, fail, requestStop };
    }
    const tick = () => new Promise<void>(resolve => setImmediate(resolve));

    it('closes identity fields and freezes an owned copy without turning data into a grant', () => {
        const original = identity(), admitted = qualificationOperationIdentity(original);
        expect(admitted).toEqual(original); expect(admitted).not.toBe(original); expect(Object.isFrozen(admitted)).toBe(true);
        expect(sameQualificationOperation(original, admitted)).toBe(true);
        for (const value of [null, [], 1, {}, { ...original, extra: true }, { ...original, ownerId: 'ambient' },
            { ...original, operationId: '../escape' }, { ...original, planSha256: 'tag' }, { ...original, implementation: 'main' },
            { ...original, imageSha256: 'latest' }, { ...original, purpose: 'consumer' }, { ...original, purpose: null }]) {
            expect(() => qualificationOperationIdentity(value)).toThrow(/ownership/);
        }
        for (const purpose of ['corpus-case', 'paired-review', 'native-control'] as const) {
            expect(qualificationOperationIdentity({ ...original, purpose }).purpose).toBe(purpose);
        }
        expect(sameQualificationOperation(original, { ...original, operationId: 'other' })).toBe(false);
        expect(() => requireQualificationOperationScope(new AbortController().signal)).toThrow(/exact live/);
        const resolveWorkspace = jest.fn(), resolveExecutable = jest.fn(), readVersion = jest.fn();
        const uncontained = new AgentExecutionPlanner({ resolveWorkspace, resolveExecutable, readVersion });
        expect(() => uncontained.prepareQualificationInvestigation(request())).toThrow(/exact live owned operation scope/);
        expect(resolveWorkspace).not.toHaveBeenCalled(); expect(resolveExecutable).not.toHaveBeenCalled(); expect(readVersion).not.toHaveBeenCalled();
    });

    it('requires the exact stopped namespace identity rather than a close event or sampled process', () => {
        const s = scope();
        expect(() => requireQualificationOperationStopped(identity(), s.port.scopeId, s.proof())).not.toThrow();
        for (const proof of [null, {}, { ...s.proof(), extra: true }, { ...s.proof(), scopeId: 'f'.repeat(64) },
            { ...s.proof(), namespaceInitStopped: false }, { ...s.proof(), identity: { ...identity(), ownerId: 'f'.repeat(64) } }]) {
            expect(() => requireQualificationOperationStopped(identity(), s.port.scopeId, proof as QualificationOperationStopped)).toThrow();
        }
        expect(() => requireQualificationOperationStopped(identity(), 'unknown', s.proof())).toThrow();
    });

    it('rejects incomplete, orphaned, replayed, foreign and unconfirmed operation ledgers', () => {
        const id = identity(), scopeId = 'e'.repeat(64), slots = [{ operationId: id.operationId, purpose: 'corpus-case' as const }];
        const start: QualificationOperationRecord = { event: 'start', identity: id, scopeId };
        const end: QualificationOperationRecord = { event: 'stopped', identity: id, scopeId, outcome: 'completed', namespaceInitStopped: true };
        expect(() => requireCompleteQualificationOperations(slots, [start, end], id)).not.toThrow();
        const bad: unknown[][] = [[], [start], [end], [start, start, end], [start, end, end],
            [start, { ...end, outcome: 'failed' }], [start, { ...end, outcome: 'interrupted' }],
            [{ ...start, outcome: 'completed' }, end], [{ ...start, namespaceInitStopped: true }, end],
            [start, { ...end, namespaceInitStopped: false }], [start, { ...end, namespaceInitStopped: undefined }],
            [start, { ...end, scopeId: 'f'.repeat(64) }], [start, { ...end, event: 'closed' }],
            [start, { ...end, identity: { ...id, ownerId: 'f'.repeat(64) } }]];
        for (const rows of bad) expect(() => requireCompleteQualificationOperations(slots, rows as QualificationOperationRecord[], id)).toThrow();
        for (const delta of [{ operationId: 'foreign' }, { purpose: 'paired-review' }, { planSha256: 'f'.repeat(64) },
            { implementation: 'f'.repeat(40) }, { imageSha256: 'f'.repeat(64) }]) {
            expect(() => requireCompleteQualificationOperations(slots,
                [{ ...start, identity: { ...id, ...delta } } as QualificationOperationRecord], id)).toThrow();
        }
        expect(() => requireCompleteQualificationOperations(slots, [{ ...start, scopeId: 'unknown' }], id)).toThrow();
        for (const list of [[], [...slots, ...slots], [{ operationId: '../foreign', purpose: 'corpus-case' }],
            [{ operationId: 'x', purpose: 'native-control' }]]) {
            expect(() => requireCompleteQualificationOperations(list as typeof slots, [start, end], id)).toThrow();
        }
        const second = { ...id, operationId: 'case-002' };
        expect(() => requireCompleteQualificationOperations([...slots, { operationId: second.operationId, purpose: 'corpus-case' }],
            [start, end, { ...start, identity: second }, { ...end, identity: second }], id)).toThrow();
    });

    it('binds exact live plan and signal and waits for confirmed stop before returning a result', async () => {
        const s = scope(false), plan = {} as AgentExecutionPlan;
        expect(qualificationOperationTermination()).toBeUndefined();
        expect(hasQualificationOperationPlan(plan, s.port.signal)).toBe(false);
        await expect(stopQualificationOperationPlan(plan, s.port.signal, 'failed')).rejects.toThrow(/exact live/);
        let returned = false;
        const result = withQualificationOperationScope(s.port, async () => {
            requireQualificationOperationScope(s.port.signal); bindQualificationOperationPlan(plan, s.port.signal);
            expect(hasQualificationOperationPlan(plan)).toBe(false);
            expect(hasQualificationOperationPlan(plan, new AbortController().signal)).toBe(false);
            expect(hasQualificationOperationPlan(plan, s.port.signal)).toBe(true);
            expect(hasQualificationOperationPlan({ ...plan }, s.port.signal)).toBe(false);
            expect(() => bindQualificationOperationPlan(plan, s.port.signal)).toThrow(/exact live/);
            expect(() => requireQualificationOperationScope(new AbortController().signal)).toThrow(/exact live/);
            expect(() => qualificationOperationTermination()).toThrow(/exact live/);
            expect(() => qualificationOperationTermination(new AbortController().signal)).toThrow(/exact live/);
            expect(typeof qualificationOperationTermination(s.port.signal)).toBe('function');
            await expect(withQualificationOperationScope(scope().port, async () => undefined)).rejects.toThrow(/exact live/);
            return 42;
        }).then(value => { returned = true; return value; });
        await tick(); expect(s.requestStop).toHaveBeenCalledTimes(1); expect(s.requestStop).toHaveBeenCalledWith('completed');
        expect(returned).toBe(false); expect(() => requireQualificationOperationScope(s.port.signal)).toThrow();
        s.confirm(s.proof()); expect(await result).toBe(42); expect(hasQualificationOperationPlan(plan, s.port.signal)).toBe(false);
    });

    it('keeps identity, stop target and callback fixed if the original port changes', async () => {
        const s = scope(false), proof = s.proof(), changed = jest.fn();
        const result = withQualificationOperationScope(s.port, async () => {
            Object.assign(s.port.identity, { ownerId: 'f'.repeat(64) });
            Object.assign(s.port, { scopeId: 'f'.repeat(64), requestStop: changed }); return 'retained';
        });
        await tick(); expect(s.requestStop).toHaveBeenCalledWith('completed'); expect(changed).not.toHaveBeenCalled();
        s.confirm(proof); expect(await result).toBe('retained');
    });

    it('requests only its own whole-operation stop on abort and does not accept a completed-looking result', async () => {
        const verifier = scope(false);
        const rejectedVerifier = withQualificationOperationScope(verifier.port, async () => {
            qualificationOperationTermination(verifier.port.signal)!('failed');
            return 'a completed verifier turn cannot settle a failed operation';
        }).catch(error => error);
        await tick(); expect(verifier.requestStop).toHaveBeenCalledWith('failed');
        verifier.confirm(verifier.proof());
        expect(await rejectedVerifier).toMatchObject({ message: expect.stringContaining('exact live') });
        const s = scope(false), unrelated = scope(false), plan = {} as AgentExecutionPlan;
        const result = withQualificationOperationScope(s.port, async () => {
            bindQualificationOperationPlan(plan, s.port.signal); s.c.abort();
            const stopping = stopQualificationOperationPlan(plan, s.port.signal, 'cancelled');
            expect(hasQualificationOperationPlan(plan, s.port.signal)).toBe(false);
            expect(() => requireQualificationOperationScope(s.port.signal)).toThrow(/exact live/);
            s.confirm(s.proof()); await stopping; return 'must-not-complete';
        });
        await expect(result).rejects.toThrow(/exact live/);
        expect(s.requestStop).toHaveBeenCalledTimes(1); expect(s.requestStop).toHaveBeenCalledWith('cancelled');
        expect(unrelated.requestStop).not.toHaveBeenCalled();
        const late = scope();
        await expect(withQualificationOperationScope(late.port, async () => {
            late.c.abort(); return 'completed-looking late response';
        })).rejects.toThrow(/exact live/);
        expect(late.requestStop).toHaveBeenCalledWith('cancelled');
        const quiet = scope(false);
        const pending = withQualificationOperationScope(quiet.port, async () => new Promise(() => undefined));
        const stopped = pending.catch(error => error);
        quiet.c.abort(); expect(quiet.requestStop).toHaveBeenCalledWith('cancelled');
        quiet.confirm(quiet.proof());
        expect(await stopped).toMatchObject({ message: expect.stringContaining('exact live') });
        const completing = scope(false);
        const finishing = withQualificationOperationScope(completing.port, async () => 'provider finished, scope pending');
        const cancelledCompletion = finishing.catch(error => error);
        await tick(); expect(completing.requestStop).toHaveBeenCalledWith('completed');
        completing.c.abort(); completing.confirm(completing.proof());
        expect(await cancelledCompletion).toMatchObject({ message: expect.stringContaining('exact live') });
        const racing = scope(false);
        await expect(withQualificationOperationScope(racing.port, async () => {
            racing.confirm(racing.proof()); return 'unexpected scope exit beside response';
        })).rejects.toThrow(/exact live/);
        expect(racing.requestStop).not.toHaveBeenCalled();
        const stopping = scope(false), boundPlan = {} as AgentExecutionPlan;
        const stoppedEarly = withQualificationOperationScope(stopping.port, async () => {
            bindQualificationOperationPlan(boundPlan, stopping.port.signal);
            void stopQualificationOperationPlan(boundPlan, stopping.port.signal, 'failed');
            return 'actual failure cannot become success';
        }).catch(error => error);
        await tick(); stopping.confirm(stopping.proof());
        expect(await stoppedEarly).toMatchObject({ message: expect.stringContaining('exact live') });
    });

    it('retains failures and rejects unknown or premature stop confirmations without a research timer', async () => {
        const failed = scope();
        await expect(withQualificationOperationScope(failed.port, async () => { throw new Error('actual failure'); })).rejects.toThrow('actual failure');
        expect(failed.requestStop).toHaveBeenCalledWith('failed');
        const unknown = scope(false);
        const result = withQualificationOperationScope(unknown.port, async () => 'not-yet-accepted');
        const outcome = result.catch(error => error);
        await tick(); unknown.fail(new Error('unknown scope state')); expect(await outcome).toMatchObject({ message: 'unknown scope state' });
        const premature = scope(false);
        const interrupted = withQualificationOperationScope(premature.port, async () => new Promise(() => undefined));
        const retained = interrupted.catch(error => error); premature.confirm(premature.proof());
        expect(await retained).toMatchObject({ message: expect.stringContaining('exact live') });
        expect(premature.requestStop).not.toHaveBeenCalled();
        const cancelled = scope(); cancelled.c.abort(); const execute = jest.fn();
        await expect(withQualificationOperationScope(cancelled.port, execute)).rejects.toThrow(/exact live/);
        expect(execute).not.toHaveBeenCalled(); expect(cancelled.requestStop).toHaveBeenCalledWith('cancelled');
        for (const delta of [{ signal: {} }, { scopeId: 'tag' }, { requestStop: undefined }, { stopped: {} }]) {
            await expect(withQualificationOperationScope({ ...scope().port, ...delta } as QualificationOperationScope,
                async () => 'forged')).rejects.toThrow(/exact live/);
        }
        const uncertain = scope(false), rejected = jest.fn(), childKill = jest.fn();
        const execution = withQualificationOperationScope(uncertain.port, async () => {
            const p = f.planner().prepareQualificationInvestigation(request(uncertain.port.signal)); owned.push(p.runtimeDirectory);
            const lifecycle = createAgentProcessLifecycle({ exitCode: null, kill: childKill } as never,
                p, uncertain.port.signal, jest.fn(), rejected);
            lifecycle.abort(); lifecycle.onClose(null);
            expect(rejected).not.toHaveBeenCalled(); expect(childKill).not.toHaveBeenCalled();
            await new Promise(() => undefined);
        }).catch(error => error);
        await tick(); expect(uncertain.requestStop).toHaveBeenCalledWith('cancelled');
        uncertain.fail(new Error('engine stop state unavailable')); await execution;
        await until(() => rejected.mock.calls.length > 0);
        expect(rejected).toHaveBeenCalledWith(expect.objectContaining({ category: 'process', message: 'Qualification operation stop is unconfirmed.' }));
        expect(childKill).not.toHaveBeenCalled();
    });
});
