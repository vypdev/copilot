import type { BoundBugbotIssueCommentWritePort } from "../../../../../application/ports/bugbot_issue_write_ports";
import { logDebugInfo } from "../../../../ports/logging_ports";
import { sanitizeAgentMarkdown } from '../../../../policies/github_comment_publication_policy';
import {
    resolveStaticBugbotCatalog,
    type BugbotMessageCatalog,
} from '../../../../policies/bugbot_message_catalog';

export async function publishOverflowComment(
    repository: BoundBugbotIssueCommentWritePort,
    issueNumber: number,
    overflowCount: number,
    overflowTitles: string[],
    commitSha: string | undefined,
    catalog: BugbotMessageCatalog = resolveStaticBugbotCatalog('en-US'),
): Promise<void> {
    if (overflowCount <= 0) return;

    const safeTitles = overflowTitles.slice(0, 15)
        .map(title => sanitizeAgentMarkdown(title, 500).replace(/[\r\n]+/gu, ' ').trim())
        .filter(Boolean);
    const titlesList = safeTitles.length > 0
        ? `\n- ${safeTitles.join("\n- ")}${overflowTitles.length > safeTitles.length ? `\n- …${catalog.message('bugbot.common.more', { count: overflowTitles.length - safeTitles.length }, overflowTitles.length - safeTitles.length)}` : ""}`
        : "";
    const body = `## ${catalog.message('bugbot.overflow.heading')}

${catalog.message('bugbot.overflow.body', { count: `**${overflowCount}**` }, overflowCount)}${titlesList}`;

    await repository.addComment(
        issueNumber,
        body,
        commitSha ? { commitSha } : undefined
    );
    logDebugInfo(`Added overflow comment; additional_findings=${overflowCount}; individual_publication=false.`);
}
