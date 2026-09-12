import type { Result } from "../../data/model/result";
import type { ParamUseCase } from "./base/param_usecase";
import type { BugbotAutofixParam } from "./steps/commit/bugbot/bugbot_autofix_use_case";
import type { DismissBugbotFindingsParam } from './steps/commit/bugbot/dismiss_bugbot_findings_use_case';
import type { RememberBugbotRuleParam } from './steps/commit/bugbot/remember_bugbot_rule_use_case';
import type { BugbotGitMutationPort } from '../ports/bugbot_git_ports';
import type { BranchSyncCommandOptions } from '../../domain/branch_sync_command';
import type { CommentLanguageRequest } from './steps/common/comment_language_translation_workflow';
import type { ThinkContext } from './steps/common/think_workflow';
import type {
  BugbotFixIntentContext,
  BugbotReviewOperationContext,
} from './steps/commit/bugbot/bugbot_review_operation_context';

export interface ExplicitPullRequestDescriptionUseCase {
  invoke(): Promise<Result[]>;
}

export interface CommentUserRequest {
  readonly userComment: string;
  readonly branchOverride?: string;
}

export interface CommentCapability<TInput> {
  readonly taskId?: string;
  invoke(input: TInput): Promise<Result[]>;
}

export interface CommentAutomationOptions {
  readonly taskId: string;
  readonly languageUseCase: ParamUseCase<CommentLanguageRequest, Result[]>;
  readonly intentUseCase: ParamUseCase<BugbotFixIntentContext, Result[]>;
  readonly thinkUseCase: ParamUseCase<ThinkContext, Result[]>;
  readonly autofixUseCase: ParamUseCase<BugbotAutofixParam, Result[]>;
  readonly doUserRequestUseCase: CommentCapability<CommentUserRequest>;
  /** Optional read-only review route used by /copilot review/findings/recheck. */
  readonly reviewPotentialProblemsUseCase?: ParamUseCase<BugbotReviewOperationContext, Result[]>;
  readonly bugbotGitMutationPort: BugbotGitMutationPort;
  readonly dismissBugbotFindingsUseCase?: ParamUseCase<DismissBugbotFindingsParam, Result[]>;
  readonly rememberBugbotRuleUseCase?: ParamUseCase<RememberBugbotRuleParam, Result[]>;
  /** Optional explicit PR description command; automatic PR updates remain a separate route. */
  readonly updatePullRequestDescriptionUseCase?: ExplicitPullRequestDescriptionUseCase;
  /** Explicit parent-to-child synchronization; agent use is conditional on conflicts. */
  readonly syncBranchUseCase?: CommentCapability<BranchSyncCommandOptions>;
}
