/**
 * Bugbot marker: we embed a hidden HTML comment in each finding comment (issue and PR)
 * with finding_id and resolved flag. This lets us (1) find existing findings when loading
 * context, (2) update the same comment when the agent re-reports or marks resolved, (3) match
 * threads when the user replies "fix it" in a PR.
 */
import type { BugbotFinding, BugbotFindingResolution } from "./types";
/** Maximum lossless finding identity accepted by the marker contract. */
export declare const MAX_FINDING_ID_LENGTH = 200;
/**
 * Canonicalize only insignificant outer whitespace. Internal characters are
 * never removed: doing so would make distinct finding identities collide.
 */
export declare function sanitizeFindingIdForMarker(findingId: string): string;
export declare function normalizeFindingIdForMarker(findingId: string): string | null;
export declare function buildMarker(findingId: string, resolved: boolean, fingerprint?: string, resolution?: BugbotFindingResolution): string;
export declare function parseMarker(body: string | null): Array<{
    findingId: string;
    resolved: boolean;
    fingerprint?: string;
    resolution?: BugbotFindingResolution;
}>;
/**
 * Regex to match the marker for a specific finding (same flexible format as parseMarker).
 * Finding IDs from external data (comments, API) are length-limited and validated to mitigate ReDoS.
 */
export declare function markerRegexForFinding(findingId: string): RegExp;
/**
 * Find the marker for this finding in body (using same pattern as parseMarker) and replace it.
 * Returns whether the marker exists independently from whether the body changed.
 */
export declare function replaceMarkerInBody(body: string, findingId: string, newResolved: boolean, replacement?: string): {
    updated: string;
    found: boolean;
    changed: boolean;
};
/** Extract title from comment body (first ## line) for context when sending to the agent. */
export declare function extractTitleFromBody(body: string | null): string;
/** Builds the visible comment body (title, severity, location, description, suggestion) plus the hidden marker for this finding. */
export declare function buildCommentBody(finding: BugbotFinding, resolved: boolean, resolution?: BugbotFindingResolution): string;
