import type { Execution } from "../../data/model/execution";
import type { Result } from "../../data/model/result";
import type { ParamUseCase } from "./base/param_usecase";
import type { BugbotAutofixParam } from "./steps/commit/bugbot/bugbot_autofix_use_case";
import type { DoUserRequestParam } from "./steps/commit/user_request_use_case";
import type { GitCommitPort } from "../ports/git_ports";
import type { DismissBugbotFindingsParam } from './steps/commit/bugbot/dismiss_bugbot_findings_use_case';

export interface CommentAutomationOptions {
  taskId: string;
  languageUseCase: ParamUseCase<Execution, Result[]>;
  intentUseCase: ParamUseCase<Execution, Result[]>;
  thinkUseCase: ParamUseCase<Execution, Result[]>;
  autofixUseCase: ParamUseCase<BugbotAutofixParam, Result[]>;
  doUserRequestUseCase: ParamUseCase<DoUserRequestParam, Result[]>;
  /** Optional read-only review route used by /copilot review/findings/recheck. */
  reviewPotentialProblemsUseCase?: ParamUseCase<Execution, Result[]>;
  userComment: string;
  gitCommitPort: GitCommitPort;
  dismissBugbotFindingsUseCase?: ParamUseCase<DismissBugbotFindingsParam, Result[]>;
}
