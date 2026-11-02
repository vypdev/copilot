import { chmodSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { sourceSnapshotFixture } from './source_snapshot_fixture';
import { verifySourceSnapshotWorkspace } from '../agent_source_snapshot_integrity';
import { sourceSnapshotFiles, prepareSourceSnapshotWorkspace } from '../agent_source_snapshot_workspace';
import { SourceSnapshotGit } from '../agent_source_snapshot_git';
import { SddSourceContextFailure } from '../../../domain/agent_source_snapshot';
import { AgentCliError } from '../../../data/repository/agent_cli_contracts';
import type { AgentExecutionPlan } from '../../../domain/agent_execution_plan';

jest.setTimeout(30_000);
let fixture: ReturnType<typeof sourceSnapshotFixture>, priorWorkspace: string | undefined;
const plans: AgentExecutionPlan[] = [];
const prepare = () => { const p = fixture.prepare(); plans.push(p); return p; };
const verify = (p: AgentExecutionPlan) => verifySourceSnapshotWorkspace(p.sourceSnapshot!, p.workspace, p.runtimeDirectory, p.artifacts);
function edit(plan: AgentExecutionPlan, mutate: (manifest: Record<string, any>) => void) {
    const path = join(plan.runtimeDirectory, 'source-snapshot.json'), manifest = JSON.parse(readFileSync(path, 'utf8'));
    mutate(manifest); const contents = JSON.stringify(manifest); writeFileSync(path, contents);
    return { ...plan, artifacts: plan.artifacts.map(artifact => artifact.purpose === 'source-snapshot'
        ? { ...artifact, sha256: createHash('sha256').update(contents).digest('hex') } : artifact) };
}
beforeAll(() => { fixture = sourceSnapshotFixture(); });
beforeEach(() => { priorWorkspace = process.env.GITHUB_WORKSPACE; if (process.env.GITHUB_ACTIONS === 'true') process.env.GITHUB_WORKSPACE = fixture.root; });
afterEach(() => {
    if (priorWorkspace === undefined) delete process.env.GITHUB_WORKSPACE; else process.env.GITHUB_WORKSPACE = priorWorkspace;
    jest.restoreAllMocks(); for (const p of plans.splice(0)) rmSync(p.runtimeDirectory, { recursive: true, force: true });
});
afterAll(() => fixture.cleanup());
it('rejects a missing source identity or missing/duplicate source artifact', () => {
    const p = prepare();
    expect(() => verify({ ...p, sourceSnapshot: {} as never })).toThrow(SddSourceContextFailure);
    expect(() => verify({ ...p, artifacts: [] })).toThrow(SddSourceContextFailure);
    expect(() => verify({ ...p, artifacts: [...p.artifacts, ...p.artifacts] })).toThrow(SddSourceContextFailure);
});
it.each([
    (m: Record<string, any>) => { m.source.baseSha = 'f'.repeat(40); },
    (m: Record<string, any>) => { m.schemaVersion = 2; },
    (m: Record<string, any>) => { m.gitFiles = []; },
    (m: Record<string, any>) => { m.directories = ['../outside']; },
])('rejects structurally invalid source manifests %#', mutate => {
    const p = edit(prepare(), mutate); expect(() => verify(p)).toThrow(SddSourceContextFailure);
});
it('rejects invalid manifest Git paths without reading outside the private view', () => {
    const p = edit(prepare(), m => { m.gitFiles['../secret'] = 'f'.repeat(64); }); expect(() => verify(p)).toThrow(SddSourceContextFailure);
});
it('rejects a file inventory size mismatch before reading a body', () => {
    const p = edit(prepare(), m => { m.files[0].bytes++; }); expect(() => verify(p)).toThrow(SddSourceContextFailure);
});
it('rejects an aggregate byte mismatch even when individual files are authentic', () => {
    const p = edit(prepare(), m => { m.bytes++; }); expect(() => verify(p)).toThrow(SddSourceContextFailure);
});
it.each(['HEAD', 'shallow'])('rejects a contradictory %s even if its metadata digest was resealed', name => {
    const p = prepare(), path = join(p.workspace, '.git', name); writeFileSync(path, `${fixture.anchor}\n`);
    const candidate = edit(p, m => { m.gitFiles[`.git/${name}`] = createHash('sha256').update(readFileSync(path)).digest('hex'); });
    expect(() => verify(candidate)).toThrow(SddSourceContextFailure);
});
it('checks source executable intent on Unix and admits its portable Windows observation', () => {
    const p = prepare(), platform = process.platform;
    try {
        Object.defineProperty(process, 'platform', { value: 'win32' }); expect(() => verify(p)).not.toThrow();
        Object.defineProperty(process, 'platform', { value: 'linux' }); chmodSync(join(p.workspace, 'scripts/check.sh'), 0o400);
        expect(() => verify(p)).toThrow(SddSourceContextFailure);
    } finally { Object.defineProperty(process, 'platform', { value: platform }); }
});
it('requires the original canonical Actions checkout even for an intact owned view', () => {
    const p = prepare(), actions = process.env.GITHUB_ACTIONS;
    process.env.GITHUB_ACTIONS = 'true'; delete process.env.GITHUB_WORKSPACE;
    try {
        expect(() => verify(p)).toThrow(SddSourceContextFailure);
        process.env.GITHUB_WORKSPACE = fixture.directory; expect(() => verify(p)).toThrow(SddSourceContextFailure);
        process.env.GITHUB_WORKSPACE = fixture.root; expect(() => verify(p)).not.toThrow();
    } finally { if (actions === undefined) delete process.env.GITHUB_ACTIONS; else process.env.GITHUB_ACTIONS = actions; }
});
it('discards raw JSON/filesystem errors and never follows symbolic scanner entries', () => {
    const p = prepare(); writeFileSync(join(p.runtimeDirectory, 'source-snapshot.json'), 'PRIVATE invalid JSON');
    expect(() => verify(p)).toThrow(expect.objectContaining({ reason: 'view-integrity' }));
    const spy = jest.spyOn(require('node:fs'), 'lstatSync').mockReturnValue({ isSymbolicLink: () => true });
    expect(() => sourceSnapshotFiles(p.workspace)).toThrow('not regular'); spy.mockRestore();
});
it('discards arbitrary materializer errors but retains timeout/cancel identity', () => {
    const p = prepare(), error = new Error('PRIVATE path / secret');
    const inventory = jest.spyOn(SourceSnapshotGit.prototype, 'inventory').mockImplementation(() => { throw error; });
    // A fresh runtime subdirectory is used because the Git profile is create-only.
    expect(() => prepareSourceSnapshotWorkspace(fixture.root, fixture.source, join(p.runtimeDirectory, 'fault1'), performance.now() + 30_000))
        .toThrow(expect.objectContaining({ reason: 'materialization-failed' }));
    inventory.mockImplementation(() => { throw new AgentCliError('cancelled', 'cancelled'); });
    expect(() => prepareSourceSnapshotWorkspace(fixture.root, fixture.source, join(p.runtimeDirectory, 'fault2'), performance.now() + 30_000))
        .toThrow(expect.objectContaining({ category: 'cancelled' }));
});
