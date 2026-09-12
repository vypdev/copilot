import { deploymentStateFence } from "../../../../domain/deployment_state_fence";
import type { DeploymentOperationSnapshot } from "../../../../domain/deployment_operation";
import { DeploymentStateRepositoryFactory } from "../deployment_state_repository";

const operation = (overrides: Partial<DeploymentOperationSnapshot> = {}): DeploymentOperationSnapshot => ({
  stateVersion: 1,
  revision: 7,
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
  ...overrides,
});

const publicationReceipt = {
  tag: "v3.4.0",
  productionSha: "c".repeat(40),
  operationId: "operation-12345678",
  releaseUrl: "https://github.com/owner/repo/releases/tag/v3.4.0",
};

const start = "<!-- copilot-configuration-start";
const end = "copilot-configuration-end -->";
const binding = { owner: "owner", repository: "repo", issue: 355, token: "pat" };

function descriptionFor(payload?: unknown): string {
  return payload === undefined ? "Issue" : `Issue\n${start}\n${JSON.stringify(payload)}\n${end}`;
}

function harness(payload?: unknown, descriptionOverride?: string) {
  let description = descriptionOverride ?? descriptionFor(payload);
  const issues = {
    getDescription: jest.fn(async () => description),
    updateDescription: jest.fn(async (_owner, _repository, _issue, updated: string) => {
      description = updated;
    }),
  };
  const repository = new DeploymentStateRepositoryFactory(issues).bind(binding);
  return { repository, issues, description: () => description };
}

function state(deploymentOrchestration: DeploymentOperationSnapshot) {
  return {
    branchType: "release",
    releaseBranch: "release/3.4.0",
    deploymentOrchestration,
  };
}

describe("DeploymentStateRepository", () => {
  it("returns absent when the issue has no configuration block", async () => {
    await expect(harness().repository.load()).resolves.toEqual({ kind: "absent" });
  });

  it("loads only the current version-1 deployment state", async () => {
    const current = operation();
    await expect(harness({ schemaVersion: 3, branchType: "release", deploymentOrchestration: current }).repository.load())
      .resolves.toEqual({ kind: "current", operation: current });
  });

  it.each([
    ["invalid JSON", undefined, `Issue\n${start}\n{bad\n${end}`, "invalid"],
    ["unversioned deployment", { schemaVersion: 3, branchType: "release", deploymentOrchestration: { operationId: "operation-12345678" } }, undefined, "invalid"],
    ["future deployment", { schemaVersion: 3, branchType: "release", deploymentOrchestration: { ...operation(), stateVersion: 2 } }, undefined, "unsupported"],
    ["old configuration", { schemaVersion: 2, branchType: "release", deploymentOrchestration: operation() }, undefined, "unsupported"],
  ])("classifies %s without translating it", async (_name, payload, raw, kind) => {
    await expect(harness(payload, raw).repository.load()).resolves.toEqual(expect.objectContaining({ kind }));
  });

  it("persists the first operation at revision one", async () => {
    const value = harness();
    const proposed = operation({ revision: 1, phase: "preparing" });
    await expect(value.repository.save({ expected: { kind: "absent" }, state: state(proposed) }))
      .resolves.toEqual({ kind: "saved", operation: proposed });
    expect(value.description()).toContain('"stateVersion": 1');
    expect(value.description()).toContain('"revision": 1');
  });

  it("persists exactly one monotonic successor while preserving unrelated configuration", async () => {
    const current = operation();
    const value = harness({ schemaVersion: 3, branchType: "release", parentBranch: "develop", deploymentOrchestration: current });
    const proposed = operation({ revision: 8, phase: "published", productionSha: "c".repeat(40), publicationVerified: true, publicationReceipt });
    await expect(value.repository.save({
      expected: { kind: "current", fence: deploymentStateFence(current) },
      state: state(proposed),
    })).resolves.toEqual({ kind: "saved", operation: proposed });
    expect(value.description()).toContain('"parentBranch": "develop"');
  });

  it("returns already-applied without rewriting a completed save", async () => {
    const proposed = operation({ revision: 8, phase: "published", productionSha: "c".repeat(40), publicationVerified: true, publicationReceipt });
    const value = harness({ schemaVersion: 3, branchType: "release", deploymentOrchestration: proposed });
    await expect(value.repository.save({
      expected: { kind: "current", fence: deploymentStateFence(operation()) },
      state: state(proposed),
    })).resolves.toEqual({ kind: "already-applied", operation: proposed });
    expect(value.issues.updateDescription).not.toHaveBeenCalled();
  });

  it.each([
    ["stale", operation({ revision: 9 }), { kind: "current", fence: deploymentStateFence(operation()) }],
    ["conflict", operation({ operationId: "operation-conflict" }), { kind: "current", fence: deploymentStateFence(operation()) }],
  ] as const)("returns %s and performs no write", async (kind, durable, expected) => {
    const value = harness({ schemaVersion: 3, branchType: "release", deploymentOrchestration: durable });
    await expect(value.repository.save({
      expected,
      state: state(operation({ revision: 8, phase: "published" })),
    })).resolves.toEqual(expect.objectContaining({ kind }));
    expect(value.issues.updateDescription).not.toHaveBeenCalled();
  });

  it("returns missing when an expected operation disappeared", async () => {
    const value = harness({ schemaVersion: 3, branchType: "release" });
    await expect(value.repository.save({
      expected: { kind: "current", fence: deploymentStateFence(operation()) },
      state: state(operation({ revision: 8, phase: "published" })),
    })).resolves.toEqual({ kind: "missing" });
    expect(value.issues.updateDescription).not.toHaveBeenCalled();
  });
});
