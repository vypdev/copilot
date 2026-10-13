import { invalidCommentCommandResult } from './comment_automation_command_workflow';
import { parseCopilotCommand } from '../../domain/copilot_command';
import { readCopilotHistory } from './read_copilot_history_workflow';
import type { CopilotHistoryReadPort } from '../ports/copilot_history_ports';
import type { BoundNativeStatusReadPort } from '../ports/issue_completion_ports';
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
import type { RememberBranchQueryPorts } from './comment_automation_contracts';
import type { CopilotStatusReadPorts } from './read_copilot_status_workflow';
import type {
  BugbotFixIntentContext,
  BugbotReviewOperationContext,
} from './steps/commit/bugbot/bugbot_review_operation_context';
import type { CommentLanguageRequest } from './steps/common/comment_language_translation_workflow';
import type { ThinkContext } from './steps/common/think_workflow';
import { projectPullRequestCommentLanguageRequest } from './steps/pull_request_review_comment/check_pull_request_comment_language_use_case';
import { projectCommentAutomationContext } from './comment_automation_context';
import { projectPullRequestDescriptionContext } from './pull_request_workflow_context';

export class PullRequestReviewCommentUseCase implements ParamUseCase<
  Execution,
  Result[]
> {
  taskId = "PullRequestReviewCommentUseCase";

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
    private readonly rememberBranchPorts?: RememberBranchQueryPorts,
    private readonly statusReadPorts?: CopilotStatusReadPorts,
    private readonly historyReadPort?: CopilotHistoryReadPort,
    private readonly nativeStatusReadPort?: BoundNativeStatusReadPort,
  ) {}

  async invoke(param: Execution): Promise<Result[]> {
    const historyCommand = parseCopilotCommand(param.pullRequest.commentBody);
    if (historyCommand.kind === 'invalid') return [invalidCommentCommandResult(this.taskId, historyCommand.reason)];
    if (historyCommand.kind === 'command' && historyCommand.command.name === 'history') {
      return [await readCopilotHistory({ owner: param.owner, repository: param.repo,
        target: { kind: 'pr', number: param.pullRequest.number }, queryId: param.pullRequest.commentId,
        botLogin: param.tokenUser ?? '', locale: param.locale.pullRequest,
        generalConversation: param.eventName === 'issue_comment',
      }, this.historyReadPort)];
    }
    const context = projectCommentAutomationContext(
      param,
      projectPullRequestCommentLanguageRequest(param),
      param.pullRequest.commentBody ?? '',
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
        rememberBranchPorts: this.rememberBranchPorts,
        statusReadPorts: this.statusReadPorts,
        nativeStatusReadPort: this.nativeStatusReadPort,
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
        isActorAllowedToUseMemberOnlyAutomation: (actor) => this.actorAuthorizationPort.isActorAllowedToUseMemberOnlyAutomation(
          param.owner,
          param.repo,
          actor,
          param.tokens.token,
        ),
      },
    );
  }
}
