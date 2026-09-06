/**
 * Builds the prompt for the configured findings agent when detecting potential problems on push.
 * We pass: repo context, head/base branch names (the agent computes the diff itself), issue number,
 * optional ignore patterns, and the block of previously reported findings (task 2).
 * We do not pass a pre-computed diff or file list.
 */

import { getBugbotPrompt } from "../../../../../prompts";
import { PROJECT_CONTEXT_INSTRUCTION } from "../../../../../utils/project_context_instruction";
import type { Execution } from "../../../../../data/model/execution";
import type { BugbotContext } from "./types";

const MAX_IGNORE_BLOCK_LENGTH = 2000;
const GIT_OBJECT_ID = /^[0-9a-f]{7,64}$/i;

export function buildBugbotPrompt(param: Execution, context: BugbotContext): string {
    const headBranch = param.pullRequest?.head?.trim() || param.commit?.branch || 'unknown';
    const baseBranch = param.currentConfiguration.parentBranch ?? param.branches.development ?? 'develop';
    const previousBlock = context.previousFindingsBlock;
    const ignorePatterns = param.ai?.getAiIgnoreFiles?.() ?? [];
    const ignoreBlock =
        ignorePatterns.length > 0
            ? (() => {
                  const raw = ignorePatterns.join(", ");
                  const truncated =
                      raw.length <= MAX_IGNORE_BLOCK_LENGTH
                          ? raw
                          : raw.slice(0, MAX_IGNORE_BLOCK_LENGTH - 3) + "...";
                  return `\n**Files to ignore:** Do not report findings in files or paths matching these patterns: ${truncated}.`;
              })()
            : "";

    return getBugbotPrompt({
        projectContextInstruction: PROJECT_CONTEXT_INSTRUCTION,
        owner: param.owner,
        repo: param.repo,
        headBranch,
        baseBranch,
        issueNumber: String(param.issueNumber),
        changeScopeInstruction: buildChangeScopeInstruction(param, headBranch, baseBranch),
        ignoreBlock,
        previousBlock,
    });
}

function buildChangeScopeInstruction(
    param: Execution,
    headBranch: string,
    baseBranch: string,
): string {
    const before = normalizedObjectId(param.inputs?.before);
    const after = normalizedObjectId(param.inputs?.after);
    const isIncrementalPullRequestUpdate = param.inputs?.eventName === 'pull_request'
        && param.pullRequest.action === 'synchronize'
        && before !== undefined
        && after !== undefined
        && before !== after;

    if (!isIncrementalPullRequestUpdate) {
        return `Determine what has changed in the branch "${headBranch}" compared to "${baseBranch}" (you must compute or obtain the diff yourself using the repository context above).`;
    }

    return `This is an incremental pull-request update. For task 1, analyze the exact commit range \`${before}..${after}\` and the surrounding current code needed to understand those changes. Do not re-review the unchanged remainder of the full \`${baseBranch}...${headBranch}\` diff. You must compute or obtain the incremental diff yourself. Task 2 is not limited to this range: inspect the current code relevant to every previously reported finding before deciding whether it is resolved.`;
}

function normalizedObjectId(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    return GIT_OBJECT_ID.test(normalized) ? normalized : undefined;
}
