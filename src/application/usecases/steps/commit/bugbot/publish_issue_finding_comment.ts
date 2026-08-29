import type { BugbotIssueCommentWritePort } from "../../../../../application/ports/bugbot_issue_write_ports";
import type { Execution } from "../../../../../data/model/execution";
import type { BugbotFinding, ExistingFindingInfo } from "./types";
import { buildCommentBody } from "./marker";
import { logDebugInfo } from "../../../../ports/logging_ports";

export async function publishIssueFindingComment(
    repository: BugbotIssueCommentWritePort,
    execution: Execution,
    finding: BugbotFinding,
    existing: ExistingFindingInfo | undefined,
    commitSha: string | undefined
): Promise<void> {
    const body = buildCommentBody(finding, false);
    const options = commitSha ? { commitSha } : undefined;

    if (existing?.issue != null) {
        await repository.updateComment(
            execution.owner,
            execution.repo,
            execution.issueNumber,
            existing.issue.commentId,
            body,
            execution.tokens.token,
            options
        );
        logDebugInfo(`Updated bugbot comment for finding ${finding.id} on issue.`);
        return;
    }

    await repository.addComment(
        execution.owner,
        execution.repo,
        execution.issueNumber,
        body,
        execution.tokens.token,
        options
    );
    logDebugInfo(`Added bugbot comment for finding ${finding.id} on issue.`);
}
