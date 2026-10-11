import type { AgentConfiguration } from '../../../../domain/agent';
import {
  branchSyncConflictEligibilityFailure,
  completedBranchSyncResult,
  failedBranchSyncResult,
} from "../branch_sync_execution_policy";

const preparation = {
  kind: "conflicted",
  parentSha: "parent-sha",
  childSha: "child-sha",
  conflictPaths: ["src/a.ts"],
} as const;

function configuration(configured = true): AgentConfiguration {
  return configured
    ? { provider: "codex", model: "model" }
    : { provider: 'codex', model: '' };
}

describe("branch sync execution policy", () => {
  it("accepts only configured, non-sensitive conflict sets within the limit", () => {
    expect(branchSyncConflictEligibilityFailure(preparation, true, configuration())).toBeUndefined();
    expect(branchSyncConflictEligibilityFailure(preparation, false, configuration())?.reason).toContain("--no-agent");
    expect(branchSyncConflictEligibilityFailure(preparation, true, configuration(false))?.reason).toContain("no fixer agent");
    expect(branchSyncConflictEligibilityFailure(
      { ...preparation, conflictPaths: [".github/workflows/release.yml"] },
      true,
      configuration(),
    )?.reason).toContain("sensitive paths");
    expect(branchSyncConflictEligibilityFailure(
      { ...preparation, conflictPaths: Array.from({ length: 21 }, (_, index) => `src/${index}.ts`) },
      true,
      configuration(),
    )?.reason).toContain("automated limit is 20");
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
