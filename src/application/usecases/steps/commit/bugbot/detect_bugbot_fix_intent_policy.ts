import { extractTitleFromBody } from "./marker";
import type { UnresolvedFindingSummary } from "./types";

export interface BugbotFixIntent {
    isFixRequest: boolean;
    isDoRequest: boolean;
    targetFindingIds: string[];
    isReviewRequest?: boolean;
    requestText?: string;
}

export interface BugbotCommentSources {
    issue: {
        isIssueComment: boolean;
        commentBody?: string;
    };
    pullRequest: {
        isPullRequestReviewComment: boolean;
        commentBody?: string;
    };
}

/** Selects the user-authored comment that can trigger intent detection. */
export function selectBugbotCommentBody(sources: BugbotCommentSources): string {
    if (sources.issue.isIssueComment) return sources.issue.commentBody ?? "";
    if (sources.pullRequest.isPullRequestReviewComment) {
        return sources.pullRequest.commentBody ?? "";
    }
    return "";
}

/** Converts bounded finding context into the stable shape consumed by the intent prompt. */
export function buildUnresolvedFindingSummaries(
    findings: ReadonlyArray<{ id: string; fullBody?: string }>,
): UnresolvedFindingSummary[] {
    return findings.map((finding) => ({
        id: finding.id,
        title: extractTitleFromBody(finding.fullBody ?? null) || finding.id,
        description: finding.fullBody?.slice(0, 4000) ?? "",
    }));
}

/**
 * Validates the agent's structured response and enforces the application invariants:
 * only unresolved, explicitly requested findings can reach the autofix flow.
 */
export function parseBugbotFixIntentResponse(
    response: unknown,
    unresolvedFindingIds: ReadonlySet<string>,
): BugbotFixIntent | undefined {
    if (typeof response !== "object" || response === null || Array.isArray(response)) {
        return undefined;
    }

    const payload = response as Record<string, unknown>;
    const isFixRequest = payload.is_fix_request === true;
    const isDoRequest = payload.is_do_request === true;
    const isReviewRequest = payload.is_review_request === true;
    const requestedIds = Array.isArray(payload.target_finding_ids)
        ? payload.target_finding_ids.filter((id): id is string => typeof id === "string")
        : [];

    const targetFindingIds = isFixRequest
        ? unique(requestedIds.filter((id) => unresolvedFindingIds.has(id)))
        : [];

    return { isFixRequest, isDoRequest, targetFindingIds, isReviewRequest };
}

function unique(values: readonly string[]): string[] {
    return [...new Set(values)];
}
