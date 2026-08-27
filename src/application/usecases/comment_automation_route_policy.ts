import type { BugbotFixIntentPayload } from './steps/commit/bugbot/bugbot_fix_intent_payload';
import { canRunBugbotAutofix, canRunDoUserRequest } from './steps/commit/bugbot/bugbot_fix_intent_payload';

export type CommentAutomationRoute = 'autofix' | 'do-user-request' | 'think';

export function resolveCommentAutomationRoute(
    payload: BugbotFixIntentPayload | undefined,
    allowedToModifyFiles: boolean,
): CommentAutomationRoute {
    if (!allowedToModifyFiles) return 'think';
    if (canRunBugbotAutofix(payload)) return 'autofix';
    if (canRunDoUserRequest(payload)) return 'do-user-request';
    return 'think';
}
