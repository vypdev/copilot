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

export function createCheckProgressCompositionRoot(): CheckProgressUseCase {
    const labels = new IssueLabelRepository(createIssueLabelsClient());
    return new CheckProgressUseCase(
        new IssueProgressTrackingRepository(
            new IssueContentRepository(createIssueContentClient()),
            labels,
            new IssueProgressLabelRepository(new IssueLabelRepository(createIssueLabelsClient())),
        ),
        new BranchLifecycleRepository(createBranchClient()),
        new PullRequestLifecycleRepository(createPullRequestLifecycleClient()),
        createFindingsQueryPort(),
    );
}
