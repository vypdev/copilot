import { BugbotPullRequestRepository } from "../bugbot_pull_request_repository";
import type { BugbotPullRequestReadPort } from "../../../../application/ports/bugbot_pull_request_read_ports";
import type {
  PullRequestReviewCommentCommandPort,
  PullRequestReviewCommentQueryPort,
  PullRequestReviewThreadCommandPort,
} from "../../../../application/ports/pull_request_review_comment_ports";

describe("BugbotPullRequestRepository capabilities", () => {
  it("delegates every operation to its independently injected capability", async () => {
    const lifecycle: Pick<BugbotPullRequestReadPort, "getHeadBranchForIssue" | "getOpenPullRequestNumbersByHeadBranch"> = {
      getHeadBranchForIssue: jest.fn().mockResolvedValue("feature/9"),
      getOpenPullRequestNumbersByHeadBranch: jest.fn().mockResolvedValue([9]),
    };
    const changes: Pick<BugbotPullRequestReadPort, "getPullRequestHeadSha" | "getChangedFiles" | "getFilesWithFirstDiffLine"> = {
      getPullRequestHeadSha: jest.fn().mockResolvedValue("sha"),
      getChangedFiles: jest
        .fn()
        .mockResolvedValue([{ filename: "src/file.ts", status: "modified" }]),
      getFilesWithFirstDiffLine: jest
        .fn()
        .mockResolvedValue([{ path: "src/file.ts", firstLine: 1 }]),
    };
    const reviewQuery: PullRequestReviewCommentQueryPort = {
      getPullRequestReviewCommentBody: jest.fn().mockResolvedValue("body"),
      listPullRequestReviewComments: jest
        .fn()
        .mockResolvedValue([{ id: 7, identity: "PRRC_7", body: "body" }]),
    };
    const reviewCommand: PullRequestReviewCommentCommandPort = {
      createReviewWithComments: jest.fn().mockResolvedValue(undefined),
      updatePullRequestReviewComment: jest.fn().mockResolvedValue(undefined),
    };
    const threadCommand: PullRequestReviewThreadCommandPort = {
      resolvePullRequestReviewThread: jest.fn().mockResolvedValue(undefined),
      unresolvePullRequestReviewThread: jest.fn().mockResolvedValue(undefined),
    };
    const repository = new BugbotPullRequestRepository(
      lifecycle,
      changes,
      reviewQuery,
      reviewCommand,
      threadCommand,
    );

    await expect(
      repository.getHeadBranchForIssue("owner", "repo", 9, "token"),
    ).resolves.toBe("feature/9");
    await expect(
      repository.getOpenPullRequestNumbersByHeadBranch(
        "owner",
        "repo",
        "feature/9",
        "token",
      ),
    ).resolves.toEqual([9]);
    await expect(
      repository.getPullRequestHeadSha("owner", "repo", 9, "token"),
    ).resolves.toBe("sha");
    await expect(
      repository.getChangedFiles("owner", "repo", 9, "token"),
    ).resolves.toEqual([{ filename: "src/file.ts", status: "modified" }]);
    await expect(
      repository.getFilesWithFirstDiffLine("owner", "repo", 9, "token"),
    ).resolves.toEqual([{ path: "src/file.ts", firstLine: 1 }]);
    await expect(
      repository.getPullRequestReviewCommentBody(
        "owner",
        "repo",
        9,
        7,
        "token",
      ),
    ).resolves.toBe("body");
    await expect(
      repository.listPullRequestReviewComments("owner", "repo", 9, "token"),
    ).resolves.toEqual([{ id: 7, identity: "PRRC_7", body: "body" }]);
    await repository.createReviewWithComments(
      "owner",
      "repo",
      9,
      "sha",
      [{ path: "src/file.ts", line: 1, body: "finding" }],
      "token",
    );
    await repository.updatePullRequestReviewComment(
      "owner",
      "repo",
      "PRRC_7",
      "updated",
      "token",
    );
    await repository.resolvePullRequestReviewThread(
      "owner",
      "repo",
      9,
      "PRRC_7",
      "token",
    );

    expect(lifecycle.getHeadBranchForIssue).toHaveBeenCalledWith(
      "owner",
      "repo",
      9,
      "token",
    );
    expect(
      lifecycle.getOpenPullRequestNumbersByHeadBranch,
    ).toHaveBeenCalledWith("owner", "repo", "feature/9", "token");
    expect(changes.getPullRequestHeadSha).toHaveBeenCalledWith(
      "owner",
      "repo",
      9,
      "token",
    );
    expect(changes.getChangedFiles).toHaveBeenCalledWith(
      "owner",
      "repo",
      9,
      "token",
    );
    expect(changes.getFilesWithFirstDiffLine).toHaveBeenCalledWith(
      "owner",
      "repo",
      9,
      "token",
    );
    expect(reviewQuery.getPullRequestReviewCommentBody).toHaveBeenCalledWith(
      "owner",
      "repo",
      9,
      7,
      "token",
    );
    expect(reviewQuery.listPullRequestReviewComments).toHaveBeenCalledWith(
      "owner",
      "repo",
      9,
      "token",
    );
    expect(reviewCommand.createReviewWithComments).toHaveBeenCalledWith(
      "owner",
      "repo",
      9,
      "sha",
      [{ path: "src/file.ts", line: 1, body: "finding" }],
      "token",
    );
    expect(reviewCommand.updatePullRequestReviewComment).toHaveBeenCalledWith(
      "owner",
      "repo",
      "PRRC_7",
      "updated",
      "token",
    );
    expect(threadCommand.resolvePullRequestReviewThread).toHaveBeenCalledWith(
      "owner",
      "repo",
      9,
      "PRRC_7",
      "token",
    );
  });
});
