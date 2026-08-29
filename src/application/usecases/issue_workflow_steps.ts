import type { Execution } from '../../data/model/execution';
import type { Result } from '../../data/model/result';
import type { ParamUseCase } from './base/param_usecase';

export interface IssueWorkflowSteps {
  checkPermissions: ParamUseCase<Execution, Result[]>;
  closeNotAllowedIssue: ParamUseCase<Execution, Result[]>;
  removeIssueBranches: ParamUseCase<Execution, Result[]>;
  assignMemberToIssue: ParamUseCase<Execution, Result[]>;
  updateTitle: ParamUseCase<Execution, Result[]>;
  updateIssueType: ParamUseCase<Execution, Result[]>;
  linkIssueProject: ParamUseCase<Execution, Result[]>;
  checkPriorityIssueSize: ParamUseCase<Execution, Result[]>;
  prepareBranches: ParamUseCase<Execution, Result[]>;
  removeNotNeededBranches: ParamUseCase<Execution, Result[]>;
  deployAdded: ParamUseCase<Execution, Result[]>;
  deployedAdded: ParamUseCase<Execution, Result[]>;
}
