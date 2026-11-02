import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentExecutionPlanner } from '../../../infrastructure/agents/agent_execution_planner';
import { getAgentRuntimeManifestEntry } from '../../../infrastructure/agents/agent_runtime_manifest';
import { makeWindowsRuntimePathPrivate } from '../../../infrastructure/agents/windows_runtime_acl';
import { FindingsAgentAdapter } from '../../../data/repository/ai/findings_agent_adapter';
import { PreBranchSddWorkspaceAdapter } from '../../../infrastructure/pre_branch_sdd_workspace_adapter';
import type { FindingsQueryRequest } from '../../../application/ports/agent_findings_ports';
import type { AgentCliPort } from '../../../infrastructure/agents/ports/agent_provider_ports';

jest.setTimeout(30000);
const directory = mkdtempSync(join(tmpdir(), 'copilot-836-source-regression-'));
const root = join(directory, 'anchor'), hooks = join(directory, 'hooks'), executable = join(directory, process.platform === 'win32' ? 'node.exe' : 'agent');
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const selectedFiles = { 'specs/catalog.json': '{"version":1,"capabilities":[]}\n', 'specs/owner.md': '# Actual selected contract\n', 'docs/guide.md': '# Actual selected guide\n', 'src/model.ts': 'export const selectedSource = true;\n' };
let anchor: string, selected: string;
beforeAll(() => {
    mkdirSync(root); mkdirSync(hooks);
    git(root, 'init'); git(root, 'config', 'core.hooksPath', hooks); git(root, 'config', 'user.name', 'Fixture'); git(root, 'config', 'user.email', 'fixture@example.test');
    writeFileSync(join(root, 'README.md'), '# Bootstrap\n'); git(root, 'add', '.'); git(root, 'commit', '-qm', 'bootstrap'); anchor = git(root, 'rev-parse', 'HEAD');
    for (const [name, body] of Object.entries(selectedFiles)) { mkdirSync(join(root, name.split('/')[0]), { recursive: true }); writeFileSync(join(root, name), body); }
    writeFileSync(join(root, 'specs/_template.md'), '# Template\n'); writeFileSync(join(root, 'specs/README.md'), '# Standard\n');
    git(root, 'add', '.'); git(root, 'commit', '-qm', 'selected source'); selected = git(root, 'rev-parse', 'HEAD');
    if (process.platform === 'win32') { copyFileSync(process.execPath, executable); makeWindowsRuntimePathPrivate(directory, true); makeWindowsRuntimePathPrivate(executable, false); }
    else { writeFileSync(executable, '#!/bin/sh\nexit 0\n'); chmodSync(executable, 0o700); }
});
beforeEach(() => git(root, 'checkout', '--detach', '--force', anchor));
afterAll(() => rmSync(directory, { recursive: true, force: true }));
async function query(phase: 'analysis' | 'draft') {
    const before = git(root, 'rev-parse', 'HEAD');
    const planner = new AgentExecutionPlanner({ resolveWorkspace: () => root, resolveExecutable: () => executable, readVersion: () => getAgentRuntimeManifestEntry('codex').reviewedVersion });
    const execute: AgentCliPort['execute'] = async request => {
        const plan = planner.prepare({ ...request, cwd: root });
        try {
            const facts = Object.fromEntries(Object.keys(selectedFiles).map(name => [name, readFileSync(join(plan.workspace, name), 'utf8')]));
            expect(git(plan.workspace, 'rev-parse', 'HEAD')).toBe(selected);
            expect(facts).toEqual(selectedFiles); expect(plan.workspaceMode).toBe('read-only'); expect(plan.childNetwork).toBe('deny'); expect(plan.approval).toBe('never');
            return JSON.stringify({ grounded: true });
        } finally { rmSync(plan.runtimeDirectory, { recursive: true, force: true }); }
    };
    const request = { configuration: { provider: 'codex' as const, model: 'fixture-model' }, agentId: `pre-branch-sdd-${phase}`, prompt: 'Use the selected immutable source.',
        options: { expectJson: true, schemaName: `pre_branch_sdd_${phase}`, schema: { type: 'object', properties: { grounded: { type: 'boolean' } }, required: ['grounded'], additionalProperties: false } },
        sourceSnapshot: { kind: 'pre-branch-sdd', phase, baseSha: selected } } as FindingsQueryRequest;
    try { expect(await new FindingsAgentAdapter({ cli: { execute } }).query(request)).toEqual({ grounded: true }); }
    finally { expect(git(root, 'rev-parse', 'HEAD')).toBe(before); expect(git(root, 'status', '--porcelain')).toBe(''); expect(git(root, 'worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1); }
}
it.each(['analysis', 'draft'] as const)('source-context-C13/source-context-C29: grounds %s in the selected tree while the canonical bootstrap checkout stays unchanged', async phase => {
    expect(existsSync(join(root, 'specs/catalog.json'))).toBe(false); await query(phase);
});
it('source-context-C14: control: a matching canonical source can supply all selected bytes with the same provider fake', async () => {
    git(root, 'checkout', '--detach', '--force', selected); await query('analysis');
});
it('source-context-C50: control: a genuinely missing trusted catalog retains its exact typed failure', async () => {
    await expect(new PreBranchSddWorkspaceAdapter(root).loadSnapshotAtCommit(anchor)).rejects.toMatchObject({ name: 'SddTrustedCatalogMissingFailure', sourceCommit: anchor });
    expect(git(root, 'rev-parse', 'HEAD')).toBe(anchor);
});
