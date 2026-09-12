import type { Execution } from '../../data/model/execution';
import type { Result } from '../../data/model/result';
import type { ParamUseCase } from './base/param_usecase';
import type { CheckPermissionsContext } from './steps/common/check_permissions_workflow';
import type { UpdateTitleContext } from './steps/common/update_title_workflow';
import type { ProjectContentLinkContext } from './steps/common/project_content_link_workflow';

export interface IssueWorkflowSteps {
  checkPermissions: ParamUseCase<CheckPermissionsContext, Result[]>;
  closeNotAllowedIssue: ParamUseCase<Execution, Result[]>;
  removeIssueBranches: ParamUseCase<Execution, Result[]>;
  assignMemberToIssue: ParamUseCase<Execution, Result[]>;
  updateTitle: ParamUseCase<UpdateTitleContext, Result[]>;
  updateIssueType: ParamUseCase<Execution, Result[]>;
  linkIssueProject: ParamUseCase<ProjectContentLinkContext, Result[]>;
  checkPriorityIssueSize: ParamUseCase<Execution, Result[]>;
  prepareBranches: ParamUseCase<Execution, Result[]>;
  removeNotNeededBranches: ParamUseCase<Execution, Result[]>;
  deployAdded: ParamUseCase<Execution, Result[]>;
}
