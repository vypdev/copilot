import {
  completeBugbotSourceCoverage,
  selectCanonicalBugbotPullRequest,
  summarizeBugbotCoverage,
  type BugbotPullRequestIdentity,
  type BugbotReviewTarget,
} from "../context";

const target: BugbotReviewTarget = {
  repository: { owner: "acme", name: "repo", id: 7 },
  triggerKind: "pull_request",
  issueNumber: 42,
  headOwner: "acme",
  headRef: "feature/42",
  expectedHeadSha: "a".repeat(40),
  eventPullRequestNumber: 12,
  pullRequestRequired: true,
};

const candidate = (overrides: Partial<BugbotPullRequestIdentity> = {}): BugbotPullRequestIdentity => ({
  number: 12,
  state: "open",
  baseRepository: { owner: "acme", name: "repo", id: 7 },
  headRepositoryOwner: "acme",
  headRef: "feature/42",
  headSha: "a".repeat(40),
  ...overrides,
});

describe("Bugbot canonical context policy", () => {
  it("accepts one verified event pull request", () => {
    expect(selectCanonicalBugbotPullRequest(target, [candidate()], "event"))
      .toEqual({ kind: "canonical", pullRequest: candidate(), reason: "event" });
  });

  it('rejects a missing event candidate without searching by head', () => {
    expect(selectCanonicalBugbotPullRequest(target, [], 'event')).toEqual({
      kind: 'stale',
      reason: 'The event pull request could not be verified.',
    });
  });

  it("maps zero, one, and two exact-head candidates deterministically", () => {
    expect(selectCanonicalBugbotPullRequest(target, [], "exact-head")).toEqual({ kind: "none" });
    expect(selectCanonicalBugbotPullRequest(target, [candidate()], "exact-head")).toEqual(expect.objectContaining({ kind: "canonical" }));
    expect(selectCanonicalBugbotPullRequest(target, [candidate(), candidate({ number: 13 })], "exact-head"))
      .toEqual({ kind: "ambiguous", candidateCount: 2 });
  });

  it.each([
    ["closed", candidate({ state: "closed" })],
    ["base repository", candidate({ baseRepository: { owner: "acme", name: "other", id: 8 } })],
    ["fork owner", candidate({ headRepositoryOwner: "attacker" })],
    ["head ref", candidate({ headRef: "feature/other" })],
    ["head sha", candidate({ headSha: "b".repeat(40) })],
  ])("rejects a stale or invalid %s identity without fallback", (_name, value) => {
    expect(selectCanonicalBugbotPullRequest(target, [value], "event")).toEqual(expect.objectContaining({ kind: "stale" }));
  });

  it('checks repository name even when the owner matches and no numeric ID is available', () => {
    const ownerNameTarget = { ...target, repository: { owner: 'acme', name: 'repo' } };
    expect(selectCanonicalBugbotPullRequest(
      ownerNameTarget,
      [candidate({ baseRepository: { owner: 'acme', name: 'other' } })],
      'event',
    )).toEqual(expect.objectContaining({ kind: 'stale' }));
  });

  it("summarizes partial coverage without losing per-source counts", () => {
    const issue = completeBugbotSourceCoverage("issue-comments", 2);
    const diff = { ...completeBugbotSourceCoverage("diff", 1000, 10), status: "partial" as const, limitReached: true, omittedItems: 1 };
    expect(summarizeBugbotCoverage([issue, diff])).toEqual({ status: "partial", sources: [issue, diff] });
  });

  it('summarizes complete and empty sources with default page counts', () => {
    const empty = completeBugbotSourceCoverage('issue-comments', 0);
    expect(empty.pagesFetched).toBe(0);
    expect(summarizeBugbotCoverage([empty])).toEqual({ status: 'complete', sources: [empty] });
  });
});
