import type { Execution } from "../../../../../data/model/execution";
import type { BugbotContext } from "./types";
import { getBugbotFixPrompt } from "../../../../../prompts";
import { PROJECT_CONTEXT_INSTRUCTION } from "../../../../../utils/project_context_instruction";
import { sanitizeUserCommentForPrompt } from "./sanitize_user_comment_for_prompt";

/** Maximum characters for a single finding's full comment body to avoid prompt bloat and token limits. */
export const MAX_FINDING_BODY_LENGTH = 12000;

const TRUNCATION_SUFFIX = "\n\n[... truncated for length ...]";

/**
 * Truncates body to max length and appends indicator when truncated.
 * Exported for use when loading bugbot context so fullBody is bounded at load time.
 */
export function truncateFindingBody(body: string, maxLength: number): string {
    if (body.length <= maxLength) return body;
    return body.slice(0, maxLength - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
}

/**
 * Builds the prompt for the configured build agent to fix the selected bugbot findings.
 * Includes repo context, the findings to fix (with full detail), the user's comment,
 * strict scope rules, and the verify commands to run.
 */
export function buildBugbotFixPrompt(
    param: Execution,
    context: BugbotContext,
    targetFindingIds: string[],
    userComment: string,
    verifyCommands: string[]
): string {
    const headBranch = param.pullRequest?.head?.trim() || param.commit?.branch || 'unknown';
    const baseBranch = param.currentConfiguration.parentBranch ?? param.branches.development ?? "develop";
    const issueNumber = param.issueNumber;
    const owner = param.owner;
    const repo = param.repo;
    const openPrNumbers = context.openPrNumbers;
    const prNumber = openPrNumbers.length > 0 ? openPrNumbers[0] : null;

    const safeId = (id: string) => id.replace(/`/g, "\\`");
    const findingsBlock = targetFindingIds
        .map((id) => {
            const fullBody = context.unresolvedFindingsWithBody.find(
                (finding) => finding.id === id
            )?.fullBody.trim() ?? "";
            if (!fullBody) return null;
            const boundedBody = truncateFindingBody(
                fullBody,
                MAX_FINDING_BODY_LENGTH,
            );
            return `---\n**Finding id:** \`${safeId(id)}\`\n\n**Full comment (title, description, location, suggestion):**\n${boundedBody}\n`;
        })
        .filter(Boolean)
        .join("\n");

    const verifyBlock =
        verifyCommands.length > 0
            ? `\n**Verify commands (run these in the workspace in order and only consider the fix successful if all pass):**\n${verifyCommands.map((c) => `- \`${String(c).replace(/`/g, "\\`")}\``).join("\n")}\n`
            : "\n**Verify:** Run any standard project checks (e.g. build, test, lint) that exist in this repo and confirm they pass.\n";

    const prNumberLine = prNumber != null ? `- Pull request number: ${prNumber}` : "";

    return getBugbotFixPrompt({
        projectContextInstruction: PROJECT_CONTEXT_INSTRUCTION,
        owner,
        repo,
        headBranch,
        baseBranch,
        issueNumber: String(issueNumber),
        prNumberLine,
        findingsBlock,
        userComment: sanitizeUserCommentForPrompt(userComment),
        verifyBlock,
    });
}
