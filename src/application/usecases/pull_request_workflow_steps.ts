import type { Result } from '../../data/model/result';
import type { ParamUseCase } from './base/param_usecase';
import type { UpdateTitleContext } from './steps/common/update_title_workflow';
import type { ProjectContentLinkContext } from './steps/common/project_content_link_workflow';
import type {
  AssignmentContext,
  CloseIssueAfterMergeContext,
  PrioritySizeContext,
} from './issue_workflow_context';
import type {
  AssignReviewersContext,
  LinkPullRequestIssueContext,
  SyncPullRequestLabelsContext,
} from './pull_request_workflow_context';

export interface PullRequestWorkflowSteps {
  updateTitle: ParamUseCase<UpdateTitleContext, Result[]>;
  assignMemberToIssue: ParamUseCase<AssignmentContext, Result[]>;
  assignReviewersToIssue: ParamUseCase<AssignReviewersContext, Result[]>;
  linkPullRequestProject: ParamUseCase<ProjectContentLinkContext, Result[]>;
  linkPullRequestIssue: ParamUseCase<LinkPullRequestIssueContext, Result[]>;
  syncSizeAndProgressLabels: ParamUseCase<SyncPullRequestLabelsContext, Result[]>;
  checkPriorityPullRequestSize: ParamUseCase<PrioritySizeContext, Result[]>;
  closeIssueAfterMerging: ParamUseCase<CloseIssueAfterMergeContext, Result[]>;
}
