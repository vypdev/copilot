import {
  buildManagedBranchPresentation,
  readManagedBranchCreationPayload,
} from "../managed_branch_result_policy";

describe("managed branch result policy", () => {
  it("accepts only complete branch creation payloads", () => {
    expect(readManagedBranchCreationPayload({
      baseBranchName: "develop",
      baseBranchUrl: "https://github.com/o/r/tree/develop",
      newBranchName: "feature/42-login",
      newBranchUrl: "https://github.com/o/r/tree/feature/42-login",
    })).toEqual({
      baseBranchName: "develop",
      baseBranchUrl: "https://github.com/o/r/tree/develop",
      newBranchName: "feature/42-login",
      newBranchUrl: "https://github.com/o/r/tree/feature/42-login",
    });
    expect(readManagedBranchCreationPayload(undefined)).toBeUndefined();
    expect(readManagedBranchCreationPayload({ newBranchName: "feature/42-login" })).toBeUndefined();
  });

  it("builds create and rename presentations with optional commit guidance", () => {
    const created = buildManagedBranchPresentation({
      owner: "o",
      repo: "r",
      developmentBranch: "develop",
      baseBranchName: "develop",
      baseBranchUrl: "https://github.com/o/r/tree/develop",
      branchName: "feature/42-login",
      newBranchUrl: "https://github.com/o/r/tree/feature/42-login",
      isRename: false,
      commitPrefix: "feat(login):",
    });
    expect(created.step).toContain("was used to create");
    expect(created.reminders).toHaveLength(3);
    expect(created.reminders[1]).toContain("feat(login):");

    const renamed = buildManagedBranchPresentation({
      owner: "o",
      repo: "r",
      developmentBranch: "develop",
      baseBranchName: "feature/42-old",
      baseBranchUrl: "https://github.com/o/r/tree/feature/42-old",
      branchName: "feature/42-login",
      newBranchUrl: "https://github.com/o/r/tree/feature/42-login",
      isRename: true,
    });
    expect(renamed.step).toContain("was renamed");
    expect(renamed.reminders).toHaveLength(2);
    expect(renamed.reminders.at(-1)).toContain("develop");
  });
});
