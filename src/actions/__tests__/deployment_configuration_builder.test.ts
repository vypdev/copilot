import { INPUT_KEYS } from "../../application/contracts/input_keys";
import { readDeploymentConfiguration } from "../deployment_configuration_builder";

const branches = {
  productionBranch: "master",
  developmentBranch: "develop",
  releaseTree: "release",
  hotfixTree: "hotfix",
};

describe("deployment configuration builder", () => {
  it("applies safe defaults when optional Action inputs are omitted", () => {
    expect(readDeploymentConfiguration(() => undefined, branches)).toEqual(expect.objectContaining({
      releaseReconciliationStrategy: "production-lineage",
      reconciliationPullRequestMode: "auto",
      reconciliationTree: "sync",
    }));
  });

  it("rejects unknown strategy values instead of silently normalizing them", () => {
    const read = (key: string) => key === INPUT_KEYS.RELEASE_RECONCILIATION_STRATEGY ? "PRODUCTION-LINEAGE" : undefined;
    expect(() => readDeploymentConfiguration(read, branches)).toThrow("release-reconciliation-strategy must be one of");
  });

  it("parses the bounded attestation JSON Action input", () => {
    const serialized = JSON.stringify([
      { context: "External CI", integrationId: 999, targets: ["production"] },
    ]);
    const read = (key: string) => key === INPUT_KEYS.MERGE_QUEUE_CHECK_ATTESTATIONS ? serialized : undefined;
    expect(readDeploymentConfiguration(read, branches).mergeQueueCheckAttestations).toEqual([
      { context: "External CI", integrationId: 999, targets: ["production"] },
    ]);
  });

  it("rejects malformed attestation JSON at the Action boundary", () => {
    const read = (key: string) => key === INPUT_KEYS.MERGE_QUEUE_CHECK_ATTESTATIONS ? "not-json" : undefined;
    expect(() => readDeploymentConfiguration(read, branches)).toThrow("must be a valid JSON array");
  });
});
