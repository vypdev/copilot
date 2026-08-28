import type { Execution } from "../../../../../data/model/execution";
import type { BugbotContext } from "./types";
/** Maximum characters for a single finding's full comment body to avoid prompt bloat and token limits. */
export declare const MAX_FINDING_BODY_LENGTH = 12000;
/**
 * Truncates body to max length and appends indicator when truncated.
 * Exported for use when loading bugbot context so fullBody is bounded at load time.
 */
export declare function truncateFindingBody(body: string, maxLength: number): string;
/**
 * Builds the prompt for the configured build agent to fix the selected bugbot findings.
 * Includes repo context, the findings to fix (with full detail), the user's comment,
 * strict scope rules, and the verify commands to run.
 */
export declare function buildBugbotFixPrompt(param: Execution, context: BugbotContext, targetFindingIds: string[], userComment: string, verifyCommands: string[]): string;
