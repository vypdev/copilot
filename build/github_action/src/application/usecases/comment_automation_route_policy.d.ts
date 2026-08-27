import type { BugbotFixIntentPayload } from './steps/commit/bugbot/bugbot_fix_intent_payload';
export type CommentAutomationRoute = 'autofix' | 'do-user-request' | 'think';
export declare function resolveCommentAutomationRoute(payload: BugbotFixIntentPayload | undefined, allowedToModifyFiles: boolean): CommentAutomationRoute;
