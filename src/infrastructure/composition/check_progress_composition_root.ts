import { createBranchClient } from './github_branch_client_factory';
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
import type { RepositoryCredentialBinding } from './shared_capability_port_binding';
import { bindIssueDescriptionQuery } from './shared_capability_port_binding';
import { bindIssueLabels } from './lifecycle_capability_port_binding';
import { bindBranchListQuery, bindIssueProgress, bindPullRequestBranchQuery } from './push_single_action_capability_port_binding';

export function createCheckProgressCompositionRoot(binding: RepositoryCredentialBinding): CheckProgressUseCase {
    const labels = new IssueLabelRepository(createIssueLabelsClient());
    const content = new IssueContentRepository(createIssueContentClient());
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
    );
}
