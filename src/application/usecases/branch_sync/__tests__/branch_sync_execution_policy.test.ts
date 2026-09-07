import type { Execution } from "../../../../data/model/execution";
import {
  branchSyncConflictEligibilityError,
  completedBranchSyncResult,
  failedBranchSyncResult,
} from "../branch_sync_execution_policy";

const preparation = {
  kind: "conflicted",
  parentSha: "parent-sha",
  childSha: "child-sha",
  conflictPaths: ["src/a.ts"],
} as const;

function execution(configured = true): Execution {
  return {
    ai: {
      getAgentConfiguration: () => configured
        ? { provider: "codex", model: "model", command: "codex exec -" }
        : undefined,
    },
  } as unknown as Execution;
}

describe("branch sync execution policy", () => {
  it("accepts only configured, non-sensitive conflict sets within the limit", () => {
    expect(branchSyncConflictEligibilityError(preparation, true, execution())).toBeUndefined();
    expect(branchSyncConflictEligibilityError(preparation, false, execution())).toContain("--no-agent");
    expect(branchSyncConflictEligibilityError(preparation, true, execution(false))).toContain("no fixer agent");
    expect(branchSyncConflictEligibilityError(
      { ...preparation, conflictPaths: [".github/workflows/release.yml"] },
      true,
      execution(),
    )).toContain("sensitive paths");
    expect(branchSyncConflictEligibilityError(
      { ...preparation, conflictPaths: Array.from({ length: 21 }, (_, index) => `src/${index}.ts`) },
      true,
      execution(),
    )).toContain("automated limit is 20");
  });

  it("builds a structured, publishable completion result", () => {
    const result = completedBranchSyncResult({
      preparation,
      parentBranch: "develop",
      workingBranch: "feature/42",
      outcome: "merged-with-agent",
      verificationCount: 2,
      commitSha: "merge-sha",
    });

    expect(result).toMatchObject({
      success: true,
      executed: true,
      stepFormat: "markdown",
      payload: { outcome: "merged-with-agent", verificationCount: 2, commitSha: "merge-sha" },
    });
    expect(result.steps[0]).toContain("fixer agent");
  });

  it("keeps provider causes out of serialized failure reports", () => {
    const result = failedBranchSyncResult("Synchronization failed safely.", new Error("provider secret"));

    expect(result.errors[0].message).toBe("Synchronization failed safely.");
    expect(JSON.stringify(result)).not.toContain("provider secret");
  });
});
