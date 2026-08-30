import type { Execution } from "../../data/model/execution";
import type { Result } from "../../data/model/result";
import type { ParamUseCase } from "./base/param_usecase";
import type { BugbotAutofixParam } from "./steps/commit/bugbot/bugbot_autofix_use_case";
import type { DoUserRequestParam } from "./steps/commit/user_request_use_case";
import type { GitCommitPort } from "../ports/git_ports";

export interface CommentAutomationOptions {
  taskId: string;
  languageUseCase: ParamUseCase<Execution, Result[]>;
  intentUseCase: ParamUseCase<Execution, Result[]>;
  thinkUseCase: ParamUseCase<Execution, Result[]>;
  autofixUseCase: ParamUseCase<BugbotAutofixParam, Result[]>;
  doUserRequestUseCase: ParamUseCase<DoUserRequestParam, Result[]>;
  userComment: string;
  gitCommitPort: GitCommitPort;
}
