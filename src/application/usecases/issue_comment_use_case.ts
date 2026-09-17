import { Execution } from "../../data/model/execution";
import { Result } from "../../data/model/result";
import { ParamUseCase } from "./base/param_usecase";
import { runCommentAutomation } from "./comment_automation_use_case";
import type { BugbotAutofixParam } from "./steps/commit/bugbot/bugbot_autofix_use_case";
import type { DoUserRequestParam } from "./steps/commit/user_request_use_case";
import type { ActorAuthorizationPort } from "../ports/actor_authorization_ports";
import type { DismissBugbotFindingsParam } from './steps/commit/bugbot/dismiss_bugbot_findings_use_case';
import type { UpdatePullRequestDescriptionUseCase } from './steps/pull_request/update_pull_request_description_use_case';
import type { RememberBugbotRuleParam } from './steps/commit/bugbot/remember_bugbot_rule_use_case';
import type { SyncBranchRequest } from './branch_sync/sync_branch_use_case';
import type { BugbotGitMutationPort } from '../ports/bugbot_git_ports';
import type {
  BugbotFixIntentContext,
  BugbotReviewOperationContext,
} from './steps/commit/bugbot/bugbot_review_operation_context';
import type { CommentLanguageRequest } from './steps/common/comment_language_translation_workflow';
import type { ThinkContext } from './steps/common/think_workflow';
import { projectIssueCommentLanguageRequest } from './steps/issue_comment/check_issue_comment_language_use_case';
import { projectCommentAutomationContext } from './comment_automation_context';
import { projectPullRequestDescriptionContext } from './pull_request_workflow_context';

export class IssueCommentUseCase implements ParamUseCase<Execution, Result[]> {
  taskId = "IssueCommentUseCase";

  constructor(
    private readonly languageUseCase: ParamUseCase<CommentLanguageRequest, Result[]>,
    private readonly intentUseCase: ParamUseCase<BugbotFixIntentContext, Result[]>,
    private readonly thinkUseCase: ParamUseCase<ThinkContext, Result[]>,
    private readonly autofixUseCase: ParamUseCase<BugbotAutofixParam, Result[]>,
    private readonly doUserRequestUseCase: ParamUseCase<
      DoUserRequestParam,
      Result[]
    >,
    private readonly actorAuthorizationPort: ActorAuthorizationPort,
    private readonly bugbotGitMutationPort: BugbotGitMutationPort,
    private readonly dismissBugbotFindingsUseCase?: ParamUseCase<DismissBugbotFindingsParam, Result[]>,
    private readonly reviewPotentialProblemsUseCase?: ParamUseCase<BugbotReviewOperationContext, Result[]>,
    private readonly updatePullRequestDescriptionUseCase?: UpdatePullRequestDescriptionUseCase,
    private readonly rememberBugbotRuleUseCase?: ParamUseCase<RememberBugbotRuleParam, Result[]>,
    private readonly syncBranchUseCase?: ParamUseCase<SyncBranchRequest, Result[]>,
    private readonly preBranchSddContinuation?: ParamUseCase<Execution, Result[]>,
  ) {}

  async invoke(param: Execution): Promise<Result[]> {
    if (param.preBranchSdd && !param.issue.issueManagedBranches) {
      return [new Result({
        id: this.taskId, success: false, executed: true,
        steps: ['pre-branch-sdd requires issue-managed-branches; correct the Action configuration.'],
      })];
    }
    if (this.preBranchSddContinuation
      && param.issueStartDecision.sddRequired
      && /^\s*SDD\s+Q[1-8]:/im.test(param.issue.commentBody)
      && param.issue.commentAuthor.toLowerCase() !== param.tokenUser?.toLowerCase()) {
      return this.preBranchSddContinuation.invoke(param);
    }
    const context = projectCommentAutomationContext(
      param,
      projectIssueCommentLanguageRequest(param),
      param.issue.commentBody ?? '',
    );
    return runCommentAutomation(
      context,
      {
        taskId: this.taskId,
        languageUseCase: this.languageUseCase,
        intentUseCase: this.intentUseCase,
        thinkUseCase: this.thinkUseCase,
        autofixUseCase: this.autofixUseCase,
        doUserRequestUseCase: {
          invoke: (request) => this.doUserRequestUseCase.invoke({ context: context.userRequest, ...request }),
        },
        bugbotGitMutationPort: this.bugbotGitMutationPort,
        dismissBugbotFindingsUseCase: this.dismissBugbotFindingsUseCase,
        reviewPotentialProblemsUseCase: this.reviewPotentialProblemsUseCase,
        updatePullRequestDescriptionUseCase: this.updatePullRequestDescriptionUseCase
          ? { invoke: () => this.updatePullRequestDescriptionUseCase!.invoke({
              context: projectPullRequestDescriptionContext(param),
              trigger: 'authorized-command',
            }) }
          : undefined,
        rememberBugbotRuleUseCase: this.rememberBugbotRuleUseCase,
        syncBranchUseCase: this.syncBranchUseCase
          ? { invoke: (options) => this.syncBranchUseCase!.invoke({ context: context.branchSync, options }) }
          : undefined,
      },
      {
        isActorAllowedToModifyFiles: (actor) => this.actorAuthorizationPort.isActorAllowedToModifyFiles(
          param.owner,
          param.repo,
          actor,
          param.tokens.token,
        ),
      },
    );
  }
}
