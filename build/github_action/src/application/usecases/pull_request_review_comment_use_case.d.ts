import { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { ParamUseCase } from "./base/param_usecase";
import type { BugbotAutofixParam } from "./steps/commit/bugbot/bugbot_autofix_use_case";
import type { DoUserRequestParam } from "./steps/commit/user_request_use_case";
import type { IssueCommentUpdatePort } from "../ports/issue_lifecycle_ports";
import type { AuthenticatedUserPort } from "../ports/authenticated_user_ports";
import type { ActorAuthorizationPort } from "../ports/actor_authorization_ports";
import type { GitCommitPort } from "../ports/git_ports";
import type { DismissBugbotFindingsParam } from './steps/commit/bugbot/dismiss_bugbot_findings_use_case';
import type { UpdatePullRequestDescriptionUseCase } from './steps/pull_request/update_pull_request_description_use_case';
export declare class PullRequestReviewCommentUseCase implements ParamUseCase<Execution, Result[]> {
    private readonly languageUseCase;
    private readonly intentUseCase;
    private readonly thinkUseCase;
    private readonly autofixUseCase;
    private readonly doUserRequestUseCase;
    private readonly issueCommentUpdatePort;
    private readonly actorAuthorizationPort;
    private readonly authenticatedUserPort;
    private readonly gitCommitPort;
    private readonly dismissBugbotFindingsUseCase?;
    private readonly reviewPotentialProblemsUseCase?;
    private readonly updatePullRequestDescriptionUseCase?;
    taskId: string;
    constructor(languageUseCase: ParamUseCase<Execution, Result[]>, intentUseCase: ParamUseCase<Execution, Result[]>, thinkUseCase: ParamUseCase<Execution, Result[]>, autofixUseCase: ParamUseCase<BugbotAutofixParam, Result[]>, doUserRequestUseCase: ParamUseCase<DoUserRequestParam, Result[]>, issueCommentUpdatePort: IssueCommentUpdatePort, actorAuthorizationPort: ActorAuthorizationPort, authenticatedUserPort: AuthenticatedUserPort, gitCommitPort: GitCommitPort, dismissBugbotFindingsUseCase?: ParamUseCase<DismissBugbotFindingsParam, Result[]> | undefined, reviewPotentialProblemsUseCase?: ParamUseCase<Execution, Result[]> | undefined, updatePullRequestDescriptionUseCase?: UpdatePullRequestDescriptionUseCase | undefined);
    invoke(param: Execution): Promise<Result[]>;
}
