import { PullRequestReviewThreadRepository } from "../pull_request/pull_request_review_thread_repository";
import { OctokitGraphqlTransportClientAdapter } from "../../../infrastructure/github/octokit_project_adapters";
import { logDebugInfo, logError } from "../../../utils/logger";

jest.mock("../../../utils/logger", () => ({
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
}));

const mockGraphql = jest.fn();
jest.mock("@actions/github", () => ({
  getOctokit: () => ({
    graphql: (...args: unknown[]) => mockGraphql(...args),
  }),
}));

describe("PullRequestReviewThreadRepository", () => {
  const repository = new PullRequestReviewThreadRepository(
    new OctokitGraphqlTransportClientAdapter(),
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockGraphql.mockReset();
  });

  it("resolves the thread containing the requested comment", async () => {
    mockGraphql
      .mockResolvedValueOnce({
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                {
                  id: "THREAD_1",
                  comments: {
                    nodes: [{ id: "101" }],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        resolveReviewThread: { thread: { id: "THREAD_1" } },
      });

    await repository.resolvePullRequestReviewThread(
      "owner",
      "repo",
      7,
      "101",
      "token",
    );

    expect(mockGraphql).toHaveBeenCalledTimes(2);
    expect(mockGraphql.mock.calls[1][1]).toEqual({ threadId: "THREAD_1" });
  });

  it("resolves a comment whose full database id exceeds GraphQL Int range", async () => {
    mockGraphql
      .mockResolvedValueOnce({
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                {
                  id: "THREAD_64",
                  isResolved: false,
                  comments: {
                    nodes: [{ id: "3835383801" }],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        resolveReviewThread: {
          thread: { id: "THREAD_64" },
        },
      });

    await repository.resolvePullRequestReviewThread(
      "owner",
      "repo",
      42,
      "3835383801",
      "token",
    );

    expect(mockGraphql).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("resolveReviewThread"),
      { threadId: "THREAD_64" },
    );
  });

  it("matches an opaque Relay node id without numeric conversion and requests the critical fields", async () => {
    const commentIdentity = "PRRC_9223372036854775807";
    mockGraphql
      .mockResolvedValueOnce({
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                {
                  id: "THREAD_OPAQUE",
                  isResolved: false,
                  comments: {
                    nodes: [{ id: commentIdentity }],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        resolveReviewThread: { thread: { id: "THREAD_OPAQUE" } },
      });

    await repository.resolvePullRequestReviewThread(
      "owner",
      "repo",
      42,
      commentIdentity,
      "token",
    );

    const query = mockGraphql.mock.calls[0][0] as string;
    expect(query).toMatch(/nodes\s*\{\s*id\s*\}/);
    expect(query).toContain("isResolved");
    expect(query).toContain("pageInfo { hasNextPage endCursor }");
    expect(mockGraphql).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("resolveReviewThread"),
      { threadId: "THREAD_OPAQUE" },
    );
  });

  it("treats an already-resolved matching thread as idempotent success", async () => {
    mockGraphql.mockResolvedValueOnce({
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: [
              {
                id: "THREAD_SECRET_ID",
                isResolved: true,
                comments: {
                  nodes: [{ id: "101" }],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    });

    await expect(
      repository.resolvePullRequestReviewThread(
        "owner",
        "repo",
        7,
        "101",
        "token",
      ),
    ).resolves.toBeUndefined();

    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(
      JSON.stringify((logDebugInfo as jest.Mock).mock.calls),
    ).not.toContain("THREAD_SECRET_ID");
  });

  it("skips nullable thread and comment nodes before resolving a later match", async () => {
    mockGraphql
      .mockResolvedValueOnce({
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                null,
                {
                  id: "THREAD_1",
                  comments: {
                    nodes: [null, { id: "101" }],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        resolveReviewThread: { thread: { id: "THREAD_1" } },
      });

    await repository.resolvePullRequestReviewThread(
      "owner",
      "repo",
      7,
      "101",
      "token",
    );

    expect(mockGraphql).toHaveBeenCalledTimes(2);
    expect(mockGraphql.mock.calls[1][1]).toEqual({ threadId: "THREAD_1" });
  });

  it("paginates thread comments before deciding that the comment is absent", async () => {
    mockGraphql
      .mockResolvedValueOnce({
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                {
                  id: "THREAD_1",
                  comments: {
                    nodes: [{ id: "999" }],
                    pageInfo: { hasNextPage: true, endCursor: "COMMENTS_1" },
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        node: {
          comments: {
            nodes: [{ id: "202" }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      })
      .mockResolvedValueOnce({
        resolveReviewThread: { thread: { id: "THREAD_1" } },
      });

    await repository.resolvePullRequestReviewThread(
      "owner",
      "repo",
      7,
      "202",
      "token",
    );

    expect(mockGraphql).toHaveBeenCalledTimes(3);
    expect(mockGraphql.mock.calls[1][1]).toEqual({
      threadId: "THREAD_1",
      commentsAfter: "COMMENTS_1",
    });
  });

  it("continues across multiple additional thread-comment pages", async () => {
    mockGraphql
      .mockResolvedValueOnce({
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                {
                  id: "THREAD_1",
                  comments: {
                    nodes: [{ id: "999" }],
                    pageInfo: { hasNextPage: true, endCursor: "COMMENTS_1" },
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        node: {
          comments: {
            nodes: [{ id: "998" }],
            pageInfo: { hasNextPage: true, endCursor: "COMMENTS_2" },
          },
        },
      })
      .mockResolvedValueOnce({
        node: {
          comments: {
            nodes: [{ id: "202" }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      })
      .mockResolvedValueOnce({
        resolveReviewThread: { thread: { id: "THREAD_1" } },
      });

    await repository.resolvePullRequestReviewThread(
      "owner",
      "repo",
      7,
      "202",
      "token",
    );

    expect(mockGraphql).toHaveBeenCalledTimes(4);
    expect(mockGraphql.mock.calls[1][1]).toEqual({
      threadId: "THREAD_1",
      commentsAfter: "COMMENTS_1",
    });
    expect(mockGraphql.mock.calls[2][1]).toEqual({
      threadId: "THREAD_1",
      commentsAfter: "COMMENTS_2",
    });
    expect(mockGraphql.mock.calls[3][1]).toEqual({ threadId: "THREAD_1" });
  });

  it("continues thread pagination after an empty page with a valid next cursor", async () => {
    mockGraphql
      .mockResolvedValueOnce({
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: null,
              pageInfo: { hasNextPage: true, endCursor: "THREADS_1" },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                {
                  id: "THREAD_2",
                  comments: {
                    nodes: [{ id: "202" }],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        resolveReviewThread: { thread: { id: "THREAD_2" } },
      });

    await repository.resolvePullRequestReviewThread(
      "owner",
      "repo",
      7,
      "202",
      "token",
    );

    expect(mockGraphql).toHaveBeenCalledTimes(3);
    expect(mockGraphql.mock.calls[1][1]).toEqual({
      owner: "owner",
      repo: "repo",
      prNumber: 7,
      threadsAfter: "THREADS_1",
    });
    expect(mockGraphql.mock.calls[2][1]).toEqual({ threadId: "THREAD_2" });
  });

  it("paginates review threads before resolving the matching thread", async () => {
    mockGraphql
      .mockResolvedValueOnce({
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                {
                  id: "THREAD_1",
                  comments: {
                    nodes: [{ id: "999" }],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              ],
              pageInfo: { hasNextPage: true, endCursor: "THREADS_1" },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                {
                  id: "THREAD_2",
                  comments: {
                    nodes: [{ id: "202" }],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      })
      .mockResolvedValueOnce({
        resolveReviewThread: { thread: { id: "THREAD_2" } },
      });

    await repository.resolvePullRequestReviewThread(
      "owner",
      "repo",
      7,
      "202",
      "token",
    );

    expect(mockGraphql.mock.calls[1][1]).toEqual({
      owner: "owner",
      repo: "repo",
      prNumber: 7,
      threadsAfter: "THREADS_1",
    });
    expect(mockGraphql.mock.calls[2][1]).toEqual({ threadId: "THREAD_2" });
  });

  it("rejects when no review thread contains the comment", async () => {
    mockGraphql.mockResolvedValueOnce({
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: [
              {
                id: "THREAD_1",
                comments: {
                  nodes: [{ id: "999" }],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    });

    await expect(
      repository.resolvePullRequestReviewThread(
        "owner",
        "repo",
        7,
        "404",
        "token",
      ),
    ).rejects.toThrow("Unable to resolve the pull request review thread.");

    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(logError).not.toHaveBeenCalled();
  });

  it("rejects when the resolve mutation does not confirm the thread", async () => {
    mockGraphql
      .mockResolvedValueOnce({
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                {
                  id: "THREAD_1",
                  comments: {
                    nodes: [{ id: "101" }],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      })
      .mockResolvedValueOnce({ resolveReviewThread: { thread: null } });

    await expect(
      repository.resolvePullRequestReviewThread(
        "owner",
        "repo",
        7,
        "101",
        "token",
      ),
    ).rejects.toThrow("Unable to resolve the pull request review thread.");

    expect(logDebugInfo).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it("rejects with a semantic error when GraphQL fails", async () => {
    mockGraphql.mockRejectedValue(
      new Error("GraphQL unavailable secret-token"),
    );

    await expect(
      repository.resolvePullRequestReviewThread(
        "owner",
        "repo",
        7,
        "101",
        "token",
      ),
    ).rejects.toThrow("Unable to resolve the pull request review thread.");
    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(logError).not.toHaveBeenCalled();
  });

  it("does not mutate when GitHub returns a nullable review-thread connection", async () => {
    mockGraphql.mockResolvedValue({
      repository: { pullRequest: { reviewThreads: null } },
    });

    await expect(
      repository.resolvePullRequestReviewThread(
        "owner",
        "repo",
        7,
        "101",
        "token",
      ),
    ).rejects.toThrow("Unable to resolve the pull request review thread.");

    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(logError).not.toHaveBeenCalled();
  });

  it("treats nullable thread nodes as an empty review-thread page", async () => {
    mockGraphql.mockResolvedValue({
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: null,
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    });

    await expect(
      repository.resolvePullRequestReviewThread(
        "owner",
        "repo",
        7,
        "101",
        "token",
      ),
    ).rejects.toThrow("Unable to resolve the pull request review thread.");

    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(logError).not.toHaveBeenCalled();
  });

  it("treats a nullable thread-comment connection as empty", async () => {
    mockGraphql.mockResolvedValue({
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: [{ id: "THREAD_1", comments: null }],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    });

    await expect(
      repository.resolvePullRequestReviewThread(
        "owner",
        "repo",
        7,
        "101",
        "token",
      ),
    ).rejects.toThrow("Unable to resolve the pull request review thread.");

    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(logError).not.toHaveBeenCalled();
  });

  it("stops safely when a paginated thread-comment response is nullable", async () => {
    mockGraphql
      .mockResolvedValueOnce({
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                {
                  id: "THREAD_1",
                  comments: {
                    nodes: [],
                    pageInfo: {
                      hasNextPage: true,
                      endCursor: "COMMENTS_PAGE_2",
                    },
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      })
      .mockResolvedValueOnce({ node: null });

    await expect(
      repository.resolvePullRequestReviewThread(
        "owner",
        "repo",
        7,
        "101",
        "token",
      ),
    ).rejects.toThrow("Unable to resolve the pull request review thread.");

    expect(mockGraphql).toHaveBeenCalledTimes(2);
    expect(logError).not.toHaveBeenCalled();
  });

  it("rejects a repeated thread-comment cursor without requesting it again", async () => {
    mockGraphql.mockImplementation(async () => {
      const callNumber = mockGraphql.mock.calls.length;
      if (callNumber === 1) {
        return {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [
                  {
                    id: "THREAD_1",
                    comments: {
                      nodes: [{ id: "999" }],
                      pageInfo: {
                        hasNextPage: true,
                        endCursor: "COMMENTS_1",
                      },
                    },
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        };
      }
      if (callNumber === 2) {
        return {
          node: {
            comments: {
              nodes: [{ id: "998" }],
              pageInfo: { hasNextPage: true, endCursor: "COMMENTS_1" },
            },
          },
        };
      }
      throw new Error("unexpected third page");
    });

    await expect(
      repository.resolvePullRequestReviewThread(
        "owner",
        "repo",
        7,
        "101",
        "token",
      ),
    ).rejects.toThrow("Unable to resolve the pull request review thread.");

    expect(mockGraphql).toHaveBeenCalledTimes(2);
  });

  it("rejects a repeated review-thread cursor without requesting it again", async () => {
    mockGraphql.mockImplementation(async () => {
      if (mockGraphql.mock.calls.length > 2) {
        throw new Error("unexpected third page");
      }
      return {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [],
              pageInfo: { hasNextPage: true, endCursor: "THREADS_1" },
            },
          },
        },
      };
    });

    await expect(
      repository.resolvePullRequestReviewThread(
        "owner",
        "repo",
        7,
        "101",
        "token",
      ),
    ).rejects.toThrow("Unable to resolve the pull request review thread.");

    expect(mockGraphql).toHaveBeenCalledTimes(2);
  });

  it("does not request another thread page when GitHub omits its cursor", async () => {
    mockGraphql.mockResolvedValue({
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: [
              {
                id: "THREAD_1",
                comments: {
                  nodes: [{ id: "404" }],
                  pageInfo: { hasNextPage: false, endCursor: null },
                },
              },
            ],
            pageInfo: { hasNextPage: true, endCursor: null },
          },
        },
      },
    });

    await expect(
      repository.resolvePullRequestReviewThread(
        "owner",
        "repo",
        7,
        "101",
        "token",
      ),
    ).rejects.toThrow("Unable to resolve the pull request review thread.");

    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(logError).not.toHaveBeenCalled();
  });

  it("rejects semantically when the resolve mutation fails after locating the thread", async () => {
    mockGraphql
      .mockResolvedValueOnce({
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                {
                  id: "THREAD_1",
                  comments: {
                    nodes: [{ id: "101" }],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      })
      .mockRejectedValueOnce(new Error("mutation unavailable"));

    await expect(
      repository.resolvePullRequestReviewThread(
        "owner",
        "repo",
        7,
        "101",
        "token",
      ),
    ).rejects.toThrow("Unable to resolve the pull request review thread.");

    expect(mockGraphql).toHaveBeenCalledTimes(2);
    expect(logError).not.toHaveBeenCalled();
  });

  it("rejects semantically when provider client resolution fails", async () => {
    const failingRepository = new PullRequestReviewThreadRepository({
      getClient: jest.fn(() => {
        throw new Error("client unavailable");
      }),
    });

    await expect(
      failingRepository.resolvePullRequestReviewThread(
        "owner",
        "repo",
        7,
        "101",
        "token",
      ),
    ).rejects.toThrow("Unable to resolve the pull request review thread.");

    expect(logError).not.toHaveBeenCalled();
  });
});
