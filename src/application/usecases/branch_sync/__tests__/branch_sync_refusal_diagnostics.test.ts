import type { Execution } from '../../../../data/model/execution';
import { ApplicationError } from '../../../errors/application_error';
import { renderApplicationErrorMarkdown } from '../../../policies/application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../../../policies/application_error_message_catalog';
import { projectBranchSyncContext } from '../../push_single_action_contexts';
import { branchSyncConflictEligibilityFailure, failedBranchSyncResult } from '../branch_sync_execution_policy';
import { SyncBranchUseCase } from '../sync_branch_use_case';

const originalPaths = ['.github/workflows/ci_check.yml', 'docs/architecture.md', 'docs/roadmap.md', 'docs/user-guide.md',
    'frontend/playwright.entry.config.ts', 'frontend/src/composition/entry-page.ts', 'frontend/src/presentation/domus-app.ts',
    'frontend/tests/page.test.ts', 'tests/containers/test_app_ui.py', 'tests/packaging/test_ui_wheel.py'];
const configuration = { provider: 'codex' as const, model: 'fixture' };
const preparation = (paths: readonly string[]) => ({ kind: 'conflicted' as const, parentSha: 'b'.repeat(40), childSha: 'a'.repeat(40), conflictPaths: paths });
const refusal = (paths: readonly string[]) => branchSyncConflictEligibilityFailure(preparation(paths), true, configuration)!;
const tooMany = Array.from({ length: 21 }, (_, index) => `src/${index}.ts`);
const options = { dryRun: false, useAgent: true };
function fixture(paths: readonly string[]) {
    const context = projectBranchSyncContext({ owner: 'org', repo: 'repo', tokens: { token: 'fixture' }, issue: { number: 42 },
        pullRequest: { number: -1 }, issueNumber: 42, ai: { getAgentConfiguration: () => configuration,
            getBugbotFixVerifyCommands: () => ['pnpm test'] } } as unknown as Execution);
    const dependencies = { resolveTarget: jest.fn().mockResolvedValue({ issueNumber: 42, conversationNumber: 42, parentBranch: 'develop', workingBranch: 'feature/42' }), listOpenDependencies: jest.fn() };
    const workspace = { prepare: jest.fn().mockResolvedValue(preparation(paths)), validatePreparedMerge: jest.fn().mockResolvedValue({ valid: true }),
        assertRemoteHeadsUnchanged: jest.fn().mockResolvedValue({ valid: true }), commitAndPush: jest.fn().mockResolvedValue('c'.repeat(40)), abort: jest.fn().mockResolvedValue(undefined) };
    const fixer = { fix: jest.fn().mockResolvedValue({ text: 'resolved' }) };
    const author = { getUserDetails: jest.fn().mockResolvedValue({ name: 'Fixture', email: 'fixture@example.com' }) };
    const git = { execute: jest.fn().mockResolvedValue(0) };
    const useCase = new SyncBranchUseCase(dependencies, workspace, fixer, author as never, git as never);
    return { context, workspace, fixer, author, git, useCase };
}

it('refusal-C01: preserves the actual ten-path Domus workflow refusal as closed facts', () => {
    expect(refusal(originalPaths).recovery).toEqual({ id: 'branch-sync-sensitive-paths', variables: {
        command: '/copilot sync-branch', conflictCount: 10, sensitiveCount: 1 } });
});
it('refusal-C02: reports the automated conflict limit before invoking a fixer', () => {
    expect(refusal(tooMany).recovery).toEqual({ id: 'branch-sync-conflict-limit', variables: {
        command: '/copilot sync-branch', conflictCount: 21, limit: 20 } });
});
it('refusal-C03: keeps disabled-agent and missing-configuration precedence', () => {
    expect(branchSyncConflictEligibilityFailure(preparation(originalPaths), false, configuration)?.recovery?.id).toBe('branch-sync-agent-disabled');
    expect(branchSyncConflictEligibilityFailure(preparation(originalPaths), true, { provider: 'codex', model: '' })?.recovery?.id).toBe('branch-sync-fixer-unavailable');
});
it('refusal-C04: exposes counts without serializing private sensitive paths', () => {
    const failure = refusal(['src/ok.ts', 'private/PRIVATE_SECRET.key']);
    const result = failedBranchSyncResult(failure.reason, undefined, failure.recovery);
    expect(result.errors[0].recovery).toMatchObject({ variables: { conflictCount: 2, sensitiveCount: 1 } });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_SECRET');
});
it('refusal-C05: renders complete English and Spanish actions without recommending unchanged retries', () => {
    for (const paths of [originalPaths, tooMany]) {
        const failure = refusal(paths), error = failedBranchSyncResult(failure.reason, undefined, failure.recovery).errors[0];
        expect(error.retryable).toBe(false);
        for (const locale of ['en-US', 'es-ES']) {
            const view = renderApplicationErrorMarkdown(error, resolveStaticApplicationErrorCatalog(locale).message);
            expect(view).toContain('/copilot sync-branch'); expect(view).toContain(String(paths.length));
            expect(view).toMatch(locale === 'en-US' ? /protected|limit/iu : /protegid|límite/iu);
            expect(view).not.toMatch(/\{\w+\}|PRIVATE_SECRET/u);
        }
    }
});
it('refusal-C06: rejects forged counts, unknown operands and arbitrary commands before formatting', () => {
    const sensitive = { command: '/copilot sync-branch', conflictCount: 10, sensitiveCount: 1 };
    const limit = { command: '/copilot sync-branch', conflictCount: 21, limit: 20 };
    for (const [id, variables] of [
        ['branch-sync-sensitive-paths', { ...sensitive, command: '/PRIVATE' }],
        ...[0, -1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '10'].map(conflictCount => ['branch-sync-sensitive-paths', { ...sensitive, conflictCount }]),
        ...[0, 11, 0.5, '1'].map(sensitiveCount => ['branch-sync-sensitive-paths', { ...sensitive, sensitiveCount }]),
        ['branch-sync-sensitive-paths', { ...sensitive, rawPath: 'PRIVATE' }],
        ['branch-sync-conflict-limit', { ...limit, command: '/PRIVATE' }],
        ['branch-sync-conflict-limit', { ...limit, conflictCount: 20 }],
        ['branch-sync-conflict-limit', { ...limit, limit: 21 }],
    ]) expect(() => new ApplicationError('workflow.failed', 'Safe', { recovery: { id, variables } as never })).toThrow(TypeError);
});
it('refusal-C07: aborts ineligible merges without agent, verifier, author lookup or publication', async () => {
    for (const paths of [originalPaths, tooMany]) {
        const f = fixture(paths), [result] = await f.useCase.invoke({ context: f.context, options });
        expect(result.success).toBe(false); expect(result.errors[0].recovery).toEqual(refusal(paths).recovery);
        expect(result.errors[0].retryable).toBe(false); expect(f.workspace.abort).toHaveBeenCalledTimes(1);
        expect(f.fixer.fix).not.toHaveBeenCalled(); expect(f.git.execute).not.toHaveBeenCalled();
        expect(f.author.getUserDetails).not.toHaveBeenCalled(); expect(f.workspace.commitAndPush).not.toHaveBeenCalled();
    }
});
it('refusal-C08: accepts a fresh eligible twenty-path set through the existing verification and publication fences', async () => {
    const f = fixture(tooMany.slice(0, 20)), [result] = await f.useCase.invoke({ context: f.context, options });
    expect(result.success).toBe(true); expect(f.fixer.fix).toHaveBeenCalledTimes(1);
    expect(f.git.execute).toHaveBeenCalled(); expect(f.workspace.assertRemoteHeadsUnchanged).toHaveBeenCalled();
    expect(f.workspace.commitAndPush).toHaveBeenCalledTimes(1); expect(f.workspace.abort).not.toHaveBeenCalled();
});
