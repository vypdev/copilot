import type { BugbotFramedAssignment } from '../../domain/bugbot/framed_review';

/** Coverage and identity are exact ordered echoes, never inferred from response counts. */
export function matchesBugbotFramedReceipt(assignment: BugbotFramedAssignment,
    response: Readonly<Record<string, unknown>>): boolean {
    const ids = response.reviewed_fragment_ids;
    return response.reviewed_base_sha === assignment.baseSha
        && response.review_manifest_digest === assignment.manifestDigest
        && response.review_frame_id === assignment.frameId
        && response.review_coverage_digest === assignment.coverageDigest
        && Array.isArray(ids) && ids.length === assignment.fragmentIds.length
        && ids.every((id, index) => id === assignment.fragmentIds[index]);
}
