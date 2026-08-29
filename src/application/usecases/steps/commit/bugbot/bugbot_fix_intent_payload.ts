/**
 * Helpers to read the bugbot fix intent from DetectBugbotFixIntentUseCase results.
 * Used by IssueCommentUseCase and PullRequestReviewCommentUseCase to decide whether
 * to run autofix (and pass context/branchOverride) or to run Think.
 */

import type { Result } from "../../../../../data/model/result";
import type { MarkFindingsResolvedParam } from "./mark_findings_resolved_use_case";
import type { BugbotFixIntent } from "./detect_bugbot_fix_intent_policy";

export type BugbotFixIntentPayload = BugbotFixIntent & {
    context?: MarkFindingsResolvedParam["context"];
    branchOverride?: string;
};

/** Extracts the intent payload from the last result of DetectBugbotFixIntentUseCase (or undefined if empty). */
export function getBugbotFixIntentPayload(
    results: Result[]
): BugbotFixIntentPayload | undefined {
    if (results.length === 0) return undefined;
    const last = results[results.length - 1];
    const payload = last?.payload;
    if (!payload || typeof payload !== "object") return undefined;
    return payload as BugbotFixIntentPayload;
}

/** Type guard: true when we have a valid fix request with targets and context so autofix can run. */
export function canRunBugbotAutofix(
    payload: BugbotFixIntentPayload | undefined
): payload is BugbotFixIntentPayload & {
    context: NonNullable<BugbotFixIntentPayload["context"]>;
} {
    return (
        !!payload?.isFixRequest &&
        Array.isArray(payload.targetFindingIds) &&
        payload.targetFindingIds.length > 0 &&
        !!payload.context
    );
}

/** True when the user asked to perform a generic change/task in the repo (do user request). */
export function canRunDoUserRequest(payload: BugbotFixIntentPayload | undefined): boolean {
    return !!payload?.isDoRequest;
}
