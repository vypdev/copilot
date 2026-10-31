import { DeploymentMergeEffects, type DeploymentMergeInspection } from "../deployment_merge_effects";
import { DeploymentMergeEffectError } from "../../errors/deployment_merge_effect_error";
import type { BoundManagedPullRequestPort, ManagedPullRequestRecord } from "../../ports/deployment_orchestration_ports";
import type { DeploymentOperationSnapshot } from "../../../domain/deployment_operation";

const sha = "a".repeat(40);
const pr = (values: Partial<ManagedPullRequestRecord> = {}): ManagedPullRequestRecord => ({
  number: 41, nodeId: "PR_41", repositoryFullName: "owner/repo", headSha: sha,
  headBranch: "master", baseBranch: "develop", state: "open", merged: false, autoMergeEnabled: false,
  body: '<!-- copilot-deployment operation-id="operation-12345678" phase="reconciliation" issue="355" -->', ...values,
});
const inspection = (ready = false, mode = "auto-merge", extra = {}): Extract<DeploymentMergeInspection, {kind: "ready"}> => ({
  kind: "ready", decision: { kind: "mode", mode: mode as "auto-merge", reasonCode: "auto-merge-available" },
  capabilities: { autoMergeAllowed: true, immediatelyMergeable: ready, requiresStrictStatusChecks: false,
    mergeQueueRequired: false, mergeQueueProducers: [], mergeQueueObservationProblems: [], ...extra },
});
const rejected = (action: "merge" | "enable-auto-merge" = "merge", refresh = true) =>
  new DeploymentMergeEffectError(action, refresh, "provider.conflict", "Safe readiness rejection");

function harness(mode = "auto") {
  const port = { prepareIssueCompletion: jest.fn(), mergePullRequest: jest.fn(), enableAutoMerge: jest.fn(), enqueuePullRequest: jest.fn(),
    isPullRequestQueued: jest.fn().mockResolvedValue(false), getPullRequest: jest.fn().mockResolvedValue(pr()) };
  const inspect = jest.fn().mockResolvedValue(inspection());
  const persist = jest.fn();
  const operation = { prMode: mode } as DeploymentOperationSnapshot;
  const service = new DeploymentMergeEffects(port as unknown as BoundManagedPullRequestPort);
  const run = (initial = inspection(true), record = pr()) => service.configure(operation, record, initial, inspect, persist);
  return { port, inspect, persist, run };
}

describe("deployment automatic merge effects", () => {
  it.each([true, false])('removes the native launcher closing relation before automatic handoff (ready=%s)', async ready => {
    const events: string[] = [];
    let linked = true;
    const port = { prepareIssueCompletion: jest.fn(async () => { events.push('detach'); linked = false; }),
      mergePullRequest: jest.fn(async () => { events.push('merge'); expect(linked).toBe(false); }),
      enableAutoMerge: jest.fn(async () => { events.push('enable'); expect(linked).toBe(false); }) };
    const service = new DeploymentMergeEffects(port as unknown as BoundManagedPullRequestPort);
    await service.configure({ prMode: 'auto' } as DeploymentOperationSnapshot, pr(), inspection(ready),
      jest.fn(), jest.fn());
    expect(events).toEqual(['detach', ready ? 'merge' : 'enable']);
    expect(port.prepareIssueCompletion).toHaveBeenCalledWith(pr());
  });
  it("re-observes a rejected ready merge and enables native waiting at the same head", async () => {
    const v = harness(); v.port.mergePullRequest.mockRejectedValue(rejected());
    await expect(v.run()).resolves.toBe("auto-merge");
    expect(v.port.getPullRequest).toHaveBeenCalledWith(41);
    expect(v.inspect).toHaveBeenCalledWith(pr());
    expect(v.port.mergePullRequest).toHaveBeenCalledTimes(1);
    expect(v.port.enableAutoMerge).toHaveBeenCalledWith("PR_41", sha);
    expect(v.persist).toHaveBeenCalledTimes(2);
  });
  it("re-observes native clean rejection and requests an expected-head merge", async () => {
    const v = harness(); v.port.enableAutoMerge.mockRejectedValue(rejected("enable-auto-merge"));
    v.inspect.mockResolvedValue(inspection(true));
    await expect(v.run(inspection())).resolves.toBe("auto-merge");
    expect(v.port.mergePullRequest).toHaveBeenCalledWith(41, sha);
    expect(v.port.enableAutoMerge).toHaveBeenCalledTimes(1);
  });
  it.each(["auto-merge", "merge-queue", "create-only"])("preserves explicit %s mode", async (mode) => {
    const v = harness(mode); v.port.enableAutoMerge.mockRejectedValue(rejected("enable-auto-merge"));
    if (mode === "auto-merge") await expect(v.run(inspection())).rejects.toThrow("Safe readiness rejection");
    else await expect(v.run(inspection(false, mode))).resolves.toBe(mode);
    expect(v.port.getPullRequest).not.toHaveBeenCalled();
    expect(v.port.mergePullRequest).not.toHaveBeenCalled();
  });
  it.each([false, "unknown"])("does not refresh after an ineligible failure: %s", async (kind) => {
    const v = harness(); v.port.mergePullRequest.mockRejectedValue(kind === false ? rejected("merge", false) : new Error("secret"));
    await expect(v.run()).rejects.toThrow(kind === false ? "Safe readiness rejection" : "merge failed with an unclassified provider rejection");
    expect(v.port.getPullRequest).not.toHaveBeenCalled(); expect(v.port.enableAutoMerge).not.toHaveBeenCalled();
  });
  it.each([
    { headSha: "b".repeat(40) }, { headBranch: "other" }, { baseBranch: "other" }, { repositoryFullName: "other/repo" },
    { number: 42 }, { nodeId: "PR_other" }, { body: "" },
    { body: '<!-- copilot-deployment operation-id="other-operation" phase="reconciliation" issue="355" -->' },
    { body: '<!-- copilot-deployment operation-id="operation-12345678" phase="promotion" issue="355" -->' },
    { body: '<!-- copilot-deployment operation-id="operation-12345678" phase="reconciliation" issue="356" -->' },
  ])("rejects changed identity before a second effect: %j", async (changed) => {
    const v = harness(); v.port.mergePullRequest.mockRejectedValue(rejected()); v.port.getPullRequest.mockResolvedValue(pr(changed));
    await expect(v.run()).rejects.toEqual(expect.objectContaining({ code: "provider.conflict", retryable: false }));
    expect(v.inspect).not.toHaveBeenCalled(); expect(v.port.enableAutoMerge).not.toHaveBeenCalled();
  });
  it("rejects a missing original marker", async () => {
    const v = harness(); v.port.mergePullRequest.mockRejectedValue(rejected());
    await expect(v.run(inspection(true), pr({body: ""}))).rejects.toThrow("identity or frozen head changed");
  });
  it("accepts a concurrent merge with the exact identity without another effect", async () => {
    const v = harness(); v.port.mergePullRequest.mockRejectedValue(rejected());
    v.port.getPullRequest.mockResolvedValue(pr({ state: "closed", merged: true }));
    await expect(v.run()).resolves.toBe("auto-merge"); expect(v.inspect).not.toHaveBeenCalled();
  });
  it("blocks closed-unmerged PRs", async () => {
    const v = harness(); v.port.mergePullRequest.mockRejectedValue(rejected()); v.port.getPullRequest.mockResolvedValue(pr({state:"closed"}));
    await expect(v.run()).rejects.toThrow("closed without merging"); expect(v.inspect).not.toHaveBeenCalled();
  });
  it("fails closed when the fresh rule inspection cannot authorize a mode", async () => {
    const v = harness(); v.port.mergePullRequest.mockRejectedValue(rejected());
    v.inspect.mockResolvedValue({kind:"blocked",reason:"Required producer cannot be proven"});
    await expect(v.run()).rejects.toThrow("Required producer cannot be proven"); expect(v.port.enableAutoMerge).not.toHaveBeenCalled();
  });
  it("never repeats the same rejected effect", async () => {
    const v = harness(); v.port.mergePullRequest.mockRejectedValue(rejected()); v.inspect.mockResolvedValue(inspection(true));
    await expect(v.run()).rejects.toThrow("Safe readiness rejection"); expect(v.port.mergePullRequest).toHaveBeenCalledTimes(1);
  });
  it("accepts concurrent native enablement", async () => {
    const v = harness(); v.port.enableAutoMerge.mockRejectedValue(rejected("enable-auto-merge"));
    v.port.getPullRequest.mockResolvedValue(pr({autoMergeEnabled:true}));
    await expect(v.run(inspection())).resolves.toBe("auto-merge"); expect(v.port.enableAutoMerge).toHaveBeenCalledTimes(1);
  });
  it("never loops after the alternate effect also rejects", async () => {
    const v = harness(); v.port.mergePullRequest.mockRejectedValue(rejected()); v.port.enableAutoMerge.mockRejectedValue(rejected("enable-auto-merge"));
    await expect(v.run()).rejects.toThrow("Safe readiness rejection"); expect(v.port.getPullRequest).toHaveBeenCalledTimes(1);
  });
  it("uses freshly inspected queue policy and the frozen head", async () => {
    const v = harness(); v.port.mergePullRequest.mockRejectedValue(rejected()); v.inspect.mockResolvedValue(inspection(false,"merge-queue"));
    await expect(v.run()).resolves.toBe("merge-queue"); expect(v.persist).toHaveBeenLastCalledWith("merge-queue");
    expect(v.port.enqueuePullRequest).toHaveBeenCalledWith("PR_41",sha);
  });
  it("does not duplicate queue membership", async () => {
    const v = harness(); v.port.isPullRequestQueued.mockResolvedValue(true);
    await v.run(inspection(false,"merge-queue")); expect(v.port.enqueuePullRequest).not.toHaveBeenCalled();
  });
  it("does not duplicate existing native enablement", async () => {
    const v = harness(); await v.run(inspection(),pr({autoMergeEnabled:true})); expect(v.port.enableAutoMerge).not.toHaveBeenCalled();
  });
  it("retains explicit create-only after a fresh policy decision", async () => {
    const v = harness(); v.port.mergePullRequest.mockRejectedValue(rejected()); v.inspect.mockResolvedValue(inspection(false,"create-only"));
    await expect(v.run()).resolves.toBe("create-only"); expect(v.port.enableAutoMerge).not.toHaveBeenCalled();
  });
  it("stops before effects if mode persistence fails", async () => {
    const v = harness(); v.persist.mockRejectedValue(new Error("storage unavailable"));
    await expect(v.run()).rejects.toThrow("storage unavailable"); expect(v.port.mergePullRequest).not.toHaveBeenCalled();
  });
  it("stops after a failed authoritative PR read", async () => {
    const v = harness(); v.port.mergePullRequest.mockRejectedValue(rejected()); v.port.getPullRequest.mockRejectedValue(new Error("read failed"));
    await expect(v.run()).rejects.toThrow("read failed"); expect(v.port.enableAutoMerge).not.toHaveBeenCalled();
  });
});
