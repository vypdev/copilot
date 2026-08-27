import { decideManagedBranchPreparation } from "../branch_preparation_policy";

const baseInput = {
  availableBranches: ["develop"],
  issueNumber: 42,
  formattedIssueTitle: "new-title",
  targetBranchType: "bugfix",
  developmentBranch: "develop",
  managedBranchTypes: ["feature", "bugfix", "docs", "chore"],
};

describe("decideManagedBranchPreparation", () => {
  it("selects a previous issue branch from the complete inventory and preserves an existing parent", () => {
    expect(
      decideManagedBranchPreparation({
        ...baseInput,
        availableBranches: ["develop", "feature/42-old-title"],
        currentParentBranch: "release/1.0.0",
      }),
    ).toEqual({
      kind: "create",
      targetBranchName: "bugfix/42-new-title",
      baseBranchName: "feature/42-old-title",
      isRename: true,
      parentBranch: "release/1.0.0",
    });
  });

  it("returns an idempotent decision when the target already exists", () => {
    expect(
      decideManagedBranchPreparation({
        ...baseInput,
        availableBranches: ["bugfix/42-new-title"],
      }),
    ).toEqual({
      kind: "already-exists",
      targetBranchName: "bugfix/42-new-title",
    });
  });

  it("uses development and updates the parent when no previous branch exists", () => {
    expect(decideManagedBranchPreparation(baseInput)).toEqual({
      kind: "create",
      targetBranchName: "bugfix/42-new-title",
      baseBranchName: "develop",
      isRename: false,
      parentBranch: "develop",
    });
  });

  it("selects previous branches by configured type priority and exact issue prefix", () => {
    expect(
      decideManagedBranchPreparation({
        ...baseInput,
        availableBranches: [
          "bugfix/420-wrong",
          "bugfix/42-bug",
          "feature/42-feature",
        ],
        managedBranchTypes: ["feature", "bugfix"],
      }),
    ).toMatchObject({ baseBranchName: "feature/42-feature", isRename: true });
  });
});
