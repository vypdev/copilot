import type { Result } from '../../data/model/result';
import type { ParamUseCase } from './base/param_usecase';
import type { CheckPermissionsContext } from './steps/common/check_permissions_workflow';
import type { UpdateTitleContext } from './steps/common/update_title_workflow';
import type { ProjectContentLinkContext } from './steps/common/project_content_link_workflow';
import type {
  AssignmentContext,
  BranchPreparationContext,
  BranchPreparationOutcome,
  DeployAddedContext,
  IssueNumberContext,
  PrioritySizeContext,
  RemoveIssueBranchesContext,
  RemoveObsoleteIssueBranchesContext,
  UpdateIssueTypeContext,
} from './issue_workflow_context';

export interface IssueWorkflowSteps {
  checkPermissions: ParamUseCase<CheckPermissionsContext, Result[]>;
  closeNotAllowedIssue: ParamUseCase<IssueNumberContext, Result[]>;
  removeIssueBranches: ParamUseCase<RemoveIssueBranchesContext, Result[]>;
  assignMemberToIssue: ParamUseCase<AssignmentContext, Result[]>;
  updateTitle: ParamUseCase<UpdateTitleContext, Result[]>;
  updateIssueType: ParamUseCase<UpdateIssueTypeContext, Result[]>;
  linkIssueProject: ParamUseCase<ProjectContentLinkContext, Result[]>;
  checkPriorityIssueSize: ParamUseCase<PrioritySizeContext, Result[]>;
  prepareBranches: ParamUseCase<BranchPreparationContext, BranchPreparationOutcome>;
  removeNotNeededBranches: ParamUseCase<RemoveObsoleteIssueBranchesContext, Result[]>;
  deployAdded: ParamUseCase<DeployAddedContext, Result[]>;
}
