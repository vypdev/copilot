import type { Execution } from "../../data/model/execution";
import type { Result } from "../../data/model/result";
import type { ParamUseCase } from "./base/param_usecase";
import type { BugbotAutofixParam } from "./steps/commit/bugbot/bugbot_autofix_use_case";
import type { DoUserRequestParam } from "./steps/commit/user_request_use_case";
import type { GitCommitPort } from "../ports/git_ports";
import type { DismissBugbotFindingsParam } from './steps/commit/bugbot/dismiss_bugbot_findings_use_case';
import type { RememberBugbotRuleParam } from './steps/commit/bugbot/remember_bugbot_rule_use_case';
import type { SyncBranchRequest } from './branch_sync/sync_branch_use_case';
import type { BugbotGitMutationPort } from '../ports/bugbot_git_ports';
import type {
  BugbotFixIntentContext,
  BugbotReviewOperationContext,
} from './steps/commit/bugbot/bugbot_review_operation_context';

export interface ExplicitPullRequestDescriptionUseCase {
  invokeExplicit(param: Execution): Promise<Result[]>;
}

export interface CommentAutomationOptions {
  taskId: string;
  languageUseCase: ParamUseCase<Execution, Result[]>;
  intentUseCase: ParamUseCase<BugbotFixIntentContext, Result[]>;
  thinkUseCase: ParamUseCase<Execution, Result[]>;
  autofixUseCase: ParamUseCase<BugbotAutofixParam, Result[]>;
  doUserRequestUseCase: ParamUseCase<DoUserRequestParam, Result[]>;
  /** Optional read-only review route used by /copilot review/findings/recheck. */
  reviewPotentialProblemsUseCase?: ParamUseCase<BugbotReviewOperationContext, Result[]>;
  userComment: string;
  gitCommitPort: GitCommitPort;
  bugbotGitMutationPort: BugbotGitMutationPort;
  dismissBugbotFindingsUseCase?: ParamUseCase<DismissBugbotFindingsParam, Result[]>;
  rememberBugbotRuleUseCase?: ParamUseCase<RememberBugbotRuleParam, Result[]>;
  /** Optional explicit PR description command; automatic PR updates remain a separate route. */
  updatePullRequestDescriptionUseCase?: ExplicitPullRequestDescriptionUseCase;
  /** Explicit parent-to-child synchronization; agent use is conditional on conflicts. */
  syncBranchUseCase?: ParamUseCase<SyncBranchRequest, Result[]>;
}
