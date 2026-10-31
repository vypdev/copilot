import { runCreateLinkedBranch } from '../../../../data/repository/branch/linked_branch_workflow';
import { GithubManagedPullRequestRepository } from '../../../../data/repository/deployment/github_managed_pull_request_repository';
import { IssueCompletionRepository } from '../../../../data/repository/issue/issue_completion_repository';
import { bindManagedPullRequests } from '../../../../infrastructure/composition/push_single_action_capability_port_binding';
import { bindIssueCompletionMetadata } from '../../../../infrastructure/composition/issue_completion_composition_root';
import { DeploymentMergeEffects, type DeploymentMergeInspection } from '../../../services/deployment_merge_effects';
import { renderPromotionPullRequest } from '../../../policies/deployment_presentation_policy';
import { ReconcileClosedIssueMetadataUseCase } from '../reconcile_closed_issue_metadata_use_case';
import { deploymentOperationFixture } from '../../../../testing/deployment_operation_fixture';
import { DEFAULT_COPILOT_LIFECYCLE_LABELS } from '../../../../domain/copilot_lifecycle';
import { projectClosedIssueCleanupCounts } from '../../../policies/closed_issue_reconciliation_outcome_policy';
import type { GithubDeploymentClient, GithubDeploymentPullRequest } from '../../../../infrastructure/github/ports/github_deployment_provider_port';

const url = 'https://api.github.com/repos/owner/repo';
const binding = { owner: 'owner', repository: 'repo', token: 'synthetic-token' };
const inspection: Extract<DeploymentMergeInspection, { kind: 'ready' }> = { kind: 'ready',
    decision: { kind: 'mode', mode: 'auto-merge', reasonCode: 'auto-merge-available' },
    capabilities: { autoMergeAllowed: true, immediatelyMergeable: true, requiresStrictStatusChecks: false,
        mergeQueueRequired: false, mergeQueueProducers: [], mergeQueueObservationProblems: [] } };

/** Stateful provider model of documented linked-branch association and merge-time closure. No network or publication. */
function provider(kind: 'release' | 'hotfix', ordinary = false) {
    const operation = deploymentOperationFixture({ kind, sourceBranch: `${kind}/3.4.0`,
        originBranch: kind === 'hotfix' ? 'v3.3.0' : 'develop', phase: 'promotion_pr_pending' });
    let branchLinked = false;
    let closing = false;
    let sticky = false;
    let issueClosed = false;
    let projectStatus = 'In progress';
    const events: string[] = [];
    const labels = new Set(['55%', 'state:working', kind]);
    let pull: GithubDeploymentPullRequest;
    const graphql = jest.fn(async (query: string, variables: Record<string, unknown>) => {
        if (query.includes('createLinkedBranch(input:')) {
            branchLinked = true; events.push('linked-branch-created');
            return { createLinkedBranch: { linkedBranch: { id: 'LB_355', ref: { name: operation.sourceBranch } } } };
        }
        if (query.includes('removeCloseIssueReferences(input:')) {
            expect(variables).toEqual({ issueId: 'I_355', pullRequestIds: ['PR_40'] });
            if (!sticky) closing = false; events.push('closing-reference-removed');
            return { removeCloseIssueReferences: { issue: { id: 'I_355', number: 355 } } };
        }
        if (query.includes('query DeploymentIssueCompletion')) return { repository: { nameWithOwner: 'owner/repo',
            issue: { id: 'I_355', number: 355 }, pullRequest: { id: pull.node_id, number: pull.number, state: pull.state === 'closed' ? 'CLOSED' : 'OPEN',
                body: pull.body, headRefName: pull.head.ref, headRefOid: pull.head.sha, baseRefName: pull.base.ref,
                headRepository: { nameWithOwner: 'owner/repo' }, closingIssuesReferences: {
                    nodes: closing ? [{ number: 355, repository: { nameWithOwner: 'owner/repo' } }] : [],
                    pageInfo: { hasNextPage: false, endCursor: null } } } } };
        return { repository: { id: 'R_1', issue: { id: 'I_355' }, ref: { target: { oid: 'b'.repeat(40) } } } };
    });
    const create = jest.fn(async (command: Record<string, unknown>) => {
        closing = branchLinked; events.push('promotion-created-with-native-closing-reference');
        pull = { number: 40, node_id: 'PR_40', body: String(command.body), state: 'open', merged: false, auto_merge: null,
            head: { ref: String(command.head), sha: operation.sourceSha, repo: { full_name: 'owner/repo' } },
            base: { ref: String(command.base), repo: { full_name: 'owner/repo' } } };
        return { data: pull };
    });
    const merge = jest.fn(async () => {
        pull = { ...pull, state: 'closed', merged: true, merge_commit_sha: 'c'.repeat(40) };
        if (closing) { issueClosed = true; projectStatus = 'Done'; events.push('provider-closed-issue-before-handler'); }
        return { data: { merged: true, sha: 'c'.repeat(40) } };
    });
    const issueGet = jest.fn(async () => ({ url: `${url}/issues/355`, data: { number: 355,
        repository_url: url, state: issueClosed ? 'closed' : 'open', state_reason: issueClosed ? 'completed' : null,
        labels: [...labels], body: ordinary ? 'Human issue' : `<!-- copilot-configuration-start\n${JSON.stringify({ schemaVersion: 3, deploymentOrchestration: operation })}\ncopilot-configuration-end -->` } }));
    const client = { graphql, rest: { pulls: { create, merge }, issues: { get: issueGet,
        update: jest.fn(), addLabels: jest.fn(async (request: { labels: string[] }) => { request.labels.forEach(label => labels.add(label)); }),
        removeLabel: jest.fn(async (request: { name: string }) => { labels.delete(request.name); }) } } };
    const repository = new GithubManagedPullRequestRepository({ getClient: () => client as unknown as GithubDeploymentClient });
    const port = bindManagedPullRequests(repository, binding);
    const metadata = new ReconcileClosedIssueMetadataUseCase(bindIssueCompletionMetadata(new IssueCompletionRepository(
        { getClient: () => client as never }, { ...binding, apiBaseUrl: 'https://api.github.com' })));
    return { operation, port, events, merge, metadata, labels, setSticky: () => { sticky = true; },
        state: () => ({ issueClosed, projectStatus, closing }),
        prepare: async () => {
            const branch = await runCreateLinkedBranch({ getClient: () => client as never }, 'owner', 'repo',
                kind === 'release' ? 'develop' : 'refs/tags/v3.3.0', operation.sourceBranch, 355, undefined, binding.token);
            expect(branch.at(-1)?.success).toBe(true);
            const content = ordinary ? { title: 'Ordinary work', body: 'Implements ordinary work' }
                : renderPromotionPullRequest(operation, { owner: 'owner', repository: 'repo', issue: 355,
                    repositoryLocale: 'en-US', issueLocale: 'en-US', pullRequestLocale: 'en-US' });
            expect(content.body).not.toMatch(/(?:closes|resolves|fixes)\s+#355/iu);
            return port.createManagedPullRequest({ operationId: operation.operationId, phase: 'promotion', issue: 355,
                headBranch: operation.sourceBranch, baseBranch: 'master', ...content });
        } };
}

it.each(['release', 'hotfix'] as const)('keeps a %s launcher open before the closed handler despite native branch association', async kind => {
    const legacy = provider(kind); const oldPull = await legacy.prepare();
    // This is the former merge effect, with its absent completion preparation represented explicitly.
    await new DeploymentMergeEffects({ ...legacy.port, prepareIssueCompletion: async () => undefined })
        .configure(legacy.operation, oldPull, inspection, jest.fn(), jest.fn());
    expect(legacy.state().issueClosed).toBe(true);
    expect(legacy.events.at(-1)).toBe('provider-closed-issue-before-handler');

    const current = provider(kind); const pull = await current.prepare();
    expect(current.state().closing).toBe(true);
    await new DeploymentMergeEffects(current.port).configure(current.operation, pull, inspection, jest.fn(), jest.fn());
    expect(current.state()).toEqual({ issueClosed: false, projectStatus: 'In progress', closing: false });
    expect(current.operation.publicationVerified).toBe(false); expect(current.operation.reconciliationTargets).toEqual([]);
    const result = await current.metadata.invoke({ issueNumber: 355,
        completionLabels: { lifecycle: DEFAULT_COPILOT_LIFECYCLE_LABELS, protectedLabels: [] } });
    expect(result[0]).toMatchObject({ success: true, executed: false, payload: { issueCompletion: { outcome: 'deferred' } } });
    expect(projectClosedIssueCleanupCounts(result)).toEqual({ status: 'absent' });
    expect(current.labels.has('100%')).toBe(false); expect(current.merge).toHaveBeenCalledTimes(1);
});
it('blocks native merge if its launcher closing relationship cannot be removed', async () => {
    const current = provider('release'); const pull = await current.prepare(); current.setSticky();
    await expect(new DeploymentMergeEffects(current.port).configure(current.operation, pull, inspection, jest.fn(), jest.fn()))
        .rejects.toMatchObject({ code: 'provider.conflict' });
    expect(current.merge).not.toHaveBeenCalled(); expect(current.state().issueClosed).toBe(false);
});
it('preserves normal native auto-closure and 100% metadata for an ordinary linked issue', async () => {
    const ordinary = provider('release', true); const pull = await ordinary.prepare();
    await ordinary.port.mergePullRequest(pull.number, pull.headSha);
    expect(ordinary.state().issueClosed).toBe(true);
    const results = await ordinary.metadata.invoke({ issueNumber: 355,
        completionLabels: { lifecycle: DEFAULT_COPILOT_LIFECYCLE_LABELS, protectedLabels: [] } });
    expect(results[0].success).toBe(true); expect(ordinary.labels.has('100%')).toBe(true);
    expect(ordinary.state().projectStatus).toBe('Done');
});
