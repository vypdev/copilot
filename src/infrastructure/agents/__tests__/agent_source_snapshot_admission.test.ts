import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { sourceSnapshotFixture } from './source_snapshot_fixture';
import { runAgentCli } from '../../../data/repository/agent_cli_execution';
import { AgentCliClient } from '../../../data/repository/agent_cli_client';
import type { AgentExecutionPlan } from '../../../domain/agent_execution_plan';
import { SddSourceContextFailure } from '../../../domain/agent_source_snapshot';

jest.setTimeout(30_000);
let f: ReturnType<typeof sourceSnapshotFixture>, priorWorkspace: string | undefined;
const plans: AgentExecutionPlan[] = [];
const prepare = () => { const p = f.prepare(); plans.push(p); return p; };
beforeAll(() => { f = sourceSnapshotFixture(); });
beforeEach(() => { priorWorkspace = process.env.GITHUB_WORKSPACE; if (process.env.GITHUB_ACTIONS === 'true') process.env.GITHUB_WORKSPACE = f.root; });
afterEach(() => {
    if (priorWorkspace === undefined) delete process.env.GITHUB_WORKSPACE; else process.env.GITHUB_WORKSPACE = priorWorkspace;
    jest.restoreAllMocks(); for (const p of plans.splice(0)) rmSync(p.runtimeDirectory, { recursive: true, force: true });
});
afterAll(() => f.cleanup());
it.each([{ capability: 'fixer' }, { workspaceMode: 'workspace-write' }, { sourceDeadlineMs: undefined },
    { sourceDeadlineMs: NaN }, { sourceDeadlineMs: Infinity }, { sourceDeadlineMs: Number.MAX_SAFE_INTEGER }])(
    'source-context-C32/source-context-C38: forged source admission fields reject before child launch %#', async change => {
        const p = prepare();
        await expect(runAgentCli({ ...p, ...change } as AgentExecutionPlan, 'Read.')).rejects.toMatchObject({ reason: 'view-integrity' });
        expect(existsSync(p.runtimeDirectory)).toBe(false);
    });
it('source-context-C38: a detached source deadline is not accepted as a legacy plan', async () => {
    const p = prepare();
    await expect(runAgentCli({ ...p, sourceSnapshot: undefined }, 'Read.')).rejects.toMatchObject({ category: 'configuration' });
    expect(existsSync(p.runtimeDirectory)).toBe(false);
});
it('source-context-C46: already-aborted source execution cleans the admitted view without launching', async () => {
    const p = prepare(), controller = new AbortController(); controller.abort();
    await expect(runAgentCli(p, 'Read.', controller.signal)).rejects.toMatchObject({ category: 'cancelled' });
    expect(existsSync(p.runtimeDirectory)).toBe(false);
});
it('source-context-C38: final policy/artifact time cannot grant a fresh provider budget', () => {
    const existing = prepare(), module = require('../agent_source_snapshot_workspace');
    jest.spyOn(module, 'prepareSourceSnapshotWorkspace').mockReturnValue({ workspace: existing.workspace,
        manifest: JSON.parse(readFileSync(join(existing.runtimeDirectory, 'source-snapshot.json'), 'utf8')) });
    jest.spyOn(performance, 'now').mockReturnValueOnce(1000).mockReturnValue(31001);
    expect(() => f.prepare()).toThrow(expect.objectContaining({ category: 'timeout' }));
});
it('source-context-C37: a source preflight failure preserves identity and only publishes a closed workspace observation', async () => {
    const failure = new SddSourceContextFailure('object-unavailable', f.source), observe = jest.fn();
    const client = new AgentCliClient({ prepare: () => { throw failure; } }, { observe });
    await expect(client.execute({ configuration: { provider: 'codex', model: 'fixture-model' }, capability: 'findings',
        prompt: 'PRIVATE prompt', timeoutMs: 30_000, sourceSnapshot: f.source })).rejects.toBe(failure);
    expect(observe).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'failed', phase: 'preflight', preflightStage: 'workspace' }));
    expect(JSON.stringify(observe.mock.calls)).not.toContain('PRIVATE prompt');
});
