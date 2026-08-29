import {
  markFindingsResolved as markFindingsResolvedImpl,
  type MarkFindingsResolvedParam,
} from "../mark_findings_resolved_use_case";
import type {
  BugbotContext,
  ExistingByFindingId,
} from "../types";
import type { Execution } from "../../../../../../data/model/execution";
import { getCommentWatermark } from "../../../../../../utils/comment_watermark";

jest.mock("../../../../../ports/logging_ports", () => ({
  logInfo: jest.fn(),
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
}));

const mockUpdateComment = jest.fn();
const mockListPrReviewComments = jest.fn();
const mockUpdatePrReviewComment = jest.fn();
const mockResolveThread = jest.fn();

function markFindingsResolved(param: Omit<MarkFindingsResolvedParam, "ports">) {
  return markFindingsResolvedImpl({
    ...param,
    ports: {
      issueComments: { updateComment: mockUpdateComment },
      pullRequestComments: {
        listPullRequestReviewComments: mockListPrReviewComments,
        updatePullRequestReviewComment: mockUpdatePrReviewComment,
        resolvePullRequestReviewThread: mockResolveThread,
      },
    },
  });
}

function baseExecution(): Execution {
  return {
    owner: "o",
    repo: "r",
    issueNumber: 1,
    tokens: { token: "t" },
  } as unknown as Execution;
}

function baseContext(overrides: Partial<BugbotContext> = {}): BugbotContext {
  return {
    existingByFindingId: {},
    issueComments: [],
    openPrNumbers: [],
    previousFindingsBlock: "",
    prContext: null,
    unresolvedFindingsWithBody: [],
    ...overrides,
  };
}

function issueFinding(commentId: number, resolved: boolean): ExistingByFindingId {
  return { f1: { issue: { commentId, resolved } } };
}

function pullRequestFinding(
  commentIdentity: string,
  resolved: boolean,
  pullRequestNumber = 5,
): ExistingByFindingId {
  return {
    f1: {
      pullRequest: { commentIdentity, pullRequestNumber, resolved },
    },
  };
}

const unresolvedBody =
  '## Finding\n\n<!-- copilot-bugbot finding_id:"f1" resolved:false -->';
const resolvedBody =
  '## Finding\n\n<!-- copilot-bugbot finding_id:"f1" resolved:true -->';

function prComment(identity: string, body = unresolvedBody) {
  return { id: 201, identity, body };
}

describe("markFindingsResolved", () => {
  beforeEach(() => {
    const { logError } = require("../../../../../ports/logging_ports");
    logError.mockReset();
    mockUpdateComment.mockReset().mockResolvedValue(undefined);
    mockListPrReviewComments.mockReset().mockResolvedValue([]);
    mockUpdatePrReviewComment.mockReset().mockResolvedValue(undefined);
    mockResolveThread.mockReset().mockResolvedValue(undefined);
  });

  it("does not mutate an issue destination that is already resolved", async () => {
    const errors = await markFindingsResolved({
      execution: baseExecution(),
      context: baseContext({
        existingByFindingId: issueFinding(100, true),
        issueComments: [{ id: 100, body: resolvedBody }],
      }),
      resolvedFindingIds: new Set(["f1"]),
    });

    expect(errors).toEqual([]);
    expect(mockUpdateComment).not.toHaveBeenCalled();
  });

  it("repairs a marked PR thread even when the agent does not return its id", async () => {
    const identity = "PRRC_repair";
    mockListPrReviewComments.mockResolvedValue([
      prComment(identity, resolvedBody),
    ]);

    const errors = await markFindingsResolved({
      execution: baseExecution(),
      context: baseContext({
        existingByFindingId: pullRequestFinding(identity, true),
      }),
      resolvedFindingIds: new Set(),
    });

    expect(errors).toEqual([]);
    expect(mockResolveThread).toHaveBeenCalledWith("o", "r", 5, identity, "t");
    expect(mockUpdatePrReviewComment).not.toHaveBeenCalled();
  });

  it("does not mutate a pending destination absent from the canonical resolved set", async () => {
    await markFindingsResolved({
      execution: baseExecution(),
      context: baseContext({
        existingByFindingId: issueFinding(100, false),
        issueComments: [{ id: 100, body: unresolvedBody }],
      }),
      resolvedFindingIds: new Set(),
    });

    expect(mockUpdateComment).not.toHaveBeenCalled();
  });

  it("updates from the full issue body and removes its old trailing watermark", async () => {
    const fullBody = `${unresolvedBody}\n\n${"x".repeat(15000)}\n\n${getCommentWatermark()}`;

    const errors = await markFindingsResolved({
      execution: baseExecution(),
      context: baseContext({
        existingByFindingId: issueFinding(100, false),
        issueComments: [{ id: 100, body: fullBody }],
      }),
      resolvedFindingIds: new Set(["f1"]),
    });

    expect(errors).toEqual([]);
    const updatedBody = mockUpdateComment.mock.calls[0][4] as string;
    expect(updatedBody).toContain("x".repeat(15000));
    expect(updatedBody).toMatch(/resolved:true/);
    expect(updatedBody).not.toContain("Made with ❤️ by");
  });

  it("retries only the pending issue destination after PR resolution succeeded", async () => {
    const identity = "PRRC_partial";
    mockListPrReviewComments.mockResolvedValue([
      prComment(identity, resolvedBody),
    ]);
    const existing: ExistingByFindingId = {
      f1: {
        issue: { commentId: 100, resolved: false },
        pullRequest: {
          commentIdentity: identity,
          pullRequestNumber: 5,
          resolved: true,
        },
      },
    };

    const errors = await markFindingsResolved({
      execution: baseExecution(),
      context: baseContext({
        existingByFindingId: existing,
        issueComments: [{ id: 100, body: unresolvedBody }],
      }),
      resolvedFindingIds: new Set(["f1"]),
    });

    expect(errors).toEqual([]);
    expect(mockResolveThread).toHaveBeenCalledTimes(1);
    expect(mockUpdatePrReviewComment).not.toHaveBeenCalled();
    expect(mockUpdateComment).toHaveBeenCalledTimes(1);
  });

  it("resolves a PR by opaque identity before updating its marker and then resolves issue", async () => {
    const identity = "PRRC_9223372036854775807";
    mockListPrReviewComments.mockResolvedValue([prComment(identity)]);
    const existing: ExistingByFindingId = {
      f1: {
        issue: { commentId: 100, resolved: false },
        pullRequest: {
          commentIdentity: identity,
          pullRequestNumber: 6,
          resolved: false,
        },
      },
    };

    const errors = await markFindingsResolved({
      execution: baseExecution(),
      context: baseContext({
        existingByFindingId: existing,
        issueComments: [{ id: 100, body: unresolvedBody }],
      }),
      resolvedFindingIds: new Set(["f1"]),
    });

    expect(errors).toEqual([]);
    expect(mockResolveThread).toHaveBeenCalledWith("o", "r", 6, identity, "t");
    expect(mockUpdatePrReviewComment).toHaveBeenCalledWith(
      "o",
      "r",
      identity,
      expect.stringMatching(/resolved:true/),
      "t",
    );
    expect(mockResolveThread.mock.invocationCallOrder[0]).toBeLessThan(
      mockUpdatePrReviewComment.mock.invocationCallOrder[0],
    );
    expect(mockUpdateComment).toHaveBeenCalledTimes(1);
  });

  it("returns a semantic issue error when its full comment is unavailable", async () => {
    const errors = await markFindingsResolved({
      execution: baseExecution(),
      context: baseContext({
        existingByFindingId: issueFinding(999, false),
      }),
      resolvedFindingIds: new Set(["f1"]),
    });

    expect(errors.map((error) => error.message)).toEqual([
      "Unable to mark an issue finding as resolved.",
    ]);
  });

  it("returns a semantic PR error when its identity is absent from the fresh list", async () => {
    mockListPrReviewComments.mockResolvedValue([
      prComment("PRRC_other"),
    ]);

    const errors = await markFindingsResolved({
      execution: baseExecution(),
      context: baseContext({
        existingByFindingId: pullRequestFinding("PRRC_missing", false),
      }),
      resolvedFindingIds: new Set(["f1"]),
    });

    expect(errors.map((error) => error.message)).toEqual([
      "Unable to mark a pull request finding as resolved.",
    ]);
    expect(mockResolveThread).not.toHaveBeenCalled();
  });

  it("does not resolve a thread when the matching PR marker is absent", async () => {
    const identity = "PRRC_plain";
    mockListPrReviewComments.mockResolvedValue([
      prComment(identity, "plain text without marker"),
    ]);

    const errors = await markFindingsResolved({
      execution: baseExecution(),
      context: baseContext({
        existingByFindingId: pullRequestFinding(identity, false),
      }),
      resolvedFindingIds: new Set(["f1"]),
    });

    expect(errors).toHaveLength(1);
    expect(mockResolveThread).not.toHaveBeenCalled();
    expect(mockUpdatePrReviewComment).not.toHaveBeenCalled();
  });

  it("treats an already-resolved issue marker as idempotent even if context was stale", async () => {
    const errors = await markFindingsResolved({
      execution: baseExecution(),
      context: baseContext({
        existingByFindingId: issueFinding(100, false),
        issueComments: [{ id: 100, body: resolvedBody }],
      }),
      resolvedFindingIds: new Set(["f1"]),
    });

    expect(errors).toEqual([]);
    expect(mockUpdateComment).not.toHaveBeenCalled();
  });

  it("accumulates independent sanitized PR and issue provider errors", async () => {
    const { logError } = require("../../../../../ports/logging_ports");
    const identity = "PRRC_failure";
    mockListPrReviewComments.mockResolvedValue([prComment(identity)]);
    mockUpdatePrReviewComment.mockRejectedValue(
      new Error("PR API error secret-token"),
    );
    mockUpdateComment.mockRejectedValue(
      new Error("issue API error secret-token"),
    );
    const existing: ExistingByFindingId = {
      f1: {
        issue: { commentId: 100, resolved: false },
        pullRequest: {
          commentIdentity: identity,
          pullRequestNumber: 5,
          resolved: false,
        },
      },
    };

    const errors = await markFindingsResolved({
      execution: baseExecution(),
      context: baseContext({
        existingByFindingId: existing,
        issueComments: [{ id: 100, body: unresolvedBody }],
      }),
      resolvedFindingIds: new Set(["f1"]),
    });

    expect(errors.map((error) => error.message)).toEqual([
      "Unable to mark a pull request finding as resolved.",
      "Unable to mark an issue finding as resolved.",
    ]);
    expect(JSON.stringify(errors)).not.toContain("secret-token");
    expect(JSON.stringify(logError.mock.calls)).not.toContain("secret-token");
  });
});
