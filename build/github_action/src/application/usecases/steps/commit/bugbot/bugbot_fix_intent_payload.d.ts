/**
 * Helpers to read the bugbot fix intent from DetectBugbotFixIntentUseCase results.
 * Used by IssueCommentUseCase and PullRequestReviewCommentUseCase to decide whether
 * to run autofix (and pass context/branchOverride) or to run Think.
 */
import type { Result } from "../../../../../data/model/result";
import type { MarkFindingsResolvedParam } from "./mark_findings_resolved_use_case";
export type BugbotFixIntentPayload = {
    isFixRequest: boolean;
    isDoRequest: boolean;
    targetFindingIds: string[];
    context?: MarkFindingsResolvedParam["context"];
    branchOverride?: string;
};
/** Extracts the intent payload from the last result of DetectBugbotFixIntentUseCase (or undefined if empty). */
export declare function getBugbotFixIntentPayload(results: Result[]): BugbotFixIntentPayload | undefined;
/** Type guard: true when we have a valid fix request with targets and context so autofix can run. */
export declare function canRunBugbotAutofix(payload: BugbotFixIntentPayload | undefined): payload is BugbotFixIntentPayload & {
    context: NonNullable<BugbotFixIntentPayload["context"]>;
};
/** True when the user asked to perform a generic change/task in the repo (do user request). */
export declare function canRunDoUserRequest(payload: BugbotFixIntentPayload | undefined): boolean;
