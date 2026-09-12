import type { BoundBugbotIssueCommentWritePort } from "../../../../../application/ports/bugbot_issue_write_ports";
import type {
    BugbotFinding,
    ExistingFindingInfo,
} from "../../../../../domain/bugbot/finding";
import { buildCommentBody } from '../../../../policies/bugbot_finding_marker_policy';
import { logDebugInfo } from "../../../../ports/logging_ports";

export async function publishIssueFindingComment(
    repository: BoundBugbotIssueCommentWritePort,
    issueNumber: number,
    finding: BugbotFinding,
    existing: ExistingFindingInfo | undefined,
    commitSha: string | undefined
): Promise<void> {
    const body = buildCommentBody(finding, false);
    const options = commitSha ? { commitSha } : undefined;

    if (existing?.issue != null) {
        await repository.updateComment(
            issueNumber,
            existing.issue.commentId,
            body,
            options
        );
        logDebugInfo(`Updated bugbot comment for finding ${finding.id} on issue.`);
        return;
    }

    await repository.addComment(
        issueNumber,
        body,
        options
    );
    logDebugInfo(`Added bugbot comment for finding ${finding.id} on issue.`);
}
