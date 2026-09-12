/**
 * Builds the prompt for the configured findings agent when detecting potential problems on push.
 * We pass: repo context, the canonical GitHub PR diff, head/base branch names, issue number,
 * optional ignore patterns, and the block of previously reported findings (task 2).
 * The agent may inspect the read-only workspace for surrounding context and
 * incremental commit ranges that are narrower than the canonical full PR diff.
 */

import { getBugbotPrompt } from "../../../../../prompts";
import { PROJECT_CONTEXT_INSTRUCTION } from "../../../../../utils/project_context_instruction";
import type { BugbotContext } from "./types";
import { resolveBugbotReviewEffort } from '../../../../../domain/bugbot/review_configuration';
import { fileMatchesIgnorePatterns } from './file_ignore';
import type { BugbotReviewOperationContext } from './bugbot_review_operation_context';

const MAX_IGNORE_BLOCK_LENGTH = 2000;
const GIT_OBJECT_ID = /^[0-9a-f]{7,64}$/i;

export function buildBugbotPrompt(param: BugbotReviewOperationContext, context: BugbotContext): string {
    const headBranch = param.target.headBranch || 'unknown';
    const baseBranch = param.target.baseBranch;
    const previousBlock = context.previousFindingsBlock;
    const ignorePatterns = param.ignorePatterns;
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
    const changes = (context.prContext?.changes ?? [])
        .filter((change) => !fileMatchesIgnorePatterns(change.filename, ignorePatterns));
    const configuredEffort = param.analysis.reviewConfiguration.effort;
    const resolvedEffort = resolveBugbotReviewEffort(configuredEffort, {
        files: changes.length,
        additions: changes.reduce((sum, change) => sum + change.additions, 0),
        deletions: changes.reduce((sum, change) => sum + change.deletions, 0),
        touchesSensitivePath: changes.some((change) => /(^|\/)(auth|security|permissions?|credentials?|secrets?|payments?|migrations?)(\/|\.|$)/i.test(change.filename)),
    });

    return getBugbotPrompt({
        projectContextInstruction: PROJECT_CONTEXT_INSTRUCTION,
        owner: param.repository.owner,
        repo: param.repository.name,
        headBranch,
        baseBranch,
        issueNumber: String(param.target.issueNumber),
        changeScopeInstruction: buildChangeScopeInstruction(
            param,
            headBranch,
            baseBranch,
            (context.reviewDiffBlock ?? '').trim().length > 0,
        ),
        ignoreBlock,
        coverageBlock: buildCoverageBlock(context),
        previousBlock,
        diffBlock: context.reviewDiffBlock,
        reviewConversationBlock: context.reviewConversationBlock,
        rulesBlock: context.reviewRulesBlock,
        effortBlock: `**Review effort:** ${resolvedEffort}. ${resolvedEffort === 'high' ? 'Perform deeper cross-file and adversarial analysis.' : resolvedEffort === 'low' ? 'Prioritize high-signal changed-code defects and avoid speculative breadth.' : 'Balance depth, latency, and false-positive control.'}`,
    });
}

function buildCoverageBlock(context: BugbotContext): string {
    const limitedSources = context.coverage.sources
        .filter((source) => source.status === 'partial')
        .map((source) => {
            const details = [
                `retained=${source.itemsRetained}`,
                ...(source.omittedItems > 0 ? [`omitted=${source.omittedItems}`] : []),
                ...(source.truncatedItems > 0 ? [`truncated=${source.truncatedItems}`] : []),
                ...(source.providerLimitReached ? ['provider page limit reached; additional older records are uncounted'] : []),
            ];
            return `- ${source.source}: ${details.join(', ')}`;
        });
    if (limitedSources.length === 0) {
        return '**Context coverage:** complete within every fixed provider and prompt budget.';
    }
    return [
        '**Context coverage:** partial.',
        ...limitedSources,
        'Analyze retained evidence, but do not claim that the whole pull request is clean. Only resolve prior finding ids explicitly included in the previous-findings section.',
    ].join('\n');
}

function buildChangeScopeInstruction(
    param: BugbotReviewOperationContext,
    headBranch: string,
    baseBranch: string,
    hasCanonicalPullRequestDiff: boolean,
): string {
    const before = normalizedObjectId(param.trigger.before);
    const after = normalizedObjectId(param.trigger.after);
    const eventName = param.trigger.kind;
    const isIncrementalPullRequestUpdate = eventName === 'pull_request'
        && param.target.pullRequestAction === 'synchronize'
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
