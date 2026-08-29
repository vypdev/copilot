import type { Execution } from '../../data/model/execution';
import type { Result } from '../../data/model/result';
import type { ParamUseCase } from './base/param_usecase';

export interface PullRequestWorkflowSteps {
  updateTitle: ParamUseCase<Execution, Result[]>;
  assignMemberToIssue: ParamUseCase<Execution, Result[]>;
  assignReviewersToIssue: ParamUseCase<Execution, Result[]>;
  linkPullRequestProject: ParamUseCase<Execution, Result[]>;
  linkPullRequestIssue: ParamUseCase<Execution, Result[]>;
  syncSizeAndProgressLabels: ParamUseCase<Execution, Result[]>;
  checkPriorityPullRequestSize: ParamUseCase<Execution, Result[]>;
  closeIssueAfterMerging: ParamUseCase<Execution, Result[]>;
}
