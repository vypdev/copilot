/**
 * Unit tests for DetectPotentialProblemsUseCase (bugbot on push).
 * Covers: skip when OpenCode/issue missing, prompt with/without previous findings,
 * new findings (add/update issue and PR comments), resolved_finding_ids, errors.
 */

import { DetectPotentialProblemsUseCase } from "../detect_potential_problems_use_case";
import { PullRequestReviewCommentCommandRepository } from "../../../../../data/repository/pull_request/pull_request_review_comment_command_repository";
import { Ai } from "../../../../../data/model/ai";
import type { Execution } from "../../../../../data/model/execution";

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

const mockGetOpenPullRequestNumbersByHeadBranch = jest.fn();
const mockGetHeadBranchForIssue = jest.fn();
const mockListPullRequestReviewComments = jest.fn();
const mockGetPullRequestHeadSha = jest.fn();
const mockGetChangedFiles = jest.fn();
const mockGetFilesWithFirstDiffLine = jest.fn();
const mockCreateReviewWithComments = jest.fn();
const mockUpdatePullRequestReviewComment = jest.fn();
const mockResolvePullRequestReviewThread = jest.fn();
const mockUnresolvePullRequestReviewThread = jest.fn();

const mockAskAgent = jest.fn();

function baseParam(overrides: Record<string, unknown> = {}): Execution {
  return {
    owner: "owner",
    repo: "repo",
    issueNumber: 42,
    tokens: { token: "token" },
    commit: { branch: "feature/42-add-feature" },
    currentConfiguration: { parentBranch: "develop" },
    branches: { development: "develop" },
    ai: new Ai(
      "http://localhost:4096",
      "opencode/model",
      false,
      false,
      [],
      false,
      "low",
      20,
    ),
    ...overrides,
  } as unknown as Execution;
}

describe("DetectPotentialProblemsUseCase", () => {
  let useCase: DetectPotentialProblemsUseCase;

  beforeEach(() => {
    const issuePort = {
      listIssueComments: mockListIssueComments,
      addComment: mockAddComment,
      updateComment: mockUpdateComment,
    };
    const pullRequestPort = {
      getHeadBranchForIssue: mockGetHeadBranchForIssue,
      getPullRequestReviewCommentBody: jest.fn(),
      getOpenPullRequestNumbersByHeadBranch:
        mockGetOpenPullRequestNumbersByHeadBranch,
      listPullRequestReviewComments: mockListPullRequestReviewComments,
      getPullRequestHeadSha: mockGetPullRequestHeadSha,
      getChangedFiles: mockGetChangedFiles,
      getFilesWithFirstDiffLine: mockGetFilesWithFirstDiffLine,
      createReviewWithComments: mockCreateReviewWithComments,
      updatePullRequestReviewComment: mockUpdatePullRequestReviewComment,
      resolvePullRequestReviewThread: mockResolvePullRequestReviewThread,
      unresolvePullRequestReviewThread: mockUnresolvePullRequestReviewThread,
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
      { issue: issuePort, pullRequest: pullRequestPort },
      { issueComments: issuePort, pullRequestComments: pullRequestPort },
      { issueComments: issuePort, pullRequestComments: pullRequestPort },
    );
    mockListIssueComments.mockReset();
    mockAddComment.mockReset();
    mockUpdateComment.mockReset();
    mockGetOpenPullRequestNumbersByHeadBranch.mockReset();
    mockGetHeadBranchForIssue.mockReset();
    mockListPullRequestReviewComments.mockReset();
    mockGetPullRequestHeadSha.mockReset();
    mockGetChangedFiles.mockReset();
    mockGetFilesWithFirstDiffLine.mockReset();
    mockCreateReviewWithComments.mockReset();
    mockUpdatePullRequestReviewComment.mockReset();
    mockResolvePullRequestReviewThread.mockReset();
    mockUnresolvePullRequestReviewThread.mockReset();
    mockAskAgent.mockReset();

    mockListIssueComments.mockResolvedValue([]);
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([]);
    mockGetFilesWithFirstDiffLine.mockResolvedValue([]);
  });

  it("returns empty results when the findings CLI is not configured", async () => {
    const param = baseParam({
      ai: new Ai("", "opencode/model", false, false, [], false, "low", 20, [], {
        findings: { provider: "opencode", model: "opencode/model", command: "" },
        fixer: { provider: "opencode", model: "opencode/model", command: "" },
      }),
    });

    const results = await useCase.invoke(param);

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
        false,
        [],
        false,
        "low",
        20,
      ),
    });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(0);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it("returns empty results when ai is undefined", async () => {
    const param = baseParam({ ai: undefined });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(0);
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it("uses default ignore patterns and comment limit when ai has no getAiIgnoreFiles nor getBugbotCommentLimit", async () => {
    const minimalAi = {
      getAgentConfiguration: () => ({
        provider: "opencode",
        model: "opencode/model",
        command: "opencode run",
      }),
      getBugbotMinSeverity: () => "low",
    } as unknown as Execution["ai"];
    const param = baseParam({ ai: minimalAi });
    mockAskAgent.mockResolvedValue({
      findings: [{ id: "f1", title: "One", description: "D" }],
      resolved_finding_ids: [],
    });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(mockAddComment).toHaveBeenCalledTimes(1);
    expect(mockAddComment.mock.calls[0][3]).toContain("One");
  });

  it("returns empty results when issue number is -1", async () => {
    const param = baseParam({ issueNumber: -1 });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(0);
    expect(mockListIssueComments).not.toHaveBeenCalled();
    expect(mockAskAgent).not.toHaveBeenCalled();
  });

  it('resolves the linked branch for an issue comment without a checkout ref', async () => {
    mockGetHeadBranchForIssue.mockResolvedValue('feature/42-from-issue');
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([]);
    mockAskAgent.mockResolvedValue({ findings: [], resolved_finding_ids: [] });
    const param = baseParam({
      eventName: 'issue_comment',
      commit: { branch: '' },
      inputs: { eventName: 'issue_comment', repo: { owner: 'owner', repo: 'repo' } },
    });

    const results = await useCase.invoke(param);

    expect(results[0].success).toBe(true);
    expect(mockGetHeadBranchForIssue).toHaveBeenCalledWith('owner', 'repo', 42, 'token');
    expect(mockAskAgent).toHaveBeenCalledTimes(1);
  });

  it("returns a failure when askAgent returns null", async () => {
    mockAskAgent.mockResolvedValue(null);

    const results = await useCase.invoke(baseParam());

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors[0].message).toContain("no potential-problem analysis");
    expect(mockAskAgent).toHaveBeenCalledTimes(1);
    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it("returns a failure when askAgent returns a string (non-object)", async () => {
    mockAskAgent.mockResolvedValue("plain text");

    const results = await useCase.invoke(baseParam());

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].errors[0].message).toContain("no potential-problem analysis");
    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it("returns success with no-new-findings when response has no findings array", async () => {
    mockAskAgent.mockResolvedValue({ other: "data" });

    const results = await useCase.invoke(baseParam());

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].steps?.[0]).toContain("no new findings, no resolved");
    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it('returns success with "no new findings, no resolved" when findings and resolved_finding_ids are empty', async () => {
    mockAskAgent.mockResolvedValue({ findings: [], resolved_finding_ids: [] });

    const results = await useCase.invoke(baseParam());

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps?.[0]).toContain("no new findings, no resolved");
    expect(mockAddComment).not.toHaveBeenCalled();
    expect(mockUpdateComment).not.toHaveBeenCalled();
  });

  it("calls listIssueComments and askAgent with repo context and no previous block when no comments", async () => {
    mockAskAgent.mockResolvedValue({ findings: [], resolved_finding_ids: [] });

    await useCase.invoke(baseParam());

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

    const results = await useCase.invoke(baseParam());

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
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([100]);
    mockGetPullRequestHeadSha.mockResolvedValue("abc123");
    mockGetChangedFiles.mockResolvedValue([
      { filename: "src/bar.ts", status: "modified" },
    ]);
    mockListPullRequestReviewComments.mockResolvedValue([]);

    await useCase.invoke(baseParam());

    expect(mockCreateReviewWithComments).toHaveBeenCalledTimes(1);
    expect(mockCreateReviewWithComments).toHaveBeenCalledWith(
      "owner",
      "repo",
      100,
      "abc123",
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

  it("when finding already has issue comment, updates instead of adding", async () => {
    const finding = {
      id: "existing-finding-id",
      title: "Existing problem",
      description: "Still there.",
    };
    mockListIssueComments.mockResolvedValue([
      {
        id: 999,
        body: `## Existing problem\n\nDetails.\n\n<!-- copilot-bugbot finding_id:"existing-finding-id" resolved:false -->`,
        user: { login: "bot" },
      },
    ]);
    mockAskAgent.mockResolvedValue({ findings: [finding] });

    await useCase.invoke(baseParam());

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

  it("when previous unresolved finding exists, prompt includes it and resolved_finding_ids marks it resolved", async () => {
    mockListIssueComments.mockResolvedValue([
      {
        id: 888,
        body: `## Old bug\n\nDescription.\n\n<!-- copilot-bugbot finding_id:"old-bug-id" resolved:false -->`,
        user: { login: "bot" },
      },
    ]);
    mockAskAgent.mockResolvedValue({
      findings: [],
      resolved_finding_ids: ["old-bug-id"],
    });

    await useCase.invoke(baseParam());

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
    );
    expect(mockUpdateComment.mock.calls[0][4]).toContain("resolved:true");
  });

  it('keeps an existing unresolved finding actionable when the agent returns no findings', async () => {
    mockListIssueComments.mockResolvedValue([
      {
        id: 889,
        body: `## Still open\n\nDescription.\n\n<!-- copilot-bugbot finding_id:"still-open" resolved:false -->`,
        user: { login: 'bot' },
      },
    ]);
    mockAskAgent.mockResolvedValue({ findings: [], resolved_finding_ids: [] });

    const results = await useCase.invoke(baseParam());

    expect(results[0].payload).toEqual(expect.objectContaining({
      findingStates: expect.objectContaining({ open: 1 }),
    }));
  });

  it("when OpenCode returns resolved_finding_ids, updates PR review comment to resolved", async () => {
    mockListIssueComments.mockResolvedValue([]);
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([50]);
    mockListPullRequestReviewComments.mockResolvedValue([
      {
        id: 777,
        identity: "PRRC_777",
        body: `## PR finding\n\n<!-- copilot-bugbot finding_id:"pr-finding" resolved:false -->`,
        path: "src/a.ts",
        line: 1,
      },
    ]);
    mockAskAgent.mockResolvedValue({
      findings: [],
      resolved_finding_ids: ["pr-finding"],
    });

    await useCase.invoke(baseParam());

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
      mockResolvePullRequestReviewThread.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mockUpdatePullRequestReviewComment.mock.invocationCallOrder[0],
    );
  });

  it("reports a sanitized failure without updating the marker when review-thread resolution fails", async () => {
    const { logError } = require("../../../../../utils/logger");
    mockListIssueComments.mockResolvedValue([]);
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([50]);
    mockListPullRequestReviewComments.mockResolvedValue([
      {
        id: 777,
        identity: "PRRC_777",
        body: `## PR finding\n\n<!-- copilot-bugbot finding_id:"pr-finding" resolved:false -->`,
        path: "src/a.ts",
        line: 1,
      },
    ]);
    mockAskAgent.mockResolvedValue({
      findings: [],
      resolved_finding_ids: ["pr-finding"],
    });
    mockResolvePullRequestReviewThread.mockRejectedValue(
      new Error("provider rejected secret-token"),
    );

    const results = await useCase.invoke(baseParam());

    expect(mockUpdatePullRequestReviewComment).not.toHaveBeenCalled();
    expect(results.some((result) => !result.success)).toBe(true);
    const visibleErrors = results
      .flatMap((result) => result.errors)
      .map((error) => error.message)
      .join("\n");
    expect(visibleErrors).toContain(
      "Unable to mark a pull request finding as resolved.",
    );
    expect(visibleErrors).not.toContain("secret-token");
    expect(JSON.stringify(logError.mock.calls)).not.toContain("secret-token");
  });

  it("does not mark as resolved when finding id is not in resolved_finding_ids", async () => {
    mockListIssueComments.mockResolvedValue([
      {
        id: 666,
        body: `## Unfixed\n\n<!-- copilot-bugbot finding_id:"unfixed-id" resolved:false -->`,
        user: {},
      },
    ]);
    mockAskAgent.mockResolvedValue({
      findings: [],
      resolved_finding_ids: [], // not including unfixed-id
    });

    await useCase.invoke(baseParam());

    expect(mockUpdateComment).not.toHaveBeenCalled();
  });

  it("returns a sanitized failure result when askAgent throws", async () => {
    const { logError } = require("../../../../../utils/logger");
    mockAskAgent.mockRejectedValue(new Error("OpenCode timeout secret-token"));

    const results = await useCase.invoke(baseParam());

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
    const createReviewComment = jest.fn().mockRejectedValue(providerError);
    const commandRepository = new PullRequestReviewCommentCommandRepository(
      {
        getClient: jest.fn(() => ({
          rest: { pulls: { createReviewComment } },
        })),
      } as never,
      { getClient: jest.fn() } as never,
    );
    const pullRequestPort = {
      getHeadBranchForIssue: jest.fn(),
      getPullRequestReviewCommentBody: jest.fn(),
      getOpenPullRequestNumbersByHeadBranch:
        mockGetOpenPullRequestNumbersByHeadBranch,
      listPullRequestReviewComments: mockListPullRequestReviewComments,
      getPullRequestHeadSha: mockGetPullRequestHeadSha,
      getChangedFiles: mockGetChangedFiles,
      getFilesWithFirstDiffLine: mockGetFilesWithFirstDiffLine,
      createReviewWithComments:
        commandRepository.createReviewWithComments.bind(commandRepository),
      updatePullRequestReviewComment: jest.fn(),
      resolvePullRequestReviewThread: jest.fn(),
      unresolvePullRequestReviewThread: jest.fn(),
    };
    const issuePort = {
      listIssueComments: mockListIssueComments,
      addComment: mockAddComment,
      updateComment: mockUpdateComment,
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
      { issue: issuePort, pullRequest: pullRequestPort },
      { issueComments: issuePort, pullRequestComments: pullRequestPort },
      { issueComments: issuePort, pullRequestComments: pullRequestPort },
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
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([50]);
    mockGetPullRequestHeadSha.mockResolvedValue("sha");
    mockGetChangedFiles.mockResolvedValue([
      { filename: "src/a.ts", status: "modified" },
    ]);
    mockGetFilesWithFirstDiffLine.mockResolvedValue([
      { path: "src/a.ts", firstLine: 1 },
    ]);
    mockListPullRequestReviewComments.mockResolvedValue([]);

    const results = await integratedUseCase.invoke(
      baseParam({
        tokens: { token: "secret-token" },
      }),
    );

    expect(createReviewComment).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    const errors = results[0].errors.map((error) => error.message).join("\n");
    expect(errors).toContain(
      "Failed to publish 1 of 1 pull request review comments.",
    );
    expect(errors).not.toContain("provider rejected");
    expect(errors).not.toContain("secret-token");
  });

  it("step message includes both findings count and resolved count when both present", async () => {
    mockAskAgent.mockResolvedValue({
      findings: [{ id: "new-1", title: "New", description: "D" }],
      resolved_finding_ids: ["old-1"],
    });
    mockListIssueComments.mockResolvedValue([
      {
        id: 1,
        body: '<!-- copilot-bugbot finding_id:"old-1" resolved:false -->',
        user: {},
      },
    ]);

    const results = await useCase.invoke(baseParam());

    expect(results[0].success).toBe(true);
    expect(results[0].steps?.[0]).toMatch(
      /1 new\/current finding\(s\).*1 marked as resolved/,
    );
  });

  it("when there are no open PRs, does not call createReviewWithComments or getPullRequestHeadSha", async () => {
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([]);
    mockAskAgent.mockResolvedValue({
      findings: [{ id: "f1", title: "T", description: "D" }],
    });

    await useCase.invoke(baseParam());

    expect(mockGetPullRequestHeadSha).not.toHaveBeenCalled();
    expect(mockCreateReviewWithComments).not.toHaveBeenCalled();
    expect(mockAddComment).toHaveBeenCalledTimes(1);
  });

  it("when finding has no file/line, no PR review comment is created (only issue comment)", async () => {
    mockAskAgent.mockResolvedValue({
      findings: [
        { id: "no-loc", title: "General issue", description: "No location." },
      ],
    });
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([200]);
    mockGetPullRequestHeadSha.mockResolvedValue("sha1");
    mockGetChangedFiles.mockResolvedValue([
      { filename: "lib/helper.ts", status: "modified" },
    ]);
    mockListPullRequestReviewComments.mockResolvedValue([]);

    await useCase.invoke(baseParam());

    expect(mockAddComment).toHaveBeenCalledWith(
      "owner",
      "repo",
      42,
      expect.any(String),
      "token",
      { commitSha: "sha1" },
    );
    expect(mockCreateReviewWithComments).not.toHaveBeenCalled();
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
    mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([60]);
    mockListPullRequestReviewComments.mockResolvedValue([
      {
        id: 555,
        identity: "PRRC_555",
        body: `## Same\n\n<!-- copilot-bugbot finding_id:"same-pr-finding" resolved:false -->`,
        path: "x.ts",
        line: 1,
      },
    ]);
    mockGetPullRequestHeadSha.mockResolvedValue("sha2");
    mockGetChangedFiles.mockResolvedValue([
      { filename: "x.ts", status: "modified" },
    ]);
    mockAskAgent.mockResolvedValue({ findings: [finding] });

    await useCase.invoke(baseParam());

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
    mockAskAgent.mockResolvedValue({ findings: [], resolved_finding_ids: [] });
    const param = baseParam({
      currentConfiguration: { parentBranch: undefined },
      branches: { development: "main" },
    });

    await useCase.invoke(param);

    const prompt = mockAskAgent.mock.calls[0][2];
    expect(prompt).toContain("Base branch: main");
  });

  it("extracts title from comment body (## line) for previous findings in prompt", async () => {
    mockListIssueComments.mockResolvedValue([
      {
        id: 111,
        body: `## Extracted Title Here\n\nSome body.\n\n<!-- copilot-bugbot finding_id:"ex-id" resolved:false -->`,
        user: {},
      },
    ]);
    mockAskAgent.mockResolvedValue({ findings: [], resolved_finding_ids: [] });

    await useCase.invoke(baseParam());

    const prompt = mockAskAgent.mock.calls[0][2];
    expect(prompt).toContain("Extracted Title Here");
    expect(prompt).toContain("ex-id");
  });

  it("treats non-array findings as empty and returns success with no new findings", async () => {
    mockAskAgent.mockResolvedValue({ findings: "not-array" });

    const results = await useCase.invoke(baseParam());

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].steps?.[0]).toContain("no new findings, no resolved");
    expect(mockAddComment).not.toHaveBeenCalled();
  });

  it("does not update comment to resolved when already resolved in marker", async () => {
    mockListIssueComments.mockResolvedValue([
      {
        id: 222,
        body: `## Already resolved\n\n<!-- copilot-bugbot finding_id:"done-id" resolved:true -->`,
        user: {},
      },
    ]);
    mockAskAgent.mockResolvedValue({
      findings: [],
      resolved_finding_ids: ["done-id"], // OpenCode says resolved again
    });

    await useCase.invoke(baseParam());

    expect(mockUpdateComment).not.toHaveBeenCalled();
  });

  describe("marker replacement (regex-based, tolerates format variations)", () => {
    it("replaces marker in issue comment when marker has extra whitespace", async () => {
      mockListIssueComments.mockResolvedValue([
        {
          id: 333,
          body: `## Whitespace variant\n\n<!--  copilot-bugbot   finding_id: "spacey-id"   resolved:false -->`,
          user: { login: "bot" },
        },
      ]);
      mockAskAgent.mockResolvedValue({
        findings: [],
        resolved_finding_ids: ["spacey-id"],
      });

      await useCase.invoke(baseParam());

      expect(mockUpdateComment).toHaveBeenCalledTimes(1);
      expect(mockUpdateComment).toHaveBeenCalledWith(
        "owner",
        "repo",
        42,
        333,
        expect.any(String),
        "token",
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
      mockGetOpenPullRequestNumbersByHeadBranch.mockResolvedValue([80]);
      mockListPullRequestReviewComments
        .mockResolvedValueOnce([
          {
            id: 444,
            body: `## PR spacey\n\n<!--  copilot-bugbot   finding_id: "pr-spacey-id"   resolved:false   -->`,
            path: "src/b.ts",
            line: 1,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 444,
            body: `## PR spacey\n\n<!--  copilot-bugbot   finding_id: "pr-spacey-id"   resolved:false   -->`,
            path: "src/b.ts",
            line: 1,
          },
        ]);
      mockAskAgent.mockResolvedValue({
        findings: [],
        resolved_finding_ids: ["pr-spacey-id"],
      });

      await useCase.invoke(baseParam());

      expect(mockUpdatePullRequestReviewComment).toHaveBeenCalledTimes(1);
      const updatedBody = mockUpdatePullRequestReviewComment.mock.calls[0][3];
      expect(updatedBody).toContain("resolved:true");
    });

    it("replaces marker when finding id contains regex-special characters", async () => {
      const findingId = "src/utils (helper).ts:10:possible-null";
      mockListIssueComments.mockResolvedValue([
        {
          id: 555,
          body: `## Regex id\n\n<!-- copilot-bugbot finding_id:"${findingId}" resolved:false -->`,
          user: {},
        },
      ]);
      mockAskAgent.mockResolvedValue({
        findings: [],
        resolved_finding_ids: [findingId],
      });

      await useCase.invoke(baseParam());

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

      const results = await useCase.invoke(baseParam());

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
        resolved_finding_ids: [],
      });

      await useCase.invoke(param);

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
        resolved_finding_ids: [],
      });

      await useCase.invoke(baseParam());

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
        resolved_finding_ids: [],
      });

      await useCase.invoke(param);

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
        resolved_finding_ids: [],
      });

      await useCase.invoke(baseParam());

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

    it("deduplicates findings by file:line before publishing", async () => {
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
        resolved_finding_ids: [],
      });

      await useCase.invoke(baseParam());

      expect(mockAddComment).toHaveBeenCalledTimes(1);
      expect(mockAddComment.mock.calls[0][3]).toContain("First");
      expect(mockAddComment.mock.calls[0][3]).not.toContain("Second");
    });
  });
});
