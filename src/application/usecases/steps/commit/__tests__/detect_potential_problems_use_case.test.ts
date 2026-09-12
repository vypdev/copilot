/**
 * Unit tests for DetectPotentialProblemsUseCase (bugbot on push).
 * Covers: skip when OpenCode/issue missing, prompt with/without previous findings,
 * new findings (add/update issue and PR comments), resolved_findings, errors.
 */

import { DetectPotentialProblemsUseCase } from "../detect_potential_problems_use_case";
import { PullRequestReviewCommentCommandRepository } from "../../../../../data/repository/pull_request/pull_request_review_comment_command_repository";
import { Ai } from "../../../../../data/model/ai";
import type { Execution } from "../../../../../data/model/execution";
import {
  buildFindingFingerprint,
  buildSemanticFindingFingerprint,
} from "../../../../../domain/bugbot/finding_identity";
import { buildMarker } from '../../../../policies/bugbot_finding_marker_policy';
import type { BugbotFinding } from '../../../../../domain/bugbot/finding';
import type { BugbotContextSource, BugbotSourceCoverage } from '../../../../../domain/bugbot/context';
import { projectBugbotReviewOperationContext } from '../bugbot/bugbot_review_operation_context';

jest.mock("@actions/github", () => {
  const actual =
    jest.requireActual<typeof import("@actions/github")>("@actions/github");
  return {
    ...actual,
    context: { ...actual.context, sha: undefined },
  };
});

jest.mock("../../../../../utils/logger", () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebugInfo: jest.fn(),
}));

const mockListIssueComments = jest.fn();
const mockAddComment = jest.fn();
const mockUpdateComment = jest.fn();

const mockFindExactHeadCandidateNumbers = jest.fn();
const mockListPullRequestReviewComments = jest.fn();
const mockGetPullRequestHeadSha = jest.fn();
const mockGetChangedFiles = jest.fn();
const mockGetFilesWithFirstDiffLine = jest.fn();
const mockGetFilesWithDiffLocations = jest.fn();
const mockGetReviewDiffSnapshot = jest.fn();
const mockCreateReviewWithComments = jest.fn();
const mockUpdatePullRequestReviewComment = jest.fn();
const mockResolvePullRequestReviewThread = jest.fn();
const mockUnresolvePullRequestReviewThread = jest.fn();
const mockListPullRequestReviews = jest.fn();
const mockUpdatePullRequestReview = jest.fn();

const mockAskAgent = jest.fn();
let issueCoverageOverride: BugbotSourceCoverage | undefined;

function completeCoverage(source: BugbotContextSource, items: number) {
  return {
    source,
    status: 'complete' as const,
    pagesFetched: items > 0 ? 1 : 0,
    itemsFetched: items,
    itemsRetained: items,
    omittedItems: 0,
    truncatedItems: 0,
    limitReached: false,
  };
}

function markerFor(finding: BugbotFinding, resolved = false): string {
  return buildMarker(
    finding.id,
    resolved,
    buildFindingFingerprint(finding),
    buildSemanticFindingFingerprint(finding),
  );
}

function baseParam(overrides: Record<string, unknown> = {}): Execution {
  return {
    owner: "owner",
    repo: "repo",
    issueNumber: 42,
    tokenUser: "bot",
    tokens: { token: "token" },
    commit: { branch: "feature/42-add-feature" },
    currentConfiguration: { parentBranch: "develop" },
    branches: { development: "develop" },
    ai: new Ai(
      "http://localhost:4096",
      "opencode/model",
      false,
      [],
      false,
      "low",
      20,
    ),
    ...overrides,
  } as unknown as Execution;
}

function invokeUseCase(useCase: DetectPotentialProblemsUseCase, source: Execution) {
  return useCase.invoke(projectBugbotReviewOperationContext(source));
}

describe("DetectPotentialProblemsUseCase", () => {
  let useCase: DetectPotentialProblemsUseCase;

  beforeEach(() => {
    const rulesPort = { loadRules: jest.fn().mockResolvedValue([]) };
    const mockListPullRequestReviewThreadStates = jest.fn().mockResolvedValue({});
    const issueComments = {
      addComment: (
        issueNumber: number,
        body: string,
        options?: { commitSha?: string },
      ) => mockAddComment('owner', 'repo', issueNumber, body, 'token', options),
      updateComment: (
        issueNumber: number,
        commentId: number,
        body: string,
        options?: { commitSha?: string },
      ) => mockUpdateComment(
        'owner',
        'repo',
        issueNumber,
        commentId,
        body,
        'token',
        options,
      ),
    };
    const pullRequestComments = {
      createReviewWithComments: (
        pullRequestNumber: number,
        commitId: string,
        body: string,
        comments: Parameters<PullRequestReviewCommentCommandRepository['createReviewWithComments']>[5],
      ) => mockCreateReviewWithComments(
        'owner',
        'repo',
        pullRequestNumber,
        commitId,
        body,
        comments,
        'token',
      ),
      updatePullRequestReviewComment: (commentIdentity: string, body: string) =>
        mockUpdatePullRequestReviewComment('owner', 'repo', commentIdentity, body, 'token'),
      resolvePullRequestReviewThread: (pullRequestNumber: number, commentIdentity: string) =>
        mockResolvePullRequestReviewThread(
          'owner',
          'repo',
          pullRequestNumber,
          commentIdentity,
          'token',
        ),
      unresolvePullRequestReviewThread: (pullRequestNumber: number, commentIdentity: string) =>
        mockUnresolvePullRequestReviewThread(
          'owner',
          'repo',
          pullRequestNumber,
          commentIdentity,
          'token',
        ),
      listPullRequestReviewComments: (pullRequestNumber: number) =>
        mockListPullRequestReviewComments('owner', 'repo', pullRequestNumber, 'token'),
    };
    const context = {
      getPullRequest: async (pullRequestNumber: number) => ({
        number: pullRequestNumber,
        state: 'open' as const,
        baseRepository: { owner: 'owner', name: 'repo' },
        headRepositoryOwner: 'owner',
        headRef: 'feature/head',
        headSha: await mockGetPullRequestHeadSha(pullRequestNumber),
      }),
      findOpenPullRequestsByExactHead: async (headOwner: string, headRef: string) => {
        const numbers = await mockFindExactHeadCandidateNumbers(headRef);
        return Promise.all(numbers.map(async (number: number) => ({
          number,
          state: 'open' as const,
          baseRepository: { owner: 'owner', name: 'repo' },
          headRepositoryOwner: headOwner,
          headRef,
          headSha: await mockGetPullRequestHeadSha(number),
        })));
      },
      listIssueComments: async (issueNumber: number) => {
        const value = await mockListIssueComments('owner', 'repo', issueNumber, 'token');
        return {
          value,
          coverage: issueCoverageOverride ?? completeCoverage('issue-comments', value.length),
        };
      },
      listPullRequestReviewComments: async (pullRequestNumber: number) => {
        const value = await mockListPullRequestReviewComments(
          'owner',
          'repo',
          pullRequestNumber,
          'token',
        );
        return {
          value,
          coverage: completeCoverage('pull-request-comments', value.length),
        };
      },
      listPullRequestReviewThreadStates: async (pullRequestNumber: number) => {
        const value = await mockListPullRequestReviewThreadStates(
          'owner',
          'repo',
          pullRequestNumber,
          'token',
        );
        return {
          value,
          coverage: completeCoverage('review-threads', Object.keys(value).length),
        };
      },
      getReviewDiffSnapshot: async (pullRequestNumber: number) => {
        const value = await mockGetReviewDiffSnapshot(
          'owner',
          'repo',
          pullRequestNumber,
          'token',
        );
        return { value, coverage: completeCoverage('diff', value.changes.length) };
      },
      getPullRequestHeadSha: (pullRequestNumber: number) =>
        mockGetPullRequestHeadSha('owner', 'repo', pullRequestNumber, 'token'),
      getPullRequestReviewCommentBody: jest.fn().mockResolvedValue(null),
      loadRules: rulesPort.loadRules,
    };
    useCase = new DetectPotentialProblemsUseCase(
      {
        query: (request: {
          configuration: unknown;
          agentId: string;
          prompt: string;
          options?: unknown;
        }) =>
          mockAskAgent(
            request.configuration,
            request.agentId,
            request.prompt,
            request.options,
          ),
      },
      {
        context,
        publication: { issueComments, pullRequestComments },
        resolution: { issueComments, pullRequestComments },
        reconciliation: {
          snapshot: {
            listIssueComments: (issueNumber: number) =>
              mockListIssueComments('owner', 'repo', issueNumber, 'token'),
            listPullRequestReviewComments: pullRequestComments.listPullRequestReviewComments,
            listPullRequestReviewThreadStates: (pullRequestNumber: number) =>
              mockListPullRequestReviewThreadStates(
                'owner',
                'repo',
                pullRequestNumber,
                'token',
              ),
            listPullRequestReviews: (pullRequestNumber: number) =>
              mockListPullRequestReviews('owner', 'repo', pullRequestNumber, 'token'),
            getPullRequestHeadSha: context.getPullRequestHeadSha,
            navigationForPullRequest: () => ({
              pullRequestUrl: 'https://github.com/org/repo/pull/7',
              commitUrl: `https://github.com/org/repo/commit/${'a'.repeat(40)}`,
            }),
          },
          presentation: {
            comments: issueComments,
            updatePullRequestReview: (
              pullRequestNumber: number,
              reviewIdentity: string,
              body: string,
            ) => mockUpdatePullRequestReview(
              'owner',
              'repo',
              pullRequestNumber,
              reviewIdentity,
              body,
              'token',
            ),
          },
        },
      },
    );
    mockListIssueComments.mockReset();
    mockAddComment.mockReset();
    mockUpdateComment.mockReset();
    mockFindExactHeadCandidateNumbers.mockReset();
    mockListPullRequestReviewComments.mockReset();
    mockGetPullRequestHeadSha.mockReset();
    mockGetChangedFiles.mockReset();
    mockGetFilesWithFirstDiffLine.mockReset();
    mockGetFilesWithDiffLocations.mockReset();
    mockGetReviewDiffSnapshot.mockReset().mockImplementation(async (...args: unknown[]) => ({
      changes: (await mockGetChangedFiles(...args)).map((change: { filename: string; status: string }) => ({
        additions: 0,
        deletions: 0,
        patch: "",
        ...change,
      })),
      filesWithFirstDiffLine: await mockGetFilesWithFirstDiffLine(...args),
      filesWithDiffLocations: await mockGetFilesWithDiffLocations(...args),
    }));
    mockCreateReviewWithComments.mockReset();
    mockUpdatePullRequestReviewComment.mockReset();
    mockResolvePullRequestReviewThread.mockReset();
    mockUnresolvePullRequestReviewThread.mockReset();
    mockListPullRequestReviews.mockReset().mockResolvedValue([]);
    mockUpdatePullRequestReview.mockReset().mockResolvedValue(undefined);
    mockAskAgent.mockReset();
    issueCoverageOverride = undefined;

    mockListIssueComments.mockResolvedValue([]);
    mockListPullRequestReviewComments.mockResolvedValue([]);
    mockFindExactHeadCandidateNumbers.mockResolvedValue([]);
    mockGetChangedFiles.mockResolvedValue([]);
    mockGetFilesWithFirstDiffLine.mockResolvedValue([]);
    mockGetFilesWithDiffLocations.mockResolvedValue([]);
    mockGetPullRequestHeadSha.mockResolvedValue('a'.repeat(40));
  });

  it("returns empty results when the findings CLI is not configured", async () => {
    const param = baseParam({
      ai: new Ai("", "opencode/model", false, [], false, "low", 20, [], {
        findings: { provider: "opencode", model: "" },
        fixer: { provider: "opencode", model: "" },
      }),
    });

    const results = await invokeUseCase(useCase, param);

    expect(results).toHaveLength(0);
    expect(mockListIssueComments).not.toHaveBeenCalled();
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it("returns empty results when OpenCode is not configured (no model)", async () => {
    const param = baseParam({
      ai: new Ai(
        "http://localhost:4096",
        "",
        false,
        [],
        false,
        "low",
        20,
      ),
    });

    const results = await invokeUseCase(useCase, param);

    expect(results).toHaveLength(0);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it("returns empty results when issue number is -1", async () => {
    const param = baseParam({ issueNumber: -1 });

    const results = await invokeUseCase(useCase, param);

    expect(results).toHaveLength(0);
    expect(mockListIssueComments).not.toHaveBeenCalled();
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('skips draft pull requests when draft reviews are disabled', async () => {
    const results = await invokeUseCase(useCase, baseParam({
      issueNumber: -1,
      isPullRequest: true,
      eventName: 'pull_request',
      pullRequest: { number: 17, head: 'feature/draft', action: 'opened' },
      inputs: { pull_request: { draft: true, head: { sha: 'a'.repeat(40) } } },
    }));

    expect(results[0]).toEqual(expect.objectContaining({ success: true, executed: false }));
    expect(results[0].payload).toEqual(expect.objectContaining({ skipped: 'draft' }));
    expect(mockListIssueComments).not.toHaveBeenCalled();
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('runs issue-only analysis without inferring a pull request branch', async () => {
    mockFindExactHeadCandidateNumbers.mockResolvedValue([]);
    mockAskAgent.mockResolvedValue({ findings: [], resolved_findings: [] });
    const param = baseParam({
      eventName: 'issue_comment',
      commit: { branch: '' },
      inputs: { eventName: 'issue_comment', repo: { owner: 'owner', repo: 'repo' } },
    });

    const results = await invokeUseCase(useCase, param);

    expect(results[0].success).toBe(true);
    expect(mockAskAgent).toHaveBeenCalledTimes(1);
  });

  it("returns a failure when askAgent returns null", async () => {
    mockAskAgent.mockResolvedValue(null);

    const results = await invokeUseCase(useCase, baseParam());

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors[0].message).toContain("no potential-problem analysis");
    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it("returns a failure when askAgent returns a string (non-object)", async () => {
    mockAskAgent.mockResolvedValue("plain text");

    const results = await invokeUseCase(useCase, baseParam());

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors[0].message).toContain("no potential-problem analysis");
    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it("fails closed when the structured response has no findings array", async () => {
    mockAskAgent.mockResolvedValue({ other: "data" });

    const results = await invokeUseCase(useCase, baseParam());

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.[0].message).toContain("no potential-problem analysis");
    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it('returns success with "no new findings, no resolved" when findings and resolved_findings are empty', async () => {
    mockAskAgent.mockResolvedValue({ findings: [], resolved_findings: [] });

    const results = await invokeUseCase(useCase, baseParam());

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps?.[0]).toContain("no new findings, no resolved");
    expect(mockAddComment).not.toHaveBeenCalled();
    expect(mockUpdateComment).not.toHaveBeenCalled();
  });

  it('completes bounded partial analysis without claiming the target is clean', async () => {
    issueCoverageOverride = {
      ...completeCoverage('issue-comments', 200),
      status: 'partial',
      pagesFetched: 2,
      omittedItems: 1,
      limitReached: true,
    };
    mockAskAgent.mockResolvedValue({ findings: [], resolved_findings: [] });

    const [result] = await invokeUseCase(useCase, baseParam());

    expect(result.success).toBe(true);
    expect(result.steps?.[0]).toContain('partial context coverage');
    expect(result.payload).toEqual(expect.objectContaining({
      contextCoverage: expect.objectContaining({ status: 'partial' }),
      bugbotTelemetry: expect.objectContaining({ outcome: 'partial', contextCoverageStatus: 'partial' }),
    }));
  });

  it("calls listIssueComments and askAgent with repo context and no previous block when no comments", async () => {
    mockAskAgent.mockResolvedValue({ findings: [], resolved_findings: [] });

    await invokeUseCase(useCase, baseParam());

    expect(mockListIssueComments).toHaveBeenCalledWith(
      "owner",
      "repo",
      42,
      "token",
    );
    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    const prompt = mockAskAgent.mock.calls[0][2];
    expect(prompt).toContain("Owner: owner");
    expect(prompt).toContain("Repository: repo");
    expect(prompt).toContain("feature/42-add-feature");
    expect(prompt).toContain("develop");
    expect(prompt).not.toContain("Previously reported issues");
  });

  it("when OpenCode returns one finding, adds comment on issue and does not update", async () => {
    const finding = {
      id: "src/foo.ts:10:possible-null",
      title: "Possible null dereference",
      description: "Variable x may be null here.",
    };
    mockAskAgent.mockResolvedValue({ findings: [finding] });

    const results = await invokeUseCase(useCase, baseParam());

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].steps?.[0]).toContain("1 new/current finding(s)");
    expect(mockAddComment).toHaveBeenCalledTimes(1);
    expect(mockAddComment).toHaveBeenCalledWith(
      "owner",
      "repo",
      42,
      expect.any(String),
      "token",
      undefined,
    );
    expect(mockAddComment.mock.calls[0][3]).toContain(
      "Possible null dereference",
    );
    expect(mockAddComment.mock.calls[0][3]).toContain("copilot-bugbot");
    expect(mockAddComment.mock.calls[0][3]).toContain(
      'finding_id:"src/foo.ts:10:possible-null"',
    );
    expect(mockUpdateComment).not.toHaveBeenCalled();
  });

  it("when OpenCode returns one finding and there is an open PR, creates review comments", async () => {
    const finding = {
      id: "src/bar.ts:5:missing-check",
      title: "Missing validation",
      description: "Add null check.",
      file: "src/bar.ts",
      line: 5,
    };
    mockAskAgent.mockResolvedValue({ findings: [finding] });
    mockFindExactHeadCandidateNumbers.mockResolvedValue([100]);
    mockGetPullRequestHeadSha.mockResolvedValue("abc123");
    mockGetChangedFiles.mockResolvedValue([
      { filename: "src/bar.ts", status: "modified" },
    ]);
    mockGetFilesWithFirstDiffLine.mockResolvedValue([
      { path: "src/bar.ts", firstLine: 5 },
    ]);
    mockGetFilesWithDiffLocations.mockResolvedValue([
      { path: "src/bar.ts", locations: [{ line: 5, side: "RIGHT" }] },
    ]);
    mockListPullRequestReviewComments.mockResolvedValue([]);

    await invokeUseCase(useCase, baseParam());

    expect(mockCreateReviewWithComments).toHaveBeenCalledTimes(1);
    expect(mockCreateReviewWithComments).toHaveBeenCalledWith(
      "owner",
      "repo",
      100,
      "abc123",
      expect.stringContaining("## 🤖 Bugbot review"),
      expect.arrayContaining([
        expect.objectContaining({
          path: "src/bar.ts",
          line: 5,
          body: expect.stringContaining("Missing validation"),
        }),
      ]),
      "token",
    );
  });

  it("fails presentation closed when an open PR has no trusted author bound", async () => {
    mockAskAgent.mockResolvedValue({ findings: [], resolved_findings: [] });
    mockFindExactHeadCandidateNumbers.mockResolvedValue([100]);
    mockGetPullRequestHeadSha.mockResolvedValue("abc123");

    const results = await invokeUseCase(useCase, baseParam({ tokenUser: undefined }));

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].payload).toEqual(expect.objectContaining({
      reviewProjection: expect.objectContaining({
        errors: expect.arrayContaining([
          "The authenticated Bugbot identity is unavailable.",
        ]),
      }),
    }));
    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it("rejects an event PR whose provider head is already stale", async () => {
    const eventSha = "a".repeat(40);
    const currentSha = "b".repeat(40);
    mockGetPullRequestHeadSha.mockResolvedValue(currentSha);
    mockGetChangedFiles.mockResolvedValue([]);
    mockGetFilesWithFirstDiffLine.mockResolvedValue([]);

    const results = await invokeUseCase(useCase, baseParam({
      issueNumber: -1,
      isPullRequest: true,
      eventName: "pull_request",
      inputs: {
        eventName: "pull_request",
        pull_request: { head: { sha: eventSha } },
      },
      pullRequest: { number: 100, head: "feature/head", action: "synchronize" },
    }));

    expect(results[0].success).toBe(false);
    expect(mockAskAgent).not.toHaveBeenCalled();
    expect(mockCreateReviewWithComments).not.toHaveBeenCalled();
  });

  it("discards analysis when the PR head changes while the agent is running", async () => {
    const analyzedSha = "a".repeat(40);
    const newerSha = "b".repeat(40);
    mockGetPullRequestHeadSha
      .mockResolvedValueOnce(analyzedSha)
      .mockResolvedValueOnce(newerSha);
    mockGetChangedFiles.mockResolvedValue([{ filename: "src/a.ts", status: "modified" }]);
    mockGetFilesWithFirstDiffLine.mockResolvedValue([{ path: "src/a.ts", firstLine: 1 }]);
    mockAskAgent.mockResolvedValue({ findings: [{
      id: "stale",
      title: "Stale finding",
      description: "Must never be published.",
      file: "src/a.ts",
      line: 1,
    }] });

    const results = await invokeUseCase(useCase, baseParam({
      issueNumber: -1,
      isPullRequest: true,
      eventName: "pull_request",
      inputs: { eventName: "pull_request", pull_request: {} },
      pullRequest: { number: 100, head: "feature/head", action: "synchronize" },
    }));

    expect(results[0].payload).toEqual(expect.objectContaining({ superseded: true }));
    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(mockCreateReviewWithComments).not.toHaveBeenCalled();
  });

  it("when finding already has issue comment, updates instead of adding", async () => {
    const finding = {
      id: "existing-finding-id",
      title: "Existing problem",
      description: "Still there.",
    };
    mockListIssueComments.mockResolvedValue([
      {
        id: 999,
        body: `## Existing problem\n\nDetails.\n\n${markerFor(finding)}`,
        user: { login: "bot" },
      },
    ]);
    mockAskAgent.mockResolvedValue({ findings: [finding] });

    await invokeUseCase(useCase, baseParam());

    expect(mockUpdateComment).toHaveBeenCalledWith(
      "owner",
      "repo",
      42,
      999,
      expect.any(String),
      "token",
      undefined,
    );
    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it("when a previous unresolved finding exists, resolved_findings marks it fixed", async () => {
    mockListIssueComments.mockResolvedValue([
      {
        id: 888,
        body: `## Old bug\n\nDescription.\n\n${markerFor({ id: "old-bug-id", title: "Old bug", description: "Description." })}`,
        user: { login: "bot" },
      },
    ]);
    mockAskAgent.mockResolvedValue({
      findings: [],
      resolved_findings: [{ id: "old-bug-id", resolution: "fixed" }],
    });

    await invokeUseCase(useCase, baseParam());

    const prompt = mockAskAgent.mock.calls[0][2];
    expect(prompt).toContain("Previously reported issues");
    expect(prompt).toContain("old-bug-id");
    expect(prompt).toContain("Old bug");

    expect(mockUpdateComment).toHaveBeenCalledWith(
      "owner",
      "repo",
      42,
      888,
      expect.stringContaining("Resolved"),
      "token",
      undefined,
    );
    expect(mockUpdateComment.mock.calls[0][4]).toContain("resolved:true");
  });

  it('keeps an existing unresolved finding actionable when the agent returns no findings', async () => {
    mockListIssueComments.mockResolvedValue([
      {
        id: 889,
        body: `## Still open\n\nDescription.\n\n${markerFor({ id: "still-open", title: "Still open", description: "Description." })}`,
        user: { login: 'bot' },
      },
    ]);
    mockAskAgent.mockResolvedValue({ findings: [], resolved_findings: [] });

    const results = await invokeUseCase(useCase, baseParam());

    expect(results[0].payload).toEqual(expect.objectContaining({
      findingStates: expect.objectContaining({ open: 1 }),
    }));
  });

  it("when the agent returns resolved_findings, updates the PR review comment to resolved", async () => {
    mockListIssueComments.mockResolvedValue([]);
    mockFindExactHeadCandidateNumbers.mockResolvedValue([50]);
    mockListPullRequestReviewComments.mockResolvedValue([
      {
        id: 777,
        identity: "PRRC_777",
        authorLogin: "bot",
        body: `## PR finding\n\n${markerFor({ id: "pr-finding", title: "PR finding", description: "Description." })}`,
        path: "src/a.ts",
        line: 1,
      },
    ]);
    mockAskAgent.mockResolvedValue({
      findings: [],
      resolved_findings: [{ id: "pr-finding", resolution: "fixed" }],
    });

    await invokeUseCase(useCase, baseParam());

    expect(mockUpdatePullRequestReviewComment).toHaveBeenCalledWith(
      "owner",
      "repo",
      "PRRC_777",
      expect.stringContaining("resolved:true"),
      "token",
    );
    expect(mockResolvePullRequestReviewThread).toHaveBeenCalledWith(
      "owner",
      "repo",
      50,
      "PRRC_777",
      "token",
    );
    expect(
      mockUpdatePullRequestReviewComment.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mockResolvePullRequestReviewThread.mock.invocationCallOrder[0],
    );
  });

  it("retains a resolved marker for retry when review-thread resolution fails", async () => {
    const { logError } = require("../../../../../utils/logger");
    mockListIssueComments.mockResolvedValue([]);
    mockFindExactHeadCandidateNumbers.mockResolvedValue([50]);
    mockListPullRequestReviewComments.mockResolvedValue([
      {
        id: 777,
        identity: "PRRC_777",
        authorLogin: "bot",
        body: `## PR finding\n\n${markerFor({ id: "pr-finding", title: "PR finding", description: "Description." })}`,
        path: "src/a.ts",
        line: 1,
      },
    ]);
    mockAskAgent.mockResolvedValue({
      findings: [],
      resolved_findings: [{ id: "pr-finding", resolution: "fixed" }],
    });
    mockResolvePullRequestReviewThread.mockRejectedValue(
      new Error("provider rejected secret-token"),
    );

    const results = await invokeUseCase(useCase, baseParam());

    expect(mockUpdatePullRequestReviewComment).toHaveBeenCalledWith(
      'owner',
      'repo',
      'PRRC_777',
      expect.stringContaining('finding_resolution:"fixed"'),
      'token',
    );
    expect(results.some((result) => !result.success)).toBe(true);
    const visibleErrors = results
      .flatMap((result) => result.errors)
      .map((error) => error.message)
      .join("\n");
    expect(visibleErrors).toContain("Bugbot finding presentation failed.");
    expect(visibleErrors).not.toContain("secret-token");
    expect(JSON.stringify(logError.mock.calls)).not.toContain("secret-token");
  });

  it("does not mark as resolved when a finding id is absent from resolved_findings", async () => {
    mockListIssueComments.mockResolvedValue([
      {
        id: 666,
        body: `## Unfixed\n\n${markerFor({ id: "unfixed-id", title: "Unfixed", description: "Description." })}`,
        user: { login: "bot" },
      },
    ]);
    mockAskAgent.mockResolvedValue({
      findings: [],
      resolved_findings: [], // does not include unfixed-id
    });

    await invokeUseCase(useCase, baseParam());

    expect(mockUpdateComment).not.toHaveBeenCalled();
  });

  it("returns a sanitized failure result when askAgent throws", async () => {
    const { logError } = require("../../../../../utils/logger");
    mockAskAgent.mockRejectedValue(new Error("OpenCode timeout secret-token"));

    const results = await invokeUseCase(useCase, baseParam());

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].executed).toBe(true);
    expect(
      results[0].errors?.some((e) =>
        String(e).includes("DetectPotentialProblemsUseCase"),
      ),
    ).toBe(true);
    expect(
      results[0].errors?.some((e) =>
        String(e).includes("Unable to detect potential problems."),
      ),
    ).toBe(true);
    expect(JSON.stringify(results)).not.toContain("secret-token");
    expect(JSON.stringify(logError.mock.calls)).not.toContain("secret-token");
  });

  it("reports a sanitized failure when provider review-comment publication fails", async () => {
    const providerError = new Error("provider rejected secret-token");
    const createReview = jest.fn().mockRejectedValue(providerError);
    const commandRepository = new PullRequestReviewCommentCommandRepository(
      {
        getClient: jest.fn(() => ({
          rest: { pulls: { createReview } },
        })),
      } as never,
      { getClient: jest.fn() } as never,
    );
    const rulesPort = { loadRules: jest.fn().mockResolvedValue([]) };
    const listReviewThreadStates = jest.fn().mockResolvedValue({});
    const issueComments = {
      addComment: (issueNumber: number, body: string, options?: { commitSha?: string }) =>
        mockAddComment('owner', 'repo', issueNumber, body, 'secret-token', options),
      updateComment: (
        issueNumber: number,
        commentId: number,
        body: string,
        options?: { commitSha?: string },
      ) => mockUpdateComment(
        'owner',
        'repo',
        issueNumber,
        commentId,
        body,
        'secret-token',
        options,
      ),
    };
    const pullRequestComments = {
      createReviewWithComments: (
        pullRequestNumber: number,
        commitId: string,
        body: string,
        comments: Parameters<PullRequestReviewCommentCommandRepository['createReviewWithComments']>[5],
      ) => commandRepository.createReviewWithComments(
        'owner',
        'repo',
        pullRequestNumber,
        commitId,
        body,
        comments,
        'secret-token',
      ),
      updatePullRequestReviewComment: jest.fn().mockResolvedValue(undefined),
      resolvePullRequestReviewThread: jest.fn().mockResolvedValue(undefined),
      unresolvePullRequestReviewThread: jest.fn().mockResolvedValue(undefined),
      listPullRequestReviewComments: (pullRequestNumber: number) =>
        mockListPullRequestReviewComments('owner', 'repo', pullRequestNumber, 'secret-token'),
    };
    const context = {
      getPullRequest: async (pullRequestNumber: number) => ({
        number: pullRequestNumber,
        state: 'open' as const,
        baseRepository: { owner: 'owner', name: 'repo' },
        headRepositoryOwner: 'owner',
        headRef: 'feature/head',
        headSha: await mockGetPullRequestHeadSha(pullRequestNumber),
      }),
      findOpenPullRequestsByExactHead: async (headOwner: string, headRef: string) => {
        const numbers = await mockFindExactHeadCandidateNumbers(headRef);
        return Promise.all(numbers.map(async (number: number) => ({
          number,
          state: 'open' as const,
          baseRepository: { owner: 'owner', name: 'repo' },
          headRepositoryOwner: headOwner,
          headRef,
          headSha: await mockGetPullRequestHeadSha(number),
        })));
      },
      listIssueComments: async (issueNumber: number) => {
        const value = await mockListIssueComments('owner', 'repo', issueNumber, 'secret-token');
        return { value, coverage: completeCoverage('issue-comments', value.length) };
      },
      listPullRequestReviewComments: async (pullRequestNumber: number) => {
        const value = await mockListPullRequestReviewComments(
          'owner',
          'repo',
          pullRequestNumber,
          'secret-token',
        );
        return {
          value,
          coverage: completeCoverage('pull-request-comments', value.length),
        };
      },
      listPullRequestReviewThreadStates: async (pullRequestNumber: number) => {
        const value = await listReviewThreadStates(pullRequestNumber);
        return {
          value,
          coverage: completeCoverage('review-threads', Object.keys(value).length),
        };
      },
      getReviewDiffSnapshot: async (pullRequestNumber: number) => {
        const value = await mockGetReviewDiffSnapshot(
          'owner',
          'repo',
          pullRequestNumber,
          'secret-token',
        );
        return { value, coverage: completeCoverage('diff', value.changes.length) };
      },
      getPullRequestHeadSha: (pullRequestNumber: number) =>
        mockGetPullRequestHeadSha('owner', 'repo', pullRequestNumber, 'secret-token'),
      getPullRequestReviewCommentBody: jest.fn().mockResolvedValue(null),
      loadRules: rulesPort.loadRules,
    };
    const integratedUseCase = new DetectPotentialProblemsUseCase(
      {
        query: (request: {
          configuration: unknown;
          agentId: string;
          prompt: string;
          options?: unknown;
        }) =>
          mockAskAgent(
            request.configuration,
            request.agentId,
            request.prompt,
            request.options,
          ),
      },
      {
        context,
        publication: { issueComments, pullRequestComments },
        resolution: { issueComments, pullRequestComments },
        reconciliation: {
          snapshot: {
            listIssueComments: (issueNumber: number) =>
              mockListIssueComments('owner', 'repo', issueNumber, 'secret-token'),
            listPullRequestReviewComments: pullRequestComments.listPullRequestReviewComments,
            listPullRequestReviewThreadStates: listReviewThreadStates,
            listPullRequestReviews: (pullRequestNumber: number) =>
              mockListPullRequestReviews('owner', 'repo', pullRequestNumber, 'secret-token'),
            getPullRequestHeadSha: context.getPullRequestHeadSha,
            navigationForPullRequest: () => ({
              pullRequestUrl: 'https://github.com/org/repo/pull/7',
              commitUrl: `https://github.com/org/repo/commit/${'a'.repeat(40)}`,
            }),
          },
          presentation: {
            comments: issueComments,
            updatePullRequestReview: jest.fn().mockResolvedValue(undefined),
          },
        },
      },
    );
    mockAskAgent.mockResolvedValue({
      findings: [
        {
          id: "f1",
          title: "Finding",
          description: "Description",
          file: "src/a.ts",
          line: 1,
        },
      ],
    });
    mockFindExactHeadCandidateNumbers.mockResolvedValue([50]);
    mockGetPullRequestHeadSha.mockResolvedValue("sha");
    mockGetChangedFiles.mockResolvedValue([
      { filename: "src/a.ts", status: "modified" },
    ]);
    mockGetFilesWithFirstDiffLine.mockResolvedValue([
      { path: "src/a.ts", firstLine: 1 },
    ]);
    mockListPullRequestReviewComments.mockResolvedValue([]);

    const results = await integratedUseCase.invoke(
      projectBugbotReviewOperationContext(baseParam({
        tokens: { token: "secret-token" },
      })),
    );

    expect(createReview).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    const errors = results[0].errors.map((error) => error.message).join("\n");
    expect(errors).toContain("Bugbot finding presentation failed.");
    expect(errors).not.toContain("provider rejected");
    expect(errors).not.toContain("secret-token");
  });

  it("step message includes both findings count and resolved count when both present", async () => {
    mockAskAgent.mockResolvedValue({
      findings: [{ id: "new-1", title: "New", description: "D" }],
      resolved_findings: [{ id: "old-1", resolution: "fixed" }],
    });
    mockListIssueComments.mockResolvedValue([
      {
        id: 1,
        body: markerFor({ id: "old-1", title: "Old", description: "Description." }),
        user: { login: "bot" },
      },
    ]);

    const results = await invokeUseCase(useCase, baseParam());

    expect(results[0].success).toBe(true);
    expect(results[0].steps?.[0]).toMatch(
      /1 new\/current finding\(s\).*1 marked as resolved/,
    );
  });

  it("when there are no open PRs, does not call createReviewWithComments or getPullRequestHeadSha", async () => {
    mockFindExactHeadCandidateNumbers.mockResolvedValue([]);
    mockAskAgent.mockResolvedValue({
      findings: [{ id: "f1", title: "T", description: "D" }],
    });

    await invokeUseCase(useCase, baseParam());

    expect(mockGetPullRequestHeadSha).not.toHaveBeenCalled();
    expect(mockCreateReviewWithComments).not.toHaveBeenCalled();
    expect(mockAddComment).toHaveBeenCalledTimes(1);
  });

  it("when finding has no file/line, keeps it inside the PR review", async () => {
    mockAskAgent.mockResolvedValue({
      findings: [
        { id: "no-loc", title: "General issue", description: "No location." },
      ],
    });
    mockFindExactHeadCandidateNumbers.mockResolvedValue([200]);
    mockGetPullRequestHeadSha.mockResolvedValue("sha1");
    mockGetChangedFiles.mockResolvedValue([
      { filename: "lib/helper.ts", status: "modified" },
    ]);
    mockGetFilesWithFirstDiffLine.mockResolvedValue([
      { path: "lib/helper.ts", firstLine: 1 },
    ]);
    mockGetFilesWithDiffLocations.mockResolvedValue([
      { path: "lib/helper.ts", locations: [{ line: 1, side: "RIGHT" }] },
    ]);
    mockListPullRequestReviewComments.mockResolvedValue([]);

    await invokeUseCase(useCase, baseParam());

    expect(mockAddComment).toHaveBeenCalledWith(
      'owner',
      'repo',
      200,
      expect.stringContaining('Bugbot status'),
      'token',
      { commitSha: 'sha1' },
    );
    expect(mockCreateReviewWithComments).toHaveBeenCalledWith(
      "owner",
      "repo",
      200,
      "sha1",
      expect.stringContaining("General issue"),
      [expect.objectContaining({
        path: "lib/helper.ts",
        subjectType: "file",
        body: expect.stringContaining("Review-level finding"),
      })],
      "token",
    );
  });

  it("when existing finding has prCommentId for same PR, updates review comment instead of creating", async () => {
    const finding = {
      id: "same-pr-finding",
      title: "Same",
      description: "Desc",
      file: "x.ts",
      line: 1,
    };
    mockListIssueComments.mockResolvedValue([]);
    mockFindExactHeadCandidateNumbers.mockResolvedValue([60]);
    mockListPullRequestReviewComments.mockResolvedValue([
      {
        id: 555,
        identity: "PRRC_555",
        authorLogin: "bot",
        body: `## Same\n\n${markerFor(finding)}`,
        path: "x.ts",
        line: 1,
      },
    ]);
    mockGetPullRequestHeadSha.mockResolvedValue("sha2");
    mockGetChangedFiles.mockResolvedValue([
      { filename: "x.ts", status: "modified" },
    ]);
    mockAskAgent.mockResolvedValue({ findings: [finding] });

    await invokeUseCase(useCase, baseParam());

    expect(mockUpdatePullRequestReviewComment).toHaveBeenCalledWith(
      "owner",
      "repo",
      "PRRC_555",
      expect.stringContaining("Same"),
      "token",
    );
    expect(mockCreateReviewWithComments).not.toHaveBeenCalled();
  });

  it("uses branches.development when currentConfiguration.parentBranch is undefined", async () => {
    mockAskAgent.mockResolvedValue({ findings: [], resolved_findings: [] });
    const param = baseParam({
      currentConfiguration: { parentBranch: undefined },
      branches: { development: "main" },
    });

    await invokeUseCase(useCase, param);

    const prompt = mockAskAgent.mock.calls[0][2];
    expect(prompt).toContain("Base branch: main");
  });

  it("extracts title from comment body (## line) for previous findings in prompt", async () => {
    mockListIssueComments.mockResolvedValue([
      {
        id: 111,
        body: `## Extracted Title Here\n\nSome body.\n\n${markerFor({ id: "ex-id", title: "Extracted Title Here", description: "Some body." })}`,
        user: { login: "bot" },
      },
    ]);
    mockAskAgent.mockResolvedValue({ findings: [], resolved_findings: [] });

    await invokeUseCase(useCase, baseParam());

    const prompt = mockAskAgent.mock.calls[0][2];
    expect(prompt).toContain("Extracted Title Here");
    expect(prompt).toContain("ex-id");
  });

  it("fails closed when findings is not an array", async () => {
    mockAskAgent.mockResolvedValue({ findings: "not-array" });

    const results = await invokeUseCase(useCase, baseParam());

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors?.[0].message).toContain("no potential-problem analysis");
    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it("does not update comment to resolved when already resolved in marker", async () => {
    mockListIssueComments.mockResolvedValue([
      {
        id: 222,
        body: `## Already resolved\n\n${markerFor({ id: "done-id", title: "Already resolved", description: "Description." }, true)}`,
        user: { login: "bot" },
      },
    ]);
    mockAskAgent.mockResolvedValue({
      findings: [],
      resolved_findings: [{ id: "done-id", resolution: "fixed" }],
    });

    await invokeUseCase(useCase, baseParam());

    expect(mockUpdateComment).not.toHaveBeenCalled();
  });

  describe("marker replacement (regex-based, tolerates format variations)", () => {
    it("replaces marker in issue comment when marker has extra whitespace", async () => {
      mockListIssueComments.mockResolvedValue([
        {
          id: 333,
          body: `## Whitespace variant\n\n<!--  copilot-bugbot   finding_id: "spacey-id"   resolved:false   finding_fingerprint: "fp-11111111"   finding_semantic: "sf-11111111"   -->`,
          user: { login: "bot" },
        },
      ]);
      mockAskAgent.mockResolvedValue({
        findings: [],
        resolved_findings: [{ id: "spacey-id", resolution: "fixed" }],
      });

      await invokeUseCase(useCase, baseParam());

      expect(mockUpdateComment).toHaveBeenCalledTimes(1);
      expect(mockUpdateComment).toHaveBeenCalledWith(
        "owner",
        "repo",
        42,
        333,
        expect.any(String),
        "token",
        undefined,
      );
      const updatedBody = mockUpdateComment.mock.calls[0][4];
      expect(updatedBody).toContain("resolved:true");
      expect(updatedBody).toContain(
          "**Resolved** (configured agent confirmed fixed in latest analysis)",
      );
      expect(updatedBody).toContain("copilot-bugbot");
    });

    it("replaces marker in PR review comment when marker has extra whitespace", async () => {
      mockListIssueComments.mockResolvedValue([]);
      mockFindExactHeadCandidateNumbers.mockResolvedValue([80]);
      mockListPullRequestReviewComments
        .mockResolvedValueOnce([
          {
            id: 444,
            identity: "PRRC_444",
            authorLogin: "bot",
            body: `## PR spacey\n\n<!--  copilot-bugbot   finding_id: "pr-spacey-id"   resolved:false   finding_fingerprint: "fp-11111111"   finding_semantic: "sf-11111111"   -->`,
            path: "src/b.ts",
            line: 1,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 444,
            identity: "PRRC_444",
            authorLogin: "bot",
            body: `## PR spacey\n\n<!--  copilot-bugbot   finding_id: "pr-spacey-id"   resolved:false   finding_fingerprint: "fp-11111111"   finding_semantic: "sf-11111111"   -->`,
            path: "src/b.ts",
            line: 1,
          },
        ]);
      mockAskAgent.mockResolvedValue({
        findings: [],
        resolved_findings: [{ id: "pr-spacey-id", resolution: "fixed" }],
      });

      await invokeUseCase(useCase, baseParam());

      expect(mockUpdatePullRequestReviewComment).toHaveBeenCalledTimes(1);
      const updatedBody = mockUpdatePullRequestReviewComment.mock.calls[0][3];
      expect(updatedBody).toContain("resolved:true");
    });

    it("replaces marker when finding id contains regex-special characters", async () => {
      const findingId = "src/utils (helper).ts:10:possible-null";
      mockListIssueComments.mockResolvedValue([
        {
          id: 555,
          body: `## Regex id\n\n${markerFor({ id: findingId, title: "Regex id", description: "Description." })}`,
          user: { login: "bot" },
        },
      ]);
      mockAskAgent.mockResolvedValue({
        findings: [],
        resolved_findings: [{ id: findingId, resolution: "fixed" }],
      });

      await invokeUseCase(useCase, baseParam());

      expect(mockUpdateComment).toHaveBeenCalledTimes(1);
      const updatedBody = mockUpdateComment.mock.calls[0][4];
      expect(updatedBody).toContain("resolved:true");
      expect(updatedBody).toContain(findingId);
    });

    it("rejects finding ids that cannot be represented losslessly in markers", async () => {
      const findingWithBadChars = "file.ts:1:bad-->id<!with<newline>\nhere";
      mockAskAgent.mockResolvedValue({
        findings: [
          {
            id: findingWithBadChars,
            title: "Sanitized ID",
            description: "Finding with unsafe ID chars.",
          },
        ],
      });

      const results = await invokeUseCase(useCase, baseParam());

      expect(mockAddComment).not.toHaveBeenCalled();
      expect(results[0].success).toBe(true);
    });
  });

  describe("bugbot pipeline: severity, ignore paths, limit", () => {
    it("filters out findings below bugbot-severity (minSeverity)", async () => {
      const param = baseParam({
        ai: new Ai(
          "http://localhost:4096",
          "opencode/model",
          false,
          [],
          false,
          "medium",
          20,
        ),
      });
      mockAskAgent.mockResolvedValue({
        findings: [
          {
            id: "low-1",
            title: "Low severity",
            description: "D",
            severity: "low",
          },
          {
            id: "high-1",
            title: "High severity",
            description: "D",
            severity: "high",
          },
        ],
        resolved_findings: [],
      });

      await invokeUseCase(useCase, param);

      expect(mockAddComment).toHaveBeenCalledTimes(1);
      expect(mockAddComment.mock.calls[0][3]).toContain("High severity");
      expect(mockAddComment.mock.calls[0][3]).not.toContain("Low severity");
    });

    it("filters out findings with unsafe file path (path traversal, null byte, absolute)", async () => {
      mockAskAgent.mockResolvedValue({
        findings: [
          { id: "safe", title: "Safe", description: "D", file: "src/foo.ts" },
          {
            id: "traversal",
            title: "Bad",
            description: "D",
            file: "../../../etc/passwd",
          },
          {
            id: "absolute",
            title: "Absolute",
            description: "D",
            file: "/etc/passwd",
          },
        ],
        resolved_findings: [],
      });

      await invokeUseCase(useCase, baseParam());

      expect(mockAddComment).toHaveBeenCalledTimes(1);
      expect(mockAddComment.mock.calls[0][3]).toContain("Safe");
      expect(mockAddComment.mock.calls[0][3]).not.toContain("Bad");
      expect(mockAddComment.mock.calls[0][3]).not.toContain("Absolute");
    });

    it("filters out findings in ai-ignore-files paths", async () => {
      const param = baseParam({
        ai: new Ai(
          "http://localhost:4096",
          "opencode/model",
          false,
          ["src/ignored/*", "**/build/**"],
          false,
          "low",
          20,
        ),
      });
      mockAskAgent.mockResolvedValue({
        findings: [
          {
            id: "ignored-1",
            title: "In ignored dir",
            description: "D",
            file: "src/ignored/foo.ts",
          },
          {
            id: "ok-1",
            title: "Not ignored",
            description: "D",
            file: "src/app/bar.ts",
          },
        ],
        resolved_findings: [],
      });

      await invokeUseCase(useCase, param);

      expect(mockAddComment).toHaveBeenCalledTimes(1);
      expect(mockAddComment.mock.calls[0][3]).toContain("Not ignored");
      expect(mockAddComment.mock.calls[0][3]).not.toContain("In ignored dir");
    });

    it("when findings exceed limit, publishes max then one overflow summary comment on issue", async () => {
      const manyFindings = Array.from({ length: 22 }, (_, i) => ({
        id: `f${i}`,
        title: `Finding ${i}`,
        description: "Desc",
      }));
      mockAskAgent.mockResolvedValue({
        findings: manyFindings,
        resolved_findings: [],
      });

      await invokeUseCase(useCase, baseParam());

      expect(mockAddComment).toHaveBeenCalled();
      const bodies = mockAddComment.mock.calls.map((c) => c[3] as string);
      const overflowComment = bodies.find(
        (b) =>
          b.includes("More findings (comment limit)") ||
          b.includes("more finding(s)"),
      );
      expect(overflowComment).toBeDefined();
      expect(overflowComment).toContain("more finding(s)");
      const findingComments = bodies.filter(
        (b) => b.includes("copilot-bugbot") && b.includes("finding_id"),
      );
      expect(findingComments.length).toBe(20);
    });

    it("preserves distinct findings reported on the same line", async () => {
      mockAskAgent.mockResolvedValue({
        findings: [
          {
            id: "first",
            title: "First",
            description: "D",
            file: "src/same.ts",
            line: 5,
          },
          {
            id: "second",
            title: "Second",
            description: "D",
            file: "src/same.ts",
            line: 5,
          },
        ],
        resolved_findings: [],
      });

      await invokeUseCase(useCase, baseParam());

      expect(mockAddComment).toHaveBeenCalledTimes(2);
      const bodies = mockAddComment.mock.calls.map((call) => call[3] as string);
      expect(bodies.some((body) => body.includes("First"))).toBe(true);
      expect(bodies.some((body) => body.includes("Second"))).toBe(true);
    });
  });
});
