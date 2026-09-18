import type { TargetMergeCapabilities } from "../../../policies/deployment_plan_policy";
import type { CatalogMessage } from '../../../../domain/message_catalog';
import { createDefaultSetupConfiguration } from "../../../policies/setup_configuration_policy";
import { ENGLISH_SETUP_DOCTOR_DEFINITION } from '../../../policies/setup_doctor_message_catalog';
import { ResolveMessageCatalogUseCase } from '../../../usecases/localization/resolve_message_catalog_use_case';
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
        kind: "check", name: "External CI", integrationId: 999, support: "unknown",
        reason: "External <producer>\n::error::@team github_pat_abcdefghijklmnopqrstuvwxyz123456",
      }],
    })) };
    const checks = await new SetupMergeQueueReadinessUseCase(targets).inspect(request());
    expect(checks[0]).toEqual(expect.objectContaining({ status: "fail", summary: expect.stringContaining("External CI [unknown]") }));
    expect(JSON.stringify(checks)).not.toContain("github_pat_");
    expect(JSON.stringify(checks)).not.toContain("::error::");
    expect(JSON.stringify(checks)).not.toContain("@team");
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
    value.configuration.repository.repositoryLocale = "es-ES";
    const checks = await new SetupMergeQueueReadinessUseCase(targets).inspect(value);
    expect(checks[0]).toEqual(expect.objectContaining({ status: "pass", summary: expect.stringContaining("1 cubiertos por atestación exacta") }));
    expect(checks.find((check) => check.id.includes("producer.external-ci-999")))
      .toEqual(expect.objectContaining({ summary: expect.stringContaining("atestación exacta revisada") }));
    expect(checks.find((check) => check.id === "github.merge-queue.development"))
      .toEqual(expect.objectContaining({ status: "fail" }));
  });

  it("reports provider inspection errors as bounded failures", async () => {
    const targets = { getTargetCapabilities: jest.fn().mockRejectedValue(
      new Error("forbidden\n::error::@team github_pat_abcdefghijklmnopqrstuvwxyz123456"),
    ) };
    const checks = await new SetupMergeQueueReadinessUseCase(targets).inspect(request());
    expect(checks[0]).toEqual(expect.objectContaining({
      status: "fail",
      summary: "Target policy could not be inspected because the provider request failed.",
    }));
    expect(checks[0].summary).not.toContain("::error::");
    expect(checks[0].summary).not.toContain("@team");
    expect(checks[0].summary).not.toContain("github_pat_");
  });

  it("localizes fail-closed policy observation guidance", async () => {
    const targets = { getTargetCapabilities: jest.fn().mockResolvedValue(capabilities({
      mergeQueueObservationProblems: [{ area: "effective-rules", message: "Forbidden" }],
    })) };
    const value = request();
    value.configuration.repository.repositoryLocale = "es-ES";
    const checks = await new SetupMergeQueueReadinessUseCase(targets).inspect(value);
    expect(checks[0]).toEqual(expect.objectContaining({
      status: "fail",
      summary: expect.stringContaining("Restaura el acceso de lectura"),
    }));
    expect(checks[0].summary).not.toContain('Forbidden');
  });

  it('resolves one complete dynamic catalog for a standalone arbitrary-locale inspection', async () => {
    const targets = { getTargetCapabilities: jest.fn().mockResolvedValue(capabilities({
      mergeQueueRequired: true,
      mergeQueueProducers: [{
        kind: 'check', name: 'External CI', integrationId: 999, support: 'unknown', reason: 'Provider detail.',
      }],
    })) };
    const messages = Object.fromEntries(Object.entries(ENGLISH_SETUP_DOCTOR_DEFINITION.messages)
      .map(([id, message]) => [id, `ZH ${message as string}`])) as Record<string, CatalogMessage>;
    const query = jest.fn().mockResolvedValue({ targetLocale: 'zh-Hant-TW', messages });
    const resolver = new ResolveMessageCatalogUseCase({ query });
    const value = request();
    value.configuration.repository.repositoryLocale = 'zh-Hant-TW';

    const checks = await new SetupMergeQueueReadinessUseCase(targets, resolver).inspect(value);

    expect(checks[0].summary.startsWith('ZH ')).toBe(true);
    expect(JSON.stringify(checks)).not.toContain('Provider detail.');
    expect(query).toHaveBeenCalledTimes(1);
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
