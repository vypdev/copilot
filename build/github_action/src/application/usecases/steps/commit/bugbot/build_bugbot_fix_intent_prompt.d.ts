/**
 * Builds the prompt for the configured findings agent to decide if the user is requesting
 * to fix one or more bugbot findings and which finding ids to target.
 */
import type { UnresolvedFindingSummary } from "./types";
export type { UnresolvedFindingSummary } from "./types";
export declare function buildBugbotFixIntentPrompt(userComment: string, unresolvedFindings: UnresolvedFindingSummary[], parentCommentBody?: string): string;
