import { PullRequestReviewerRepository } from "../pull_request_reviewer_repository";

describe("PullRequestReviewerRepository", () => {
  it("collects requested reviewers and every page of completed reviews without case-insensitive duplicates", async () => {
    const listRequestedReviewers = jest.fn().mockResolvedValue({
      data: { users: [{ login: "Alice" }, { login: "BOB" }] },
    });
    const listReviews = jest.fn();
    const iterator = jest.fn(() =>
      (async function* () {
        yield {
          data: [
            { state: "APPROVED", user: { login: "alice" } },
            { state: "COMMENTED", user: null },
          ],
        };
        yield {
          data: [{ state: "CHANGES_REQUESTED", user: { login: "Carol" } }],
        };
      })(),
    );
    const getClient = jest.fn(() => ({
      paginate: { iterator },
      rest: {
        pulls: {
          listRequestedReviewers,
          listReviews,
          requestReviewers: jest.fn(),
        },
      },
    }));
    const repository = new PullRequestReviewerRepository({
      getClient,
    } as never);

    await expect(
      repository.getCurrentReviewers("owner", "repo", 17, "token"),
    ).resolves.toEqual(["Alice", "BOB", "Carol"]);

    expect(getClient).toHaveBeenCalledTimes(1);
    expect(listRequestedReviewers).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      pull_number: 17,
    });
    expect(iterator).toHaveBeenCalledTimes(1);
    expect(iterator).toHaveBeenCalledWith(listReviews, {
      owner: "owner",
      repo: "repo",
      pull_number: 17,
      per_page: 100,
    });
  });

  it("excludes pending and unknown review states from current reviewers", async () => {
    const listRequestedReviewers = jest.fn().mockResolvedValue({
      data: { users: [] },
    });
    const listReviews = jest.fn();
    const iterator = jest.fn(() =>
      (async function* () {
        yield {
          data: [
            { state: "APPROVED", user: { login: "approved" } },
            { state: "PENDING", user: { login: "pending" } },
            { state: null, user: { login: "missing-state" } },
            { state: "UNKNOWN", user: { login: "unknown" } },
          ],
        };
      })(),
    );
    const repository = new PullRequestReviewerRepository({
      getClient: jest.fn(() => ({
        paginate: { iterator },
        rest: {
          pulls: {
            listRequestedReviewers,
            listReviews,
          },
        },
      })),
    } as never);

    await expect(
      repository.getCurrentReviewers("owner", "repo", 17, "token"),
    ).resolves.toEqual(["approved"]);
  });

  it("returns only requested reviewer logins confirmed by the provider", async () => {
    const requestReviewers = jest.fn().mockResolvedValue({
      data: {
        requested_reviewers: [
          { login: "already-pending" },
          { login: "REQUESTED" },
          { login: "requested" },
          { login: "Second" },
        ],
      },
    });
    const getClient = jest.fn(() => ({
      rest: {
        pulls: {
          requestReviewers,
        },
      },
    }));
    const repository = new PullRequestReviewerRepository({
      getClient,
    } as never);

    await expect(
      repository.addReviewersToPullRequest(
        "owner",
        "repo",
        17,
        ["requested", "second"],
        "token",
      ),
    ).resolves.toEqual(["REQUESTED", "Second"]);

    expect(getClient).toHaveBeenCalledTimes(1);
    expect(requestReviewers).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      pull_number: 17,
      reviewers: ["requested", "second"],
    });
  });

  it("returns no confirmation when the provider omits requested reviewers", async () => {
    const requestReviewers = jest.fn().mockResolvedValue({ data: {} });
    const getClient = jest.fn(() => ({
      rest: { pulls: { requestReviewers } },
    }));
    const repository = new PullRequestReviewerRepository({
      getClient,
    } as never);

    await expect(
      repository.addReviewersToPullRequest(
        "owner",
        "repo",
        17,
        ["reviewer"],
        "token",
      ),
    ).resolves.toEqual([]);
  });

  it("returns no confirmation when the provider reports null requested reviewers", async () => {
    const requestReviewers = jest.fn().mockResolvedValue({
      data: { requested_reviewers: null },
    });
    const getClient = jest.fn(() => ({
      rest: { pulls: { requestReviewers } },
    }));
    const repository = new PullRequestReviewerRepository({
      getClient,
    } as never);

    await expect(
      repository.addReviewersToPullRequest(
        "owner",
        "repo",
        17,
        ["reviewer"],
        "token",
      ),
    ).resolves.toEqual([]);
  });

  it("does not resolve a provider client for an empty reviewer request", async () => {
    const requestReviewers = jest.fn();
    const getClient = jest.fn(() => ({
      rest: { pulls: { requestReviewers } },
    }));
    const repository = new PullRequestReviewerRepository({
      getClient,
    } as never);

    await expect(
      repository.addReviewersToPullRequest("owner", "repo", 17, [], "token"),
    ).resolves.toEqual([]);

    expect(getClient).not.toHaveBeenCalled();
    expect(requestReviewers).not.toHaveBeenCalled();
  });

  it("translates review-list failures instead of treating them as an empty set", async () => {
    const failure = new Error("reviewers unavailable secret-token");
    const iterator = jest.fn(async function* () {
      if (failure) throw failure;
      yield { data: [] };
    });
    const getClient = jest.fn(() => ({
      paginate: { iterator },
      rest: {
        pulls: {
          listRequestedReviewers: jest.fn().mockResolvedValue({
            data: { users: [] },
          }),
          listReviews: jest.fn(),
        },
      },
    }));
    const repository = new PullRequestReviewerRepository({
      getClient,
    } as never);

    await expect(
      repository.getCurrentReviewers("owner", "repo", 17, "token"),
    ).rejects.toThrow("Unable to list pull request reviewers.");
  });

  it("translates requested-reviewer listing failures", async () => {
    const failure = new Error("requested reviewers unavailable secret-token");
    const iterator = jest.fn(async function* () {
      yield { data: [] };
    });
    const getClient = jest.fn(() => ({
      paginate: { iterator },
      rest: {
        pulls: {
          listRequestedReviewers: jest.fn().mockRejectedValue(failure),
          listReviews: jest.fn(),
        },
      },
    }));
    const repository = new PullRequestReviewerRepository({
      getClient,
    } as never);

    await expect(
      repository.getCurrentReviewers("owner", "repo", 17, "token"),
    ).rejects.toThrow("Unable to list pull request reviewers.");
  });

  it("translates reviewer-command failures", async () => {
    const failure = new Error("review request failed secret-token");
    const requestReviewers = jest.fn().mockRejectedValue(failure);
    const getClient = jest.fn(() => ({
      rest: { pulls: { requestReviewers } },
    }));
    const repository = new PullRequestReviewerRepository({
      getClient,
    } as never);

    await expect(
      repository.addReviewersToPullRequest(
        "owner",
        "repo",
        17,
        ["reviewer"],
        "token",
      ),
    ).rejects.toThrow("Unable to request pull request reviewers.");
  });
});
