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
import { fileMatchesIgnorePatterns } from '../../../../policies/file_ignore_policy';
import type { BugbotReviewOperationContext } from './bugbot_review_operation_context';
import type { BugbotReviewDiffPartition } from './types';

const MAX_IGNORE_BLOCK_LENGTH = 2000;
const GIT_OBJECT_ID = /^[0-9a-f]{7,64}$/i;

export interface BugbotPromptPartitionAssignment {
    readonly partition: BugbotReviewDiffPartition;
}

export function buildBugbotPrompt(
    param: BugbotReviewOperationContext,
    context: BugbotContext,
    assignment?: BugbotPromptPartitionAssignment,
): string {
    const headBranch = param.target.headBranch || 'unknown';
    const baseBranch = param.target.baseBranch;
    const previousBlock = !assignment || assignment.partition.ownsResolution
        ? context.previousFindingsBlock
        : '';
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
            Boolean(assignment || (context.reviewDiffBlock ?? '').trim().length > 0),
            assignment?.partition,
        ),
        ignoreBlock,
        coverageBlock: buildCoverageBlock(context, assignment?.partition),
        previousBlock,
        diffBlock: assignment?.partition.block ?? context.reviewDiffBlock,
        reviewConversationBlock: context.reviewConversationBlock,
        rulesBlock: context.reviewRulesBlock,
        effortBlock: `**Review effort:** ${resolvedEffort}. ${resolvedEffort === 'high' ? 'Perform deeper cross-file and adversarial analysis.' : resolvedEffort === 'low' ? 'Prioritize high-signal changed-code defects and avoid speculative breadth.' : 'Balance depth, latency, and false-positive control.'}`,
        partitionBlock: assignment ? buildPartitionInstruction(assignment.partition) : undefined,
        outputContractBlock: assignment ? buildPartitionOutputContract(assignment.partition) : undefined,
        targetLocale: context.prContext && context.canonicalPullRequest
            ? param.locale.pullRequest
            : param.locale.issue ?? param.locale.pullRequest,
    });
}

function buildCoverageBlock(
    context: BugbotContext,
    partition?: BugbotReviewDiffPartition,
): string {
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
    const coverage = limitedSources.length === 0
        ? ['**Context coverage:** complete within every fixed provider budget.']
        : [
        '**Context coverage:** partial outside the partition plan.',
        ...limitedSources,
        'Analyze retained evidence, but do not claim that the whole pull request is clean. Only resolve prior finding ids explicitly included in the previous-findings section.',
    ];
    if (partition) {
        coverage.push(
            `**Diff-plan progress:** this request owns partition ${partition.ordinal}/${partition.total}. Whole-PR diff completion is decided only after every partition for head ${partition.headSha} validates.`,
        );
    }
    return coverage.join('\n');
}

function buildChangeScopeInstruction(
    param: BugbotReviewOperationContext,
    headBranch: string,
    baseBranch: string,
    hasCanonicalPullRequestDiff: boolean,
    partition?: BugbotReviewDiffPartition,
): string {
    if (partition) {
        return `Review every assigned changed-code fragment in canonical diff partition ${partition.ordinal}/${partition.total}. Use the read-only workspace and local Git history for surrounding code, exact current lines, missing provider patches, and cross-file dependencies needed to prove a defect. Report only defects introduced or exposed by changed code assigned to this partition. Do not report a duplicate merely because dependent code belongs to another partition.${partition.ownsResolution ? ' Task 2 is global: independently inspect the current workspace for every retained prior finding before deciding whether it is fixed or obsolete.' : ' This partition does not own task 2 and must return an empty resolved_findings array.'}`;
    }
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

function buildPartitionInstruction(partition: BugbotReviewDiffPartition): string {
    return [
        '**Partition integrity contract:**',
        `- Return partition_id exactly as \`${partition.id}\`.`,
        `- Return reviewed_head_sha exactly as \`${partition.headSha}\`.`,
        `- This is partition ${partition.ordinal}/${partition.total} with ${partition.fragmentCount} assigned ${partition.fragmentCount === 1 ? 'fragment' : 'fragments'}.`,
        partition.ownsResolution
            ? '- This partition is the sole resolution owner and may resolve only exact IDs from the retained previous-findings list.'
            : '- This partition is not the resolution owner; resolved_findings must be an empty array.',
        '- Do not claim or infer that any other partition was reviewed.',
    ].join('\n');
}

function buildPartitionOutputContract(partition: BugbotReviewDiffPartition): string {
    return `**Output:** Return a JSON object with "outputLocale", "partition_id" (exactly "${partition.id}"), "reviewed_head_sha" (exactly "${partition.headSha}"), "findings" (new/current problems from this assigned partition), and "resolved_findings" (objects containing an exact retained prior finding id and either "fixed" or "obsolete"). Always return both arrays.${partition.ownsResolution ? ' Never resolve an id that was not included in the previous-findings list.' : ' Return an empty resolved_findings array because this partition is not the resolution owner.'}`;
}

function normalizedObjectId(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    return GIT_OBJECT_ID.test(normalized) && !/^0+$/.test(normalized) ? normalized : undefined;
}
