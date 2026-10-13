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
import type { SddEvidenceQueryPort } from '../ports/sdd_evidence_read_ports';
import type { CopilotStatusReadPorts } from './read_copilot_status_workflow';
import type {
  BugbotFixIntentContext,
  BugbotReviewOperationContext,
} from './steps/commit/bugbot/bugbot_review_operation_context';
import type { CommentLanguageRequest } from './steps/common/comment_language_translation_workflow';
import type { ThinkContext } from './steps/common/think_workflow';
import { projectIssueCommentLanguageRequest } from './steps/issue_comment/check_issue_comment_language_use_case';
import { projectCommentAutomationContext } from './comment_automation_context';
import { projectPullRequestDescriptionContext } from './pull_request_workflow_context';
import { isSddAnswerComment } from '../../domain/pre_branch_sdd';

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
    private readonly rememberBranchPorts?: RememberBranchQueryPorts,
    private readonly statusReadPorts?: CopilotStatusReadPorts,
    private readonly historyReadPort?: CopilotHistoryReadPort,
    private readonly sddQueryPort?: SddEvidenceQueryPort,
    private readonly nativeStatusReadPort?: BoundNativeStatusReadPort,
  ) {}

  async invoke(param: Execution): Promise<Result[]> {
    const historyCommand = parseCopilotCommand(param.issue.commentBody);
    if (historyCommand.kind === 'invalid') return [invalidCommentCommandResult(this.taskId, historyCommand.reason)];
    if (historyCommand.kind === 'command' && historyCommand.command.name === 'history') {
      return [await readCopilotHistory({ owner: param.owner, repository: param.repo,
        target: { kind: 'issue', number: param.issue.number }, queryId: param.issue.commentId,
        botLogin: param.tokenUser ?? '', locale: param.locale.issue,
        generalConversation: param.eventName === 'issue_comment',
      }, this.historyReadPort)];
    }
    if (param.preBranchSdd && !param.issue.issueManagedBranches) {
      return [new Result({
        id: this.taskId, success: false, executed: true,
        steps: ['pre-branch-sdd requires issue-managed-branches; correct the Action configuration.'],
      })];
    }
    if (this.preBranchSddContinuation
      && param.issueStartDecision.sddRequired
      && isSddAnswerComment(param.issue.commentBody)
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
        rememberBranchPorts: this.rememberBranchPorts,
        statusReadPorts: this.statusReadPorts,
        nativeStatusReadPort: this.nativeStatusReadPort,
        sddQueryPort: this.sddQueryPort,
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
