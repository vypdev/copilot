import { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { ParamUseCase } from "./base/param_usecase";
import type { BugbotAutofixParam } from "./steps/commit/bugbot/bugbot_autofix_use_case";
import type { DoUserRequestParam } from "./steps/commit/user_request_use_case";
import type { AuthenticatedUserPort } from "../ports/authenticated_user_ports";
import type { ActorAuthorizationPort } from "../ports/actor_authorization_ports";
import type { BugbotFindingResolutionPorts } from "../ports/bugbot_finding_resolution_ports";
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
export declare function runCommentAutomation(param: Execution, options: CommentAutomationOptions, actorAuthorizationPort: ActorAuthorizationPort, authenticatedUserPort: AuthenticatedUserPort, bugbotResolutionPorts: BugbotFindingResolutionPorts): Promise<Result[]>;
