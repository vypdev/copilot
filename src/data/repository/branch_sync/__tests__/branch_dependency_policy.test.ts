import {
  dependencyFromPullRequest,
  resolveOpenBranchDependencies,
} from "../branch_dependency_policy";

describe("branch dependency policy", () => {
  it("prefers durable issue configuration and de-duplicates matching PR evidence", () => {
    const body = `Request\n<!-- copilot-configuration-start\n${JSON.stringify({ parentBranch: "develop", workingBranch: "feature/42-login" })}\ncopilot-configuration-end -->`;
    const result = resolveOpenBranchDependencies(
      [{ number: 42, body, linkedBranches: { nodes: [{ ref: { name: "refs/heads/feature/42-login" } }] } }],
      [{
        number: 7,
        baseRefName: "develop",
        headRefName: "feature/42-login",
        closingIssuesReferences: { nodes: [{ number: 42 }] },
      }],
    );
    expect(result).toEqual([{ issueNumber: 42, parentBranch: "develop", workingBranch: "feature/42-login" }]);
  });

  it("falls back to linked branches, closing references, and PR body references", () => {
    const result = resolveOpenBranchDependencies(
      [
        { number: 1, linkedBranches: { nodes: [{ ref: { name: "/feature/one" } }] } },
        { number: 2 },
      ],
      [
        { number: 10, baseRefName: "develop", headRefName: "feature/one" },
        { number: 11, body: "Closes #2", baseRefName: "release/2", headRefName: "bugfix/two" },
      ],
    );
    expect(result).toEqual([
      { issueNumber: 1, parentBranch: "develop", workingBranch: "feature/one" },
      { issueNumber: 2, parentBranch: "release/2", workingBranch: "bugfix/two" },
    ]);
  });

  it("ignores malformed configuration and invalid self-dependencies", () => {
    expect(resolveOpenBranchDependencies(
      [{ number: 3, body: "<!-- copilot-configuration-start\nnot-json\ncopilot-configuration-end -->" }],
      [],
    )).toEqual([]);
    expect(resolveOpenBranchDependencies(
      [{ number: 4, body: `<!-- copilot-configuration-start\n${JSON.stringify({ parentBranch: "same", workingBranch: "same" })}\ncopilot-configuration-end -->` }],
      [],
    )).toEqual([]);
  });

  it("maps a PR conversation directly", () => {
    expect(dependencyFromPullRequest({ number: 9, baseRefName: "main", headRefName: "topic" })).toEqual({
      issueNumber: 9,
      parentBranch: "main",
      workingBranch: "topic",
    });
  });
});
