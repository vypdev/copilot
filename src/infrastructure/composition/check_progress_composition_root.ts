import { createProgressSddSeedQuery } from '../../application/usecases/sdd/read_progress_sdd_seed';
import { BugbotIssueCommentQueryRepository } from '../../data/repository/issue/bugbot_issue_comment_query_repository';
import { PreBranchSddWorkspaceAdapter } from '../pre_branch_sdd_workspace_adapter';
import { createGraphqlTransportClient } from './github_project_client_factory';
import { createSddEvidenceReadPorts } from './sdd_evidence_composition_root';
import { ProgressComparisonSourceRepository } from '../../data/repository/progress_comparison_source_repository';
import { bindNativeStatusRead, createIssueCompletionRepository } from './issue_completion_composition_root';
import { ProgressDiffRepository } from '../../data/repository/progress_diff_repository';
import { createBranchClient, createBranchComparisonClient, createProgressObjectClient, createProgressComparisonClient } from './github_branch_client_factory';
import { createIssueContentClient, createIssueLabelsClient } from './github_issue_client_factory';
import { createPullRequestLifecycleClient } from './github_pull_request_client_factory';
import { CheckProgressUseCase } from "../../application/usecases/actions/check_progress_use_case";
import { createFindingsQueryPort } from './agent_capability_composition_root';
import { IssueContentRepository } from "../../data/repository/issue/issue_content_repository";
import { IssueLabelRepository } from "../../data/repository/issue/issue_label_repository";
import { IssueProgressLabelRepository } from "../../data/repository/issue/issue_progress_label_repository";
import { IssueProgressTrackingRepository } from "../../data/repository/issue/issue_progress_tracking_repository";
import { BranchLifecycleRepository } from "../../data/repository/branch_lifecycle_repository";
import { PullRequestLifecycleRepository } from "../../data/repository/pull_request/pull_request_lifecycle_repository";
import { GithubPublicationSourceRepository } from '../../data/repository/github_publication_source_repository';
import type { RepositoryCredentialBinding } from './shared_capability_port_binding';
import { bindIssueCommentQuery, bindIssueDescriptionQuery, bindPublicationSourceQuery } from './shared_capability_port_binding';
import { bindIssueLabels } from './lifecycle_capability_port_binding';
import { bindBranchListQuery, bindIssueProgress, bindPullRequestBranchQuery } from './push_single_action_capability_port_binding';

export function createCheckProgressCompositionRoot(binding: RepositoryCredentialBinding): CheckProgressUseCase {
    const labels = new IssueLabelRepository(createIssueLabelsClient());
    const content = new IssueContentRepository(createIssueContentClient());
    const diff = new ProgressDiffRepository(createBranchComparisonClient(), createProgressObjectClient());
    const issueCompletion = createIssueCompletionRepository(binding);
    const comparisonSource = new ProgressComparisonSourceRepository(createProgressComparisonClient());
    const comments = new BugbotIssueCommentQueryRepository(createGraphqlTransportClient());
    const workspace = new PreBranchSddWorkspaceAdapter(process.cwd(), binding.token);
    const sddReads = createSddEvidenceReadPorts(binding, {
        async listIssueComments(issueNumber) {
            const result = await comments.listBugbotIssueCommentsBounded(binding.owner, binding.repository, issueNumber, binding.token);
            return { value: result.items, coverage: result.coverage };
        },
    }, workspace);
    const repositoryUrl = new URL(`/${binding.owner}/${binding.repository}`, process.env.GITHUB_SERVER_URL ?? 'https://github.com').href;
    return new CheckProgressUseCase(
        bindIssueDescriptionQuery(content, binding),
        bindIssueLabels(labels, binding),
        bindIssueProgress(new IssueProgressTrackingRepository(
            content,
            labels,
            new IssueProgressLabelRepository(new IssueLabelRepository(createIssueLabelsClient())),
        ), binding),
        bindBranchListQuery(new BranchLifecycleRepository(createBranchClient()), binding),
        bindPullRequestBranchQuery(new PullRequestLifecycleRepository(createPullRequestLifecycleClient()), binding),
        createFindingsQueryPort(),
        bindPublicationSourceQuery(new GithubPublicationSourceRepository(createBranchClient()), binding, bindNativeStatusRead(issueCompletion)),
        Object.freeze({ getDiff: (baseSha: string, headSha: string) => diff.getDiff(binding.owner, binding.repository, baseSha, headSha, binding.token) }),
        Object.freeze({ getSource: (branch: string) => comparisonSource.getSource(binding.owner, binding.repository, branch, binding.token) }),
        Object.freeze({
            ...bindIssueCommentQuery(content, binding),
            removeFullProgressLabel: async (issueNumber: number) => {
                const current = await issueCompletion.readIssue(issueNumber);
                if (current.state === 'open' && current.labels.includes('100%')) {
                    await issueCompletion.removeLabel(issueNumber, '100%');
                }
            },
        }),
        createProgressSddSeedQuery({ ...sddReads, workspace }, repositoryUrl),
    );
}
