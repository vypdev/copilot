import type { DeploymentOperationSnapshot } from "../../../domain/deployment_operation";
import {
  decideDeploymentStateSave,
  readDeploymentOperationState,
} from "../../../domain/deployment_state_fence";
import { DeploymentStateBoundary } from "../deployment_state_boundary";

const operation = (operationId = "operation-12345678"): DeploymentOperationSnapshot => ({
  stateVersion: 1,
  revision: 0,
  operationId,
  kind: "release",
  version: "3.4.0",
  title: "Release",
  changelog: "Changes",
  phase: "preparing",
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
});

function context(value: DeploymentOperationSnapshot) {
  return {
    owner: "owner",
    repo: "repo",
    tokens: { token: "pat" },
    singleAction: { issue: 355 },
    labels: { deploy: "deploy", deployed: "deployed", lifecycle: {
      planned: "state:planned",
      inProgress: "state:in-progress",
      reviewing: "state:reviewing",
      changesRequested: "state:changes-requested",
      verified: "state:verified",
      ready: "state:ready",
      blocked: "state:blocked",
      awaitingMaintainer: "state:awaiting-maintainer",
      awaitingIssueAuthor: "state:awaiting-issue-author",
      aiProcessing: "state:ai-processing",
    } },
    currentConfiguration: { branchType: "release", deploymentOrchestration: value },
  } as never;
}

describe("DeploymentStateBoundary", () => {
  it("gives exactly one simultaneous absent-state writer revision one", async () => {
    let durable: DeploymentOperationSnapshot | undefined;
    let saveCalls = 0;
    let releaseFirst!: () => void;
    let firstEntered!: () => void;
    const firstIsWaiting = new Promise<void>((resolve) => { firstEntered = resolve; });
    const release = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const store = {
      load: jest.fn(async () => readDeploymentOperationState(durable)),
      save: jest.fn(async ({ expected, state }: any) => {
        saveCalls += 1;
        if (saveCalls === 1) {
          firstEntered();
          await release;
        }
        const proposed = state.deploymentOrchestration as DeploymentOperationSnapshot;
        const decision = decideDeploymentStateSave(readDeploymentOperationState(durable), expected, proposed);
        if (decision.kind !== "write") return decision;
        durable = proposed;
        return { kind: "saved" as const, operation: proposed };
      }),
    };
    const labels = { getLabels: jest.fn().mockResolvedValue([]), setLabels: jest.fn() };
    const boundary = new DeploymentStateBoundary({ bind: () => store }, labels);
    const first = context(operation("operation-first"));
    const second = context(operation("operation-second"));
    await Promise.all([boundary.initialize(first), boundary.initialize(second)]);
    (first as any).currentConfiguration.deploymentOrchestration = operation("operation-first");
    (second as any).currentConfiguration.deploymentOrchestration = operation("operation-second");

    const firstSave = boundary.persist(first);
    await firstIsWaiting;
    await boundary.persist(second);
    releaseFirst();

    await expect(firstSave).rejects.toThrow("owned by deployment operation-second");
    expect(durable).toEqual(expect.objectContaining({ revision: 1, operationId: "operation-second" }));
  });

  it("rejects unsupported state before projection or mutation", async () => {
    const store = {
      load: jest.fn().mockResolvedValue({ kind: "unsupported", stateVersion: 2 }),
      save: jest.fn(),
    };
    const labels = { getLabels: jest.fn(), setLabels: jest.fn() };
    const boundary = new DeploymentStateBoundary({ bind: () => store }, labels);
    await expect(boundary.initialize(context(operation()))).rejects.toThrow("unsupported");
    expect(store.save).not.toHaveBeenCalled();
    expect(labels.getLabels).not.toHaveBeenCalled();
  });
});
