import { DeploymentStateRepository } from "../deployment_state_repository";
import type { DeploymentOperationSnapshot } from "../../../../domain/deployment_operation";

const operation = {
  operationId: "operation-12345678",
  kind: "release",
  version: "3.4.0",
  title: "Release",
  changelog: "Changes",
  phase: "publishing",
  strategy: "production-lineage",
  prMode: "auto",
  backmergeMode: "auto",
  hotfixActiveReleasePolicy: "prefer-release",
  cleanup: "all",
  issueCompletion: "close",
  presentationMode: "guided",
  diagrams: true,
  commentMode: "update",
  sourceBranch: "release/3.4.0",
  sourceSha: "a".repeat(40),
  originBranch: "develop",
  originSha: "b".repeat(40),
  productionBranch: "master",
  developmentBranch: "develop",
  reconciliationTree: "sync",
  tag: "v3.4.0",
  publicationWorkflow: "release_workflow.yml",
  publicationVerified: false,
  reconciliationTargets: [],
  lastFailure: null,
} as DeploymentOperationSnapshot;

const start = "<!-- copilot-configuration-start";
const end = "copilot-configuration-end -->";

function harness(payload?: Record<string, unknown>) {
  const description = payload ? `Issue\n${start}\n${JSON.stringify(payload)}\n${end}` : "Issue";
  const issues = {
    getDescription: jest.fn().mockResolvedValue(description),
    updateDescription: jest.fn(),
  };
  return { repository: new DeploymentStateRepository(issues), issues };
}

const query = { owner: "owner", repository: "repo", issue: 355, token: "pat" };

describe("DeploymentStateRepository", () => {
  it("returns no operation when the issue has no configuration block", async () => {
    await expect(harness().repository.load(query)).resolves.toBeUndefined();
  });

  it("loads a strict durable operation through the schema-v3 model", async () => {
    await expect(harness({ schemaVersion: 3, branchType: "release", deploymentOrchestration: operation }).repository.load(query))
      .resolves.toEqual(operation);
  });

  it("persists operation state in the existing hidden configuration block", async () => {
    const value = harness({ schemaVersion: 2, branchType: "release", futureFact: "preserve" });
    await value.repository.save({ ...query, state: { branchType: "release", releaseBranch: "release/3.4.0", deploymentOrchestration: operation } });
    const updated = value.issues.updateDescription.mock.calls[0][3] as string;
    expect(updated).toContain('"schemaVersion": 3');
    expect(updated).toContain('"operationId": "operation-12345678"');
    expect(updated).toContain('"futureFact": "preserve"');
  });

  it("adds a missing configuration block for a legacy launcher issue", async () => {
    const value = harness();
    await value.repository.save({ ...query, state: { branchType: "release", deploymentOrchestration: operation } });
    expect(value.issues.updateDescription).toHaveBeenCalledWith(
      "owner", "repo", 355, expect.stringContaining(start), "pat",
    );
  });
});
