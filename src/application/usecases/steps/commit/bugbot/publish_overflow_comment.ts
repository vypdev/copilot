import type { BugbotIssueCommentWritePort } from "../../../../../application/ports/bugbot_issue_write_ports";
import type { Execution } from "../../../../../data/model/execution";
import { logDebugInfo } from "../../../../../utils/logger";

export async function publishOverflowComment(
    repository: BugbotIssueCommentWritePort,
    execution: Execution,
    overflowCount: number,
    overflowTitles: string[],
    commitSha: string | undefined
): Promise<void> {
    if (overflowCount <= 0) return;

    const titlesList = overflowTitles.length > 0
        ? `\n- ${overflowTitles.slice(0, 15).join("\n- ")}${overflowTitles.length > 15 ? `\n- ... and ${overflowTitles.length - 15} more` : ""}`
        : "";
    const body = `## More findings (comment limit)

There are **${overflowCount}** more finding(s) that were not published as individual comments. Review locally or in the full diff to see the list.${titlesList}`;

    await repository.addComment(
        execution.owner,
        execution.repo,
        execution.issueNumber,
        body,
        execution.tokens.token,
        commitSha ? { commitSha } : undefined
    );
    logDebugInfo(`Added overflow comment: ${overflowCount} additional finding(s) not published individually.`);
}
