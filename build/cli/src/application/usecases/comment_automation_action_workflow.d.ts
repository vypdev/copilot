import { Result } from "../../data/model/result";
import type { Execution } from "../../data/model/execution";
import type { AuthenticatedUserPort } from "../ports/authenticated_user_ports";
import type { GitCommitPort } from "../ports/git_ports";
import type { CommentAutomationOptions } from "./comment_automation_contracts";
import type { BugbotFixIntentPayload } from "./steps/commit/bugbot/bugbot_fix_intent_payload";
export type CommentAutomationAction = "autofix" | "do-user-request" | "review" | "think";
export interface CommentAutomationActionPorts {
    authenticatedUserPort: AuthenticatedUserPort;
    gitCommitPort: GitCommitPort;
}
/** Runs the selected mutating action and returns any result records it produces. */
export declare function runCommentAutomationAction(param: Execution, options: CommentAutomationOptions, route: CommentAutomationAction, intentPayload: BugbotFixIntentPayload | undefined, ports: CommentAutomationActionPorts): Promise<Result[]>;
