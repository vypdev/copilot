import { AssignReviewersToIssueUseCase } from "../assign_reviewers_to_issue_use_case";

jest.mock("../../../../../utils/logger", () => ({
  logInfo: jest.fn(),
  logDebugInfo: jest.fn(),
  logError: jest.fn(),
}));

const mockGetCurrentReviewers = jest.fn();
const mockGetCurrentAssignees = jest.fn();
const mockGetRandomMembers = jest.fn();
const mockAddReviewersToPullRequest = jest.fn();

jest.mock(
  "../../../../../data/repository/organization/organization_members_repository",
  () => ({
    OrganizationMembersRepository: jest.fn().mockImplementation(() => ({
      getRandomMembers: mockGetRandomMembers,
    })),
  }),
);

function baseParam(overrides: Record<string, unknown> = {}) {
  return {
    owner: "o",
    repo: "r",
    tokens: { token: "t" },
    pullRequest: {
      number: 42,
      desiredReviewersCount: 1,
      creator: "author",
    },
    ...overrides,
  } as unknown as Parameters<AssignReviewersToIssueUseCase["invoke"]>[0];
}

describe("AssignReviewersToIssueUseCase", () => {
  let useCase: AssignReviewersToIssueUseCase;

  beforeEach(() => {
    useCase = new AssignReviewersToIssueUseCase(
      {
        getCurrentAssignees: mockGetCurrentAssignees,
        assignMembersToIssue: jest.fn(),
      },
      {
        getCurrentReviewers: mockGetCurrentReviewers,
        addReviewersToPullRequest: mockAddReviewersToPullRequest,
      },
      { getAllMembers: jest.fn(), getRandomMembers: mockGetRandomMembers },
    );
    mockGetCurrentReviewers.mockReset();
    mockGetCurrentAssignees.mockReset();
    mockGetRandomMembers.mockReset();
    mockAddReviewersToPullRequest.mockReset();
    mockGetCurrentAssignees.mockResolvedValue([]);
  });

  it("returns an isolated no-op when reviewer assignment is disabled", async () => {
    mockGetCurrentReviewers.mockRejectedValue(new Error("must not be called"));
    const param = baseParam({
      pullRequest: { number: 42, desiredReviewersCount: 0, creator: "author" },
    });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      success: true,
      executed: true,
      steps: [],
    });
    expect(mockGetCurrentReviewers).not.toHaveBeenCalled();
    expect(mockGetCurrentAssignees).not.toHaveBeenCalled();
    expect(mockGetRandomMembers).not.toHaveBeenCalled();
    expect(mockAddReviewersToPullRequest).not.toHaveBeenCalled();
  });

  it("returns success with no steps when current reviewers already meet desired count", async () => {
    mockGetCurrentReviewers.mockResolvedValue(["elisalopez"]);
    const param = baseParam({
      pullRequest: { number: 42, desiredReviewersCount: 1, creator: "author" },
    });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps).toEqual([]);
    expect(mockGetCurrentAssignees).not.toHaveBeenCalled();
    expect(mockAddReviewersToPullRequest).not.toHaveBeenCalled();
  });

  it("returns success with no steps when reviewer already submitted (counted in currentReviewers)", async () => {
    mockGetCurrentReviewers.mockResolvedValue(["elisalopez"]);
    const param = baseParam({
      pullRequest: { number: 42, desiredReviewersCount: 1, creator: "author" },
    });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].steps).toEqual([]);
    expect(mockGetRandomMembers).not.toHaveBeenCalled();
    expect(mockAddReviewersToPullRequest).not.toHaveBeenCalled();
  });

  it("counts current reviewer identities case-insensitively", async () => {
    mockGetCurrentReviewers.mockResolvedValue(["Alice", "alice"]);
    mockGetRandomMembers.mockResolvedValue(["Bob"]);
    mockAddReviewersToPullRequest.mockResolvedValue(["BOB"]);

    const results = await useCase.invoke(
      baseParam({
        pullRequest: {
          number: 42,
          desiredReviewersCount: 2,
          creator: "author",
        },
      }),
    );

    expect(mockGetRandomMembers).toHaveBeenCalledWith(
      "o",
      1,
      expect.arrayContaining(["author", "Alice"]),
      "t",
    );
    expect(mockAddReviewersToPullRequest).toHaveBeenCalledWith(
      "o",
      "r",
      42,
      ["Bob"],
      "t",
    );
    expect(results.at(-1)?.success).toBe(true);
  });

  it("requests new reviewers and adds step only for newly added when under desired count", async () => {
    mockGetCurrentReviewers.mockResolvedValue([]);
    mockGetRandomMembers.mockResolvedValue(["newreviewer"]);
    mockAddReviewersToPullRequest.mockResolvedValue(["newreviewer"]);
    const param = baseParam({
      pullRequest: { number: 42, desiredReviewersCount: 1, creator: "author" },
    });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps).toContain(
      "@newreviewer was requested to review the pull request.",
    );
    expect(mockAddReviewersToPullRequest).toHaveBeenCalledWith(
      "o",
      "r",
      42,
      ["newreviewer"],
      "t",
    );
  });

  it("excludes creator and current reviewers/assignees when requesting members", async () => {
    mockGetCurrentReviewers.mockResolvedValue(["reviewer1"]);
    mockGetRandomMembers.mockResolvedValue(["reviewer2"]);
    mockAddReviewersToPullRequest.mockResolvedValue(["reviewer2"]);
    const param = baseParam({
      pullRequest: { number: 42, desiredReviewersCount: 2, creator: "author" },
    });
    mockGetCurrentAssignees.mockResolvedValue(["assignee1"]);

    await useCase.invoke(param);

    expect(mockGetRandomMembers).toHaveBeenCalledWith(
      "o",
      1,
      expect.arrayContaining(["author", "reviewer1", "assignee1"]),
      "t",
    );
  });

  it("returns failure when no members available to assign as reviewers", async () => {
    mockGetCurrentReviewers.mockResolvedValue([]);
    mockGetRandomMembers.mockResolvedValue([]);
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].steps).toContain(
      "Tried to assign members as reviewers to pull request, but no one was found.",
    );
    expect(mockAddReviewersToPullRequest).not.toHaveBeenCalled();
  });

  it("returns a sanitized failure when getCurrentReviewers throws", async () => {
    const { logError } = require("../../../../../utils/logger");
    mockGetCurrentReviewers.mockRejectedValue(
      new Error("API error secret-token"),
    );
    const param = baseParam();

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].steps).toContain(
      "Tried to assign reviewers to pull request.",
    );
    expect(results[0].errors.map((error) => error.message)).toEqual([
      "Unable to assign pull request reviewers.",
    ]);
    expect(JSON.stringify(logError.mock.calls)).not.toContain("secret-token");
  });

  it("adds step only for reviewers that are in the requested members list", async () => {
    mockGetCurrentReviewers.mockResolvedValue([]);
    mockGetRandomMembers.mockResolvedValue(["requested"]);
    mockAddReviewersToPullRequest.mockResolvedValue(["requested", "other"]);
    const param = baseParam({
      pullRequest: { number: 42, desiredReviewersCount: 1, creator: "author" },
    });

    const results = await useCase.invoke(param);

    expect(
      results.filter((r) =>
        r.steps?.some((s) => s.includes("was requested to review")),
      ),
    ).toHaveLength(1);
    expect(results[0].steps).toContain(
      "@requested was requested to review the pull request.",
    );
  });

  it("matches provider-confirmed reviewer logins case-insensitively", async () => {
    mockGetCurrentReviewers.mockResolvedValue([]);
    mockGetRandomMembers.mockResolvedValue(["requested"]);
    mockAddReviewersToPullRequest.mockResolvedValue(["REQUESTED"]);

    const results = await useCase.invoke(baseParam());

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].steps).toContain(
      "@REQUESTED was requested to review the pull request.",
    );
  });

  it("returns failure when no reviewer request is confirmed", async () => {
    mockGetCurrentReviewers.mockResolvedValue([]);
    mockGetRandomMembers.mockResolvedValue(["requested"]);
    mockAddReviewersToPullRequest.mockResolvedValue([]);

    const results = await useCase.invoke(baseParam());

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].executed).toBe(true);
    expect(results[0].steps).toContain(
      "Tried to assign members as reviewers to pull request, but no reviewer request was confirmed.",
    );
  });

  it("reports partial failure while preserving confirmed reviewer successes", async () => {
    mockGetCurrentReviewers.mockResolvedValue([]);
    mockGetRandomMembers.mockResolvedValue(["alice", "bob"]);
    mockAddReviewersToPullRequest.mockResolvedValue(["ALICE"]);
    const param = baseParam({
      pullRequest: { number: 42, desiredReviewersCount: 2, creator: "author" },
    });

    const results = await useCase.invoke(param);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[0].steps).toContain(
      "@ALICE was requested to review the pull request.",
    );
    expect(results[1].success).toBe(false);
    expect(results[1].steps).toContain(
      "Confirmed 1 of 2 required reviewer requests; pull request still needs 1 reviewer.",
    );
  });

  it("does not count duplicate provider confirmations twice", async () => {
    mockGetCurrentReviewers.mockResolvedValue([]);
    mockGetRandomMembers.mockResolvedValue(["alice", "bob"]);
    mockAddReviewersToPullRequest.mockResolvedValue(["ALICE", "alice"]);
    const param = baseParam({
      pullRequest: { number: 42, desiredReviewersCount: 2, creator: "author" },
    });

    const results = await useCase.invoke(param);

    expect(
      results.filter((result) =>
        result.steps.some((step) => step.includes("was requested to review")),
      ),
    ).toHaveLength(1);
    expect(results.at(-1)?.success).toBe(false);
  });

  it("reports a plural deficit when too few eligible members are available", async () => {
    mockGetCurrentReviewers.mockResolvedValue([]);
    mockGetRandomMembers.mockResolvedValue(["alice"]);
    mockAddReviewersToPullRequest.mockResolvedValue(["alice"]);
    const param = baseParam({
      pullRequest: { number: 42, desiredReviewersCount: 3, creator: "author" },
    });

    const results = await useCase.invoke(param);

    expect(results.at(-1)?.steps).toContain(
      "Confirmed 1 of 3 required reviewer requests; pull request still needs 2 reviewers.",
    );
  });

  it("sanitizes non-Error reviewer failures as Error instances", async () => {
    mockGetCurrentReviewers.mockRejectedValue(
      "provider unavailable secret-token",
    );

    const results = await useCase.invoke(baseParam());

    expect(results[0].errors).toHaveLength(1);
    expect(results[0].errors[0]).toBeInstanceOf(Error);
    expect(results[0].errors.map((error) => error.message)).toEqual([
      "Unable to assign pull request reviewers.",
    ]);
  });
});
