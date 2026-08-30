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

export interface LoadBugbotContextOptions {
    /** When set (e.g. for issue_comment when commit.branch is empty), use this branch to find open PRs. */
    branchOverride?: string;
}

function emptyBugbotContext(): BugbotContext {
    return {
        existingByFindingId: {},
        issueComments: [],
        openPrNumbers: [],
        previousFindingsBlock: "",
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
    for (const prNumber of openPrNumbers) {
        commentsByPullRequest.set(
            prNumber,
            await repository.listPullRequestReviewComments(owner, repo, prNumber, token)
        );
    }
    return commentsByPullRequest;
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

    const [prFiles, filesWithLines] = await Promise.all([
        repository.getChangedFiles(owner, repo, openPrNumber, token),
        repository.getFilesWithFirstDiffLine(owner, repo, openPrNumber, token),
    ]);
    const pathToFirstDiffLine = Object.fromEntries(
        filesWithLines.map(({ path, firstLine }) => [path, firstLine])
    );
    return { prHeadSha, prFiles, pathToFirstDiffLine };
}

export async function loadBugbotContext(
    param: Execution,
    options: LoadBugbotContextOptions | undefined,
    ports: BugbotContextPorts
): Promise<BugbotContext> {
    const issueNumber = param.issueNumber;
    const headBranch = (options?.branchOverride ?? param.commit.branch)?.trim();
    const token = param.tokens.token;
    const owner = param.owner;
    const repo = param.repo;

    if (!headBranch) {
        logDebugInfo("LoadBugbotContext: no head branch (branchOverride or commit.branch); returning empty context.");
        return emptyBugbotContext();
    }

    const issueComments = await ports.issue.listIssueComments(owner, repo, issueNumber, token);
    const openPrNumbers = await ports.pullRequest.getOpenPullRequestNumbersByHeadBranch(
        owner,
        repo,
        headBranch,
        token
    );
    const pullRequestComments = await loadOpenPullRequestComments(
        ports.pullRequest,
        owner,
        repo,
        openPrNumbers,
        token
    );
    const parsedComments = parseBugbotFindingComments(issueComments, pullRequestComments);
    const previousFindings = collectPreviousBugbotFindings(
        parsedComments.issueComments,
        parsedComments.existingByFindingId,
        parsedComments.prFindingIdToBody
    );
    const boundedPreviousFindings = limitPreviousBugbotFindings(previousFindings);
    const previousFindingsBlock = buildPreviousFindingsBlock(previousFindings);
    const prContext = await loadPullRequestContext(
        ports.pullRequest,
        owner,
        repo,
        openPrNumbers[0],
        token
    );
    const unresolvedFindingsWithBody = boundedPreviousFindings.map((finding) => ({
        id: finding.id,
        fullBody: finding.fullBody,
    }));

    logDebugInfo(
        `LoadBugbotContext: issue #${issueNumber}, branch ${headBranch}, open PRs=${openPrNumbers.length}, existing findings=${Object.keys(parsedComments.existingByFindingId).length}, unresolved with body=${unresolvedFindingsWithBody.length}.`
    );
    return {
        existingByFindingId: parsedComments.existingByFindingId,
        issueComments: parsedComments.issueComments,
        openPrNumbers,
        previousFindingsBlock,
        prContext,
        unresolvedFindingsWithBody,
    };
}
