import type { Execution } from '../../data/model/execution';
import type { Result } from '../../data/model/result';
import type { ParamUseCase } from './base/param_usecase';
import type { UpdateTitleContext } from './steps/common/update_title_workflow';
import type { ProjectContentLinkContext } from './steps/common/project_content_link_workflow';

export interface PullRequestWorkflowSteps {
  updateTitle: ParamUseCase<UpdateTitleContext, Result[]>;
  assignMemberToIssue: ParamUseCase<Execution, Result[]>;
  assignReviewersToIssue: ParamUseCase<Execution, Result[]>;
  linkPullRequestProject: ParamUseCase<ProjectContentLinkContext, Result[]>;
  linkPullRequestIssue: ParamUseCase<Execution, Result[]>;
  syncSizeAndProgressLabels: ParamUseCase<Execution, Result[]>;
  checkPriorityPullRequestSize: ParamUseCase<Execution, Result[]>;
  closeIssueAfterMerging: ParamUseCase<Execution, Result[]>;
}
