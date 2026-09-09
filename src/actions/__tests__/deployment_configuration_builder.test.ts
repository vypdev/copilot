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
});
