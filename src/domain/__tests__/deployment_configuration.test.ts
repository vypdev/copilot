import {
  DEFAULT_DEPLOYMENT_CONFIGURATION,
  HOTFIX_ACTIVE_RELEASE_POLICIES,
  ORCHESTRATION_COMMENT_MODES,
  ORCHESTRATION_PRESENTATION_MODES,
  RECONCILIATION_BACKMERGE_MODES,
  RECONCILIATION_CLEANUP_MODES,
  RECONCILIATION_ISSUE_COMPLETION_MODES,
  RECONCILIATION_PR_MODES,
  RECONCILIATION_STRATEGIES,
  isSafeBranchTree,
  parseDeploymentEnum,
  validateDeploymentConfiguration,
  type DeploymentConfigurationValues,
} from "../deployment_configuration";

const context = {
  productionBranch: "master",
  developmentBranch: "develop",
  releaseTree: "release",
  hotfixTree: "hotfix",
};

const configuration = (overrides: Partial<DeploymentConfigurationValues> = {}): DeploymentConfigurationValues => ({
  ...DEFAULT_DEPLOYMENT_CONFIGURATION,
  ...overrides,
});

describe("deployment configuration", () => {
  it("defines the safe production-lineage defaults", () => {
    expect(DEFAULT_DEPLOYMENT_CONFIGURATION).toEqual(expect.objectContaining({
      releaseReconciliationStrategy: "production-lineage",
      reconciliationPullRequestMode: "auto",
      reconciliationBackmergeMode: "auto",
      reconciliationTree: "sync",
      orchestrationPresentationMode: "guided",
      mergeQueueCheckAttestations: [],
    }));
  });

  it.each([
    ...RECONCILIATION_STRATEGIES,
    ...RECONCILIATION_PR_MODES,
    ...RECONCILIATION_BACKMERGE_MODES,
    ...HOTFIX_ACTIVE_RELEASE_POLICIES,
    ...RECONCILIATION_CLEANUP_MODES,
    ...RECONCILIATION_ISSUE_COMPLETION_MODES,
    ...ORCHESTRATION_PRESENTATION_MODES,
    ...ORCHESTRATION_COMMENT_MODES,
  ])("accepts the exact enum value %s", (value) => {
    expect(parseDeploymentEnum(value, [value], value)).toEqual({ value, valid: true });
  });

  it("uses the fallback for an omitted enum", () => {
    expect(parseDeploymentEnum("", RECONCILIATION_STRATEGIES, "production-lineage"))
      .toEqual({ value: "production-lineage", valid: true });
  });

  it("rejects an unknown enum without leaking it", () => {
    expect(parseDeploymentEnum("anything", RECONCILIATION_STRATEGIES, "manual"))
      .toEqual({ value: "manual", valid: false });
  });

  it("rejects unconfigured case variants", () => {
    expect(parseDeploymentEnum("AUTO", RECONCILIATION_PR_MODES, "auto"))
      .toEqual({ value: "auto", valid: false });
  });

  it("rejects invalid enum values that arrive through a runtime setup file", () => {
    expect(validateDeploymentConfiguration(configuration({
      reconciliationPullRequestMode: "AUTO" as DeploymentConfigurationValues["reconciliationPullRequestMode"],
    }), context)).toContain("The reconciliation PR mode must be one of: auto, auto-merge, merge-queue, create-only.");
  });

  it("rejects a non-boolean diagram value from untyped configuration", () => {
    expect(validateDeploymentConfiguration(configuration({
      orchestrationDiagrams: "true" as unknown as boolean,
    }), context)).toContain("Orchestration diagrams must be a boolean.");
  });

  it("rejects production and development using the same branch", () => {
    expect(validateDeploymentConfiguration(configuration(), { ...context, developmentBranch: "master" }))
      .toContain("Production and development branches must be different.");
  });

  it.each(["", "/sync", "sync/", "sync..bad", "sync@{bad", "sync bad", "sync~bad", "sync?bad", "sync*bad", "sync[bad"])(
    "rejects unsafe reconciliation prefix %p",
    (reconciliationTree) => {
      expect(validateDeploymentConfiguration(configuration({ reconciliationTree }), context))
        .toEqual(expect.arrayContaining([expect.stringContaining("reconciliation branch prefix")]));
    },
  );

  it("rejects a release prefix equal to production", () => {
    expect(validateDeploymentConfiguration(configuration(), { ...context, releaseTree: "master" }))
      .toContain("The release branch prefix cannot equal a protected long-lived branch.");
  });

  it("rejects a hotfix prefix equal to development", () => {
    expect(validateDeploymentConfiguration(configuration(), { ...context, hotfixTree: "develop" }))
      .toContain("The hotfix branch prefix cannot equal a protected long-lived branch.");
  });

  it("rejects a reconciliation prefix equal to production", () => {
    expect(validateDeploymentConfiguration(configuration({ reconciliationTree: "master" }), context))
      .toContain("The reconciliation branch prefix cannot equal a protected long-lived branch.");
  });

  it("rejects malformed merge queue attestations", () => {
    expect(validateDeploymentConfiguration(configuration({
      mergeQueueCheckAttestations: [{ context: "CI", integrationId: 1, targets: ["unknown"] }] as never,
    }), context)).toContain("Merge queue check attestation 1 targets must contain 1-3 unique values from: production, development, active-release.");
  });

  it("accepts an exact bounded merge queue attestation", () => {
    expect(validateDeploymentConfiguration(configuration({
      reconciliationPullRequestMode: "merge-queue",
      mergeQueueCheckAttestations: [{ context: "External CI", integrationId: 1234, targets: ["production"] }],
    }), context)).toEqual([]);
  });

  it("does not allow manual release reconciliation to auto-close the issue", () => {
    expect(validateDeploymentConfiguration(configuration({ releaseReconciliationStrategy: "manual" }), context))
      .toContain("Manual reconciliation cannot close the launcher issue automatically.");
  });

  it("does not allow manual hotfix reconciliation to auto-close the issue", () => {
    expect(validateDeploymentConfiguration(configuration({ hotfixReconciliationStrategy: "manual" }), context))
      .toContain("Manual reconciliation cannot close the launcher issue automatically.");
  });

  it("allows manual reconciliation when the issue remains open", () => {
    expect(validateDeploymentConfiguration(configuration({
      releaseReconciliationStrategy: "manual",
      hotfixReconciliationStrategy: "manual",
      reconciliationIssueCompletion: "keep-open",
    }), context)).toEqual([]);
  });

  it.each(["sync", "sync/releases", "sync_1", "sync-1", "Sync.1"])("accepts safe branch prefix %s", (value) => {
    expect(isSafeBranchTree(value)).toBe(true);
  });
});
