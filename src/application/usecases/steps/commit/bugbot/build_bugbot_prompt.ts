/**
 * Builds the prompt for the configured findings agent when detecting potential problems on push.
 * We pass: repo context, the canonical GitHub PR diff, head/base branch names, issue number,
 * optional ignore patterns, and the block of previously reported findings (task 2).
 * The agent may inspect the read-only workspace for surrounding context and
 * incremental commit ranges that are narrower than the canonical full PR diff.
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
        changeScopeInstruction: buildChangeScopeInstruction(
            param,
            headBranch,
            baseBranch,
            (context.reviewDiffBlock ?? '').trim().length > 0,
        ),
        ignoreBlock,
        previousBlock,
        diffBlock: context.reviewDiffBlock,
        reviewConversationBlock: context.reviewConversationBlock,
    });
}

function buildChangeScopeInstruction(
    param: Execution,
    headBranch: string,
    baseBranch: string,
    hasCanonicalPullRequestDiff: boolean,
): string {
    const before = normalizedObjectId(param.inputs?.before);
    const after = normalizedObjectId(param.inputs?.after);
    const eventName = param.eventName || param.inputs?.eventName;
    const isIncrementalPullRequestUpdate = param.inputs?.eventName === 'pull_request'
        && param.pullRequest.action === 'synchronize'
        && before !== undefined
        && after !== undefined
        && before !== after;

    if (isIncrementalPullRequestUpdate) {
        return `This is an incremental pull-request update. For task 1, analyze the exact local commit range \`${before}..${after}\` and the surrounding current code needed to understand those changes. If either object is unavailable after the bounded fetch, use the canonical full PR diff instead of failing. Otherwise, the canonical full PR diff is supplied only as an authoritative manifest and location reference; do not re-review its unchanged remainder. Task 2 is not limited to this range: inspect the current code relevant to every previously reported finding before deciding whether it is resolved.`;
    }

    if (eventName === 'push' && before !== undefined && after !== undefined && before !== after) {
        return `This is a push update without requiring a pull request. For task 1, analyze the exact local commit range \`${before}..${after}\` and surrounding current code. If either object is unavailable after the bounded fetch (for example after a force-push), fall back to the current commit against its parent and the available branch/base history instead of failing. Task 2 is not limited to this range: inspect the current code relevant to every previously reported finding before deciding whether it is resolved.`;
    }

    if (hasCanonicalPullRequestDiff) {
        return `Review the canonical pull-request diff for "${headBranch}" compared to "${baseBranch}" and inspect the read-only workspace for any surrounding code required to prove a finding.`;
    }

    return `No canonical pull-request diff is available. Determine the current change scope from the read-only local Git checkout: compare "${headBranch}" with "${baseBranch}" when both refs are available, otherwise inspect the current commit against its parent. Review only those changes and the surrounding code needed to prove a finding.`;
}

function normalizedObjectId(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    return GIT_OBJECT_ID.test(normalized) && !/^0+$/.test(normalized) ? normalized : undefined;
}
