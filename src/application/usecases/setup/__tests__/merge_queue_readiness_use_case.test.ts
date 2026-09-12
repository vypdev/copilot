import type { TargetMergeCapabilities } from "../../../policies/deployment_plan_policy";
import { createDefaultSetupConfiguration } from "../../../policies/setup_configuration_policy";
import { SetupMergeQueueReadinessUseCase } from "../merge_queue_readiness_use_case";

const capabilities = (overrides: Partial<TargetMergeCapabilities> = {}): TargetMergeCapabilities => ({
  autoMergeAllowed: true,
  mergeQueueRequired: false,
  immediatelyMergeable: false,
  requiresStrictStatusChecks: false,
  mergeQueueProducers: [],
  mergeQueueObservationProblems: [],
  ...overrides,
});

function request() {
  return {
    owner: "owner",
    repository: "repo",
    token: "token",
    configuration: createDefaultSetupConfiguration(),
  };
}

describe("SetupMergeQueueReadinessUseCase", () => {
  it("reports both long-lived targets and the dynamic active-release boundary", async () => {
    const targets = { getTargetCapabilities: jest.fn().mockResolvedValue(capabilities()) };
    const checks = await new SetupMergeQueueReadinessUseCase(targets).inspect(request());
    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "github.merge-queue.production", status: "pass" }),
      expect.objectContaining({ id: "github.merge-queue.development", status: "pass" }),
      expect.objectContaining({ id: "github.merge-queue.active-release", status: "warn" }),
    ]));
  });

  it("reports ready only when every queue producer is verified", async () => {
    const targets = { getTargetCapabilities: jest.fn().mockResolvedValue(capabilities({
      mergeQueueRequired: true,
      mergeQueueProducers: [{
        kind: "check", name: "CI Check", integrationId: 15368, support: "supported", reason: "Verified workflow.",
      }],
    })) };
    const checks = await new SetupMergeQueueReadinessUseCase(targets).inspect(request());
    expect(checks.filter((check) => ["github.merge-queue.production", "github.merge-queue.development"].includes(check.id)))
      .toEqual([
        expect.objectContaining({ status: "pass", summary: expect.stringContaining("1 required producer(s) verified") }),
        expect.objectContaining({ status: "pass", summary: expect.stringContaining("1 required producer(s) verified") }),
      ]);
    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "github.merge-queue.production.producer.ci-check-15368", status: "pass" }),
    ]));
  });

  it("fails an unknown producer without an exact attestation", async () => {
    const targets = { getTargetCapabilities: jest.fn().mockResolvedValue(capabilities({
      mergeQueueRequired: true,
      mergeQueueProducers: [{
        kind: "check", name: "External CI", integrationId: 999, support: "unknown", reason: "External producer.",
      }],
    })) };
    const checks = await new SetupMergeQueueReadinessUseCase(targets).inspect(request());
    expect(checks[0]).toEqual(expect.objectContaining({ status: "fail", summary: expect.stringContaining("External CI [unknown]") }));
  });

  it("applies attestations only to their configured logical target", async () => {
    const targets = { getTargetCapabilities: jest.fn().mockResolvedValue(capabilities({
      mergeQueueRequired: true,
      mergeQueueProducers: [{
        kind: "check", name: "External CI", integrationId: 999, support: "unknown", reason: "External producer.",
      }],
    })) };
    const value = request();
    value.configuration.repository.mergeQueueCheckAttestations = [
      { context: "External CI", integrationId: 999, targets: ["production"] },
    ];
    const checks = await new SetupMergeQueueReadinessUseCase(targets).inspect(value);
    expect(checks[0]).toEqual(expect.objectContaining({ status: "pass", summary: expect.stringContaining("1 covered by exact attestation") }));
    expect(checks.find((check) => check.id === "github.merge-queue.development"))
      .toEqual(expect.objectContaining({ status: "fail" }));
  });

  it("reports provider inspection errors as bounded failures", async () => {
    const targets = { getTargetCapabilities: jest.fn().mockRejectedValue(
      new Error("forbidden\n::error::@team github_pat_abcdefghijklmnopqrstuvwxyz123456"),
    ) };
    const checks = await new SetupMergeQueueReadinessUseCase(targets).inspect(request());
    expect(checks[0]).toEqual(expect.objectContaining({ status: "fail", summary: expect.stringContaining("forbidden") }));
    expect(checks[0].summary).not.toContain("::error::");
    expect(checks[0].summary).not.toContain("@team");
    expect(checks[0].summary).not.toContain("github_pat_");
  });

  it("localizes fail-closed policy observation guidance", async () => {
    const targets = { getTargetCapabilities: jest.fn().mockResolvedValue(capabilities({
      mergeQueueObservationProblems: [{ area: "effective-rules", message: "Forbidden" }],
    })) };
    const value = request();
    value.configuration.repository.issueLocale = "es-ES";
    const checks = await new SetupMergeQueueReadinessUseCase(targets).inspect(value);
    expect(checks[0]).toEqual(expect.objectContaining({
      status: "fail",
      summary: expect.stringContaining("Restaura el acceso de lectura"),
    }));
  });

  it("warns about attestations that match no currently required producer", async () => {
    const targets = { getTargetCapabilities: jest.fn().mockResolvedValue(capabilities()) };
    const value = request();
    value.configuration.repository.mergeQueueCheckAttestations = [
      { context: "Removed vendor gate", integrationId: 999, targets: ["production"] },
    ];
    const checks = await new SetupMergeQueueReadinessUseCase(targets).inspect(value);
    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "github.merge-queue.attestation.removed-vendor-gate-999",
        status: "warn",
      }),
    ]));
  });

  it("warns about an attestation that matches no observed required check", async () => {
    const targets = { getTargetCapabilities: jest.fn().mockResolvedValue(capabilities()) };
    const value = request();
    value.configuration.repository.mergeQueueCheckAttestations = [
      { context: "Retired CI", integrationId: 99, targets: ["production"] },
    ];
    const checks = await new SetupMergeQueueReadinessUseCase(targets).inspect(value);
    expect(checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "github.merge-queue.attestation.retired-ci-99", status: "warn" }),
    ]));
  });

  it("skips target inspection when release and hotfix automation are disabled", async () => {
    const targets = { getTargetCapabilities: jest.fn() };
    const value = request();
    value.configuration.features.release = false;
    value.configuration.features.hotfix = false;
    await expect(new SetupMergeQueueReadinessUseCase(targets).inspect(value)).resolves.toEqual([]);
    expect(targets.getTargetCapabilities).not.toHaveBeenCalled();
  });
});
