/**
 * Builds the prompt for the configured findings agent to decide if the user is requesting
 * to fix one or more bugbot findings and which finding ids to target.
 */

import { getBugbotFixIntentPrompt } from "../../../../../prompts";
import { PROJECT_CONTEXT_INSTRUCTION } from "../../../../../utils/project_context_instruction";
import { sanitizeUserCommentForPrompt } from "./sanitize_user_comment_for_prompt";
import type { UnresolvedFindingSummary } from "./types";

export type { UnresolvedFindingSummary } from "./types";

const MAX_TITLE_LENGTH = 200;
const MAX_FILE_LENGTH = 256;

function safeForPrompt(s: string, maxLen: number): string {
    return s.replace(/\r\n|\r|\n/g, " ").replace(/`/g, "\\`").slice(0, maxLen);
}

export function buildBugbotFixIntentPrompt(
    userComment: string,
    unresolvedFindings: UnresolvedFindingSummary[],
    parentCommentBody?: string
): string {
    const findingsBlock = buildFindingsBlock(unresolvedFindings);
    const parentBlock = buildParentBlock(parentCommentBody);
    return getBugbotFixIntentPrompt({
        projectContextInstruction: PROJECT_CONTEXT_INSTRUCTION,
        findingsBlock,
        parentBlock,
        userComment: sanitizeUserCommentForPrompt(userComment),
    });
}

function buildFindingsBlock(findings: UnresolvedFindingSummary[]): string {
    if (findings.length === 0) return '(No unresolved findings.)';
    return findings.map(formatFinding).join('\n');
}

function formatFinding(finding: UnresolvedFindingSummary): string {
    const fields = [
        `- **id:** \`${finding.id.replace(/`/g, '\\`')}\``,
        `**title:** ${safeForPrompt(finding.title ?? '', MAX_TITLE_LENGTH)}`,
    ];
    if (finding.file != null) fields.push(`**file:** ${safeForPrompt(finding.file, MAX_FILE_LENGTH)}`);
    if (finding.line != null) fields.push(`**line:** ${finding.line}`);
    if (finding.description) fields.push(`**description:** ${truncateDescription(finding.description)}`);
    return fields.join(' | ');
}

function truncateDescription(description: string): string {
    return `${description.slice(0, 200)}${description.length > 200 ? '...' : ''}`;
}

function buildParentBlock(parentCommentBody: string | undefined): string {
    if (parentCommentBody == null) return '';
    const sliced = parentCommentBody.slice(0, 1500);
    const trimmed = sliced.trim();
    if (trimmed.length === 0) return '';
    return `\n**Parent comment (the comment the user replied to):**\n${trimmed}${parentCommentBody.length > 1500 ? '...' : ''}\n`;
}
