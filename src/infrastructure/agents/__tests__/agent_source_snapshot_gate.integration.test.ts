import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sourceSnapshotFixture } from './source_snapshot_fixture';
import { PreBranchSddWorkspaceAdapter } from '../../pre_branch_sdd_workspace_adapter';
import { createFindingsQueryPort } from '../../composition/agent_capability_composition_root';
import { AgentCliClient } from '../../../data/repository/agent_cli_client';
import { PreBranchSddGateUseCase, type PreBranchSddContext } from '../../../application/usecases/sdd/pre_branch_sdd_gate_use_case';
import { sddConsistencyFixture } from '../../../testing/sdd_consistency_fixture';
import type { AgentExecutionPlan } from '../../../domain/agent_execution_plan';
import { configureApplicationLogger, resetApplicationLogger } from '../../../application/ports/logging_ports';

jest.setTimeout(60_000);
it.each([
    ['source-context-C53', false, false], ['source-context-C56', true, false], ['source-context-C57', false, true],
] as const)('%s: real gate/composition/native child, repair=%s, publication=%s', async (_caseId, repair, publication) => {
    const f = sourceSnapshotFixture(true), remote = join(f.directory, 'remote.git'), branch = 'feature/42-change';
    const errors: unknown[] = [], noop = () => undefined;
    configureApplicationLogger({ logError: message => { errors.push(message); }, logInfo: noop, logWarn: noop, logWarning: noop,
        logDebugInfo: noop, logDebugWarning: noop, logDebugError: noop, setGlobalLoggerDebug: noop });
    const priorWorkspace = process.env.GITHUB_WORKSPACE;
    if (process.env.GITHUB_ACTIONS === 'true') process.env.GITHUB_WORKSPACE = f.root;
    const git = (root: string, ...args: string[]) => execFileSync('git', ['-c', `core.hooksPath=${f.hooks}`, ...args], { cwd: root, encoding: 'utf8', stdio: 'pipe', timeout: 15_000 }).trim();
    mkdirSync(remote); git(remote, 'init', '--bare'); git(remote, 'config', 'core.hooksPath', f.hooks);
    f.git('remote', 'add', 'origin', remote); f.git('push', 'origin', `${f.selected}:refs/heads/develop`);
    const plan = { action: 'update', path: 'specs/payments.md', capabilityId: 'payments',
        reason: 'The issue modifies existing payment behavior and its acceptance contract.', questions: [], newCapability: null };
    const markdown = sddConsistencyFixture('payments-source-change', 'specs/payments.md', 'update');
    const responses = [plan, ...(repair ? [{ markdown: markdown.replace('C02 | Policy | G-01 |', 'C02 | Policy | G-99 |') }] : []), { markdown }];
    const admitted: AgentExecutionPlan[] = [], observations: unknown[] = [];
    const cli = new AgentCliClient({ prepare(request) {
        const native = f.planner().prepare({ ...request, cwd: f.root }); admitted.push(native);
        const response = responses.shift(); if (!response) throw new Error('Unexpected extra model call');
        const script = `const fs=require('node:fs'); if(fs.readFileSync('.git/HEAD','utf8').trim()!==${JSON.stringify(f.selected)} || fs.readFileSync('specs/payments.md','utf8')!==${JSON.stringify(f.files['specs/payments.md'].toString())})process.exit(8); else process.stdout.write(${JSON.stringify(JSON.stringify(response))});`;
        return { ...native, executable: process.execPath, launcherArgv: [], argv: ['-e', script], promptMode: 'stdin', outputProtocol: 'plain-text' };
    } }, { observe: fact => { observations.push(fact); } });
    const comments: { id: number; body: string; user: { login: string } }[] = [];
    let labels = ['feature', 'in-progress'];
    const context: PreBranchSddContext = { issueNumber: 42, issueTitle: 'Change payments', issueBody: 'The payment flow must change.',
        issueAuthor: 'alice', admittedKind: 'feature', baseBranch: 'develop', tokenUser: 'copilot[bot]', agentConfiguration: { provider: 'codex', model: 'fixture-model' } };
    const workspace = new PreBranchSddWorkspaceAdapter(f.root);
    const useCase = new PreBranchSddGateUseCase(createFindingsQueryPort({ cli }), workspace,
        { listIssueComments: async () => comments, addComment: async (_issue, body) => { comments.push({ id: 100 + comments.length, body, user: { login: context.tokenUser } }); },
            updateComment: async (_issue, id, body) => { comments.find(comment => comment.id === id)!.body = body; } },
        { getLabels: async () => labels, setLabels: async (_issue, next) => { labels = [...next]; } },
        { isActorAllowedToModifyFiles: async () => true, isActorAllowedToUseMemberOnlyAutomation: async () => true },
        { getDescription: async () => context.issueBody }, { getTitle: async () => context.issueTitle } as never,
        { getLinkedBranch: async () => ({ name: branch, headSha: f.selected }) });
    try {
        const before = f.outerFacts(); expect(existsSync(join(f.root, 'specs/payments.md'))).toBe(false);
        const draft = await useCase.begin(context);
        if (draft.status !== 'drafted') throw new Error(JSON.stringify({ results: draft.results, errors, calls: admitted.length }));
        const phases = repair ? ['analysis', 'draft', 'draft'] : ['analysis', 'draft'];
        expect(admitted).toHaveLength(phases.length); expect(responses).toHaveLength(0);
        expect(admitted.map(p => p.sourceSnapshot)).toEqual(phases.map(phase => ({ kind: 'pre-branch-sdd', phase, baseSha: f.selected })));
        expect(admitted.every(p => p.workspace !== f.root && p.workspaceMode === 'read-only' && !existsSync(p.runtimeDirectory))).toBe(true);
        expect(f.git('ls-remote', '--heads', 'origin', branch)).toBe(''); expect(f.outerFacts()).toEqual(before);
        expect(observations.filter((fact: any) => fact.state === 'completed')).toHaveLength(phases.length);
        if (!publication) return;
        // Simulate only the Action-owned branch creation in this isolated local-bare fixture.
        f.git('push', 'origin', `${f.selected}:refs/heads/${branch}`);
        const result = await useCase.publish(context, draft, branch);
        expect(result.status).toBe('published'); if (result.status !== 'published') throw new Error('Expected verified local publication');
        expect(f.git('ls-remote', '--heads', 'origin', branch).split(/\s/u)[0]).toBe(result.commitSha);
        expect(git(remote, 'show', `${result.commitSha}:specs/payments.md`)).toContain('payments-source-change-C01');
        expect(f.outerFacts()).toEqual(before);
    } finally {
        if (priorWorkspace === undefined) delete process.env.GITHUB_WORKSPACE; else process.env.GITHUB_WORKSPACE = priorWorkspace;
        resetApplicationLogger();
        f.cleanup();
    }
});
