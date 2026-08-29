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
    const findingsBlock =
        unresolvedFindings.length === 0
            ? '(No unresolved findings.)'
            : unresolvedFindings
                  .map(
                      (f) =>
                          `- **id:** \`${f.id.replace(/`/g, '\\`')}\` | **title:** ${safeForPrompt(f.title ?? "", MAX_TITLE_LENGTH)}` +
                          (f.file != null ? ` | **file:** ${safeForPrompt(f.file, MAX_FILE_LENGTH)}` : '') +
                          (f.line != null ? ` | **line:** ${f.line}` : '') +
                          (f.description ? ` | **description:** ${(f.description ?? "").slice(0, 200)}${(f.description?.length ?? 0) > 200 ? '...' : ''}` : '')
                  )
                  .join('\n');

    const parentBlock =
        parentCommentBody != null
            ? (() => {
                  const sliced = parentCommentBody.slice(0, 1500);
                  const trimmed = sliced.trim();
                  return trimmed.length > 0
                      ? `\n**Parent comment (the comment the user replied to):**\n${trimmed}${parentCommentBody.length > 1500 ? '...' : ''}\n`
                      : '';
              })()
            : '';

    return getBugbotFixIntentPrompt({
        projectContextInstruction: PROJECT_CONTEXT_INSTRUCTION,
        findingsBlock,
        parentBlock,
        userComment: sanitizeUserCommentForPrompt(userComment),
    });
}
