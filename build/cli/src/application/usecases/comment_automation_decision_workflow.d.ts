import type { Execution } from "../../data/model/execution";
import type { Result } from "../../data/model/result";
import type { ActorAuthorizationPort } from "../ports/actor_authorization_ports";
import { type CommentAutomationRoute } from "./comment_automation_route_policy";
import type { BugbotFixIntentPayload } from "./steps/commit/bugbot/bugbot_fix_intent_payload";
import type { CommentAutomationOptions } from "./comment_automation_contracts";
export interface CommentAutomationDecision {
    intentResults: Result[];
    intentPayload: BugbotFixIntentPayload | undefined;
    route: CommentAutomationRoute;
}
export declare function resolveCommentAutomationDecision(param: Execution, options: CommentAutomationOptions, actorAuthorizationPort: ActorAuthorizationPort): Promise<CommentAutomationDecision>;
