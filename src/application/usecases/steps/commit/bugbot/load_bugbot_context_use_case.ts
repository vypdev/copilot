/**
 * Loads all bugbot context from GitHub repositories and delegates comment parsing to a pure collaborator.
 */

import type { Execution } from "../../../../../data/model/execution";
import type { BugbotContextPorts } from "../../../../../application/ports/bugbot_context_ports";
import type { BugbotPullRequestReadPort } from "../../../../../application/ports/bugbot_pull_request_read_ports";
import type { PullRequestReviewComment } from "../../../../../application/ports/pull_request_review_comment_ports";
import type { BugbotContext } from "./types";
import {
    buildPreviousFindingsBlock,
    collectPreviousBugbotFindings,
    limitPreviousBugbotFindings,
    parseBugbotFindingComments,
} from "./bugbot_finding_context";
import { logDebugInfo } from "../../../../ports/logging_ports";
import { buildReviewConversationBlock, buildReviewDiffBlock } from './bugbot_review_context';

export interface LoadBugbotContextOptions {
    /** When set (e.g. for issue_comment when commit.branch is empty), use this branch to find open PRs. */
    branchOverride?: string;
    /** Allows PR review to operate without an issue parsed from the branch name. */
    issueNumberOverride?: number;
    /** Uses the event PR directly instead of searching by branch. */
    pullRequestNumberOverride?: number;
}

function emptyBugbotContext(): BugbotContext {
    return {
        existingByFindingId: {},
        issueComments: [],
        openPrNumbers: [],
        previousFindingsBlock: "",
        reviewDiffBlock: "",
        reviewConversationBlock: "",
        prContext: null,
        unresolvedFindingsWithBody: [],
    };
}

async function loadOpenPullRequestComments(
    repository: BugbotPullRequestReadPort,
    owner: string,
    repo: string,
    openPrNumbers: number[],
    token: string
): Promise<ReadonlyMap<number, PullRequestReviewComment[]>> {
    const commentsByPullRequest = new Map<number, PullRequestReviewComment[]>();
    await Promise.all(openPrNumbers.map(async (prNumber) => {
        commentsByPullRequest.set(
            prNumber,
            await repository.listPullRequestReviewComments(owner, repo, prNumber, token)
        );
    }));
    return commentsByPullRequest;
}

async function loadOpenPullRequestThreadStates(
    repository: BugbotPullRequestReadPort,
    owner: string,
    repo: string,
    openPrNumbers: number[],
    token: string,
): Promise<ReadonlyMap<number, Readonly<Record<string, boolean>>>> {
    const statesByPullRequest = new Map<number, Readonly<Record<string, boolean>>>();
    if (!repository.listPullRequestReviewThreadStates) return statesByPullRequest;
    await Promise.all(openPrNumbers.map(async (prNumber) => {
        statesByPullRequest.set(
            prNumber,
            await repository.listPullRequestReviewThreadStates!(owner, repo, prNumber, token),
        );
    }));
    return statesByPullRequest;
}

async function loadPullRequestContext(
    repository: BugbotPullRequestReadPort,
    owner: string,
    repo: string,
    openPrNumber: number | undefined,
    token: string
): Promise<BugbotContext["prContext"]> {
    if (openPrNumber == null) return null;
    const prHeadSha = await repository.getPullRequestHeadSha(owner, repo, openPrNumber, token);
    if (!prHeadSha) return null;

    const snapshot = repository.getReviewDiffSnapshot
        ? await repository.getReviewDiffSnapshot(owner, repo, openPrNumber, token)
        : undefined;
    const [prFiles, filesWithLines, filesWithLocations] = snapshot
        ? [
            snapshot.changes.map(({ filename, status }) => ({ filename, status })),
            snapshot.filesWithFirstDiffLine,
            snapshot.filesWithDiffLocations,
        ]
        : await Promise.all([
            repository.getChangedFiles(owner, repo, openPrNumber, token),
            repository.getFilesWithFirstDiffLine(owner, repo, openPrNumber, token),
            repository.getFilesWithDiffLocations?.(owner, repo, openPrNumber, token) ?? Promise.resolve([]),
        ]);
    const pathToFirstDiffLine = Object.fromEntries(
        filesWithLines.map(({ path, firstLine }) => [path, firstLine])
    );
    const pathToDiffLocations = Object.fromEntries(
        filesWithLocations.map(({ path, locations }) => [path, locations])
    );
    return {
        prHeadSha,
        prFiles,
        pathToFirstDiffLine,
        pathToDiffLocations,
        ...(snapshot ? { changes: snapshot.changes } : {}),
    };
}

export async function loadBugbotContext(
    param: Execution,
    options: LoadBugbotContextOptions | undefined,
    ports: BugbotContextPorts
): Promise<BugbotContext> {
    const issueNumber = options?.issueNumberOverride ?? param.issueNumber;
    const headBranch = (options?.branchOverride ?? (param.isPullRequest ? param.pullRequest.head : param.commit.branch))?.trim();
    const token = param.tokens.token;
    const owner = param.owner;
    const repo = param.repo;

    const openPrNumbers = options?.pullRequestNumberOverride != null && options.pullRequestNumberOverride > 0
        ? [options.pullRequestNumberOverride]
        : headBranch
            ? await ports.pullRequest.getOpenPullRequestNumbersByHeadBranch(owner, repo, headBranch, token)
            : [];

    if (!headBranch && openPrNumbers.length === 0) {
        logDebugInfo("LoadBugbotContext: no head branch or pull request target; returning empty context.");
        return emptyBugbotContext();
    }

    const [issueComments, pullRequestComments, reviewThreadStates, prContext] = await Promise.all([
        issueNumber > 0
            ? ports.issue.listIssueComments(owner, repo, issueNumber, token)
            : Promise.resolve([]),
        loadOpenPullRequestComments(ports.pullRequest, owner, repo, openPrNumbers, token),
        loadOpenPullRequestThreadStates(ports.pullRequest, owner, repo, openPrNumbers, token),
        loadPullRequestContext(ports.pullRequest, owner, repo, openPrNumbers[0], token),
    ]);
    const parsedComments = parseBugbotFindingComments(
        issueComments,
        pullRequestComments,
        param.tokenUser,
        reviewThreadStates,
    );
    const previousFindings = collectPreviousBugbotFindings(
        parsedComments.issueComments,
        parsedComments.existingByFindingId,
        parsedComments.prFindingIdToBody
    );
    const boundedPreviousFindings = limitPreviousBugbotFindings(previousFindings);
    const previousFindingsBlock = buildPreviousFindingsBlock(previousFindings);
    const reviewDiffBlock = buildReviewDiffBlock(prContext);
    const reviewConversationBlock = buildReviewConversationBlock(
        issueComments,
        pullRequestComments,
        param.tokenUser,
    );
    const unresolvedFindingsWithBody = boundedPreviousFindings.map((finding) => ({
        id: finding.id,
        fullBody: finding.fullBody,
    }));

    logDebugInfo(
        `LoadBugbotContext: issue #${issueNumber}, branch ${headBranch}, open PRs=${openPrNumbers.length}, existing findings=${Object.keys(parsedComments.existingByFindingId).length}, unresolved with body=${unresolvedFindingsWithBody.length}, diff files=${prContext?.changes?.length ?? prContext?.prFiles.length ?? 0}, diff prompt chars=${reviewDiffBlock.length}, conversation chars=${reviewConversationBlock.length}.`
    );
    return {
        existingByFindingId: parsedComments.existingByFindingId,
        issueComments: parsedComments.issueComments,
        openPrNumbers,
        previousFindingsBlock,
        reviewDiffBlock,
        reviewConversationBlock,
        prContext,
        unresolvedFindingsWithBody,
    };
}
