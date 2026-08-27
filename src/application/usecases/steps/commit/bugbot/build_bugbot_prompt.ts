/**
 * Builds the prompt for OpenCode (plan agent) when detecting potential problems on push.
 * We pass: repo context, head/base branch names (OpenCode computes the diff itself), issue number,
 * optional ignore patterns, and the block of previously reported findings (task 2).
 * We do not pass a pre-computed diff or file list.
 */

import { getBugbotPrompt } from "../../../../../prompts";
import { OPENCODE_PROJECT_CONTEXT_INSTRUCTION } from "../../../../../utils/opencode_project_context_instruction";
import type { Execution } from "../../../../../data/model/execution";
import type { BugbotContext } from "./types";

const MAX_IGNORE_BLOCK_LENGTH = 2000;

export function buildBugbotPrompt(param: Execution, context: BugbotContext): string {
    const headBranch = param.commit.branch;
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
        projectContextInstruction: OPENCODE_PROJECT_CONTEXT_INSTRUCTION,
        owner: param.owner,
        repo: param.repo,
        headBranch,
        baseBranch,
        issueNumber: String(param.issueNumber),
        ignoreBlock,
        previousBlock,
    });
}
