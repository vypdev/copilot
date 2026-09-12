import type { TargetMergePolicyInspectionPort } from "../../ports/deployment_orchestration_ports";
import type { SetupMergeQueueReadinessPort, SetupMergeQueueReadinessRequest } from "../../ports/setup_wizard_ports";
import { mergeQueueReadinessFailureMessage, selectPullRequestMode } from "../../policies/deployment_plan_policy";
import { evaluateMergeQueueReadiness, type MergeQueueTargetRole } from "../../../domain/merge_queue_readiness";
import { redactSensitiveText } from "../../../domain/security/sensitive_text";
import type { DoctorCheck } from "../../../domain/setup";
import { doctorCheck, normalizedDoctorPathId } from "../../policies/setup_doctor_report_policy";

export class SetupMergeQueueReadinessUseCase implements SetupMergeQueueReadinessPort {
  constructor(private readonly targets: TargetMergePolicyInspectionPort) {}

  async inspect(request: SetupMergeQueueReadinessRequest): Promise<readonly DoctorCheck[]> {
    if (request.configuration.features.release === false && request.configuration.features.hotfix === false) return [];
    const configuredMode = request.configuration.repository.reconciliationPullRequestMode;
    const spanish = request.configuration.repository.issueLocale.toLowerCase().startsWith("es");
    const targets = uniqueTargets([
      { role: "production", branch: request.configuration.repository.mainBranch },
      { role: "development", branch: request.configuration.repository.developmentBranch },
    ]);
    const observedCheckIdentities = new Set<string>();
    const targetChecks = await Promise.all(targets.map(async (target): Promise<readonly DoctorCheck[]> => {
      const id = `github.merge-queue.${target.role}`;
      try {
        const capabilities = await this.targets.getTargetCapabilities(
          request.owner,
          request.repository,
          target.branch,
          request.token,
        );
        const decision = selectPullRequestMode(configuredMode, capabilities);
        for (const producer of capabilities.mergeQueueProducers) {
          if (producer.kind === "check" && producer.integrationId !== undefined) {
            observedCheckIdentities.add(`${producer.name}\0${producer.integrationId}`);
          }
        }
        if (decision.kind === "unsupported") {
          if (capabilities.mergeQueueObservationProblems.length === 0) {
            return [doctorCheck({
              id,
              status: "fail",
              summary: decision.reason,
              action: "Configure a supported merge-queue producer or choose another reconciliation mode.",
              evidence: { targetRole: target.role, targetBranch: target.branch },
            })];
          }
          const readiness = evaluateMergeQueueReadiness({
            queueRequired: true,
            targetRole: target.role,
            targetBranch: target.branch,
            producers: capabilities.mergeQueueProducers,
            problems: capabilities.mergeQueueObservationProblems,
            attestations: request.configuration.repository.mergeQueueCheckAttestations,
          });
          return [doctorCheck({
            id,
            status: "fail",
            summary: mergeQueueReadinessFailureMessage(readiness, request.configuration.repository.issueLocale),
            action: "Repair or attest every required merge-queue producer.",
            evidence: { targetRole: target.role, targetBranch: target.branch },
          }), ...producerChecks(readiness.producers, target.role, spanish)];
        }
        if (decision.mode !== "merge-queue") {
          return [doctorCheck({
            id,
            status: "pass",
            summary: spanish
              ? `El modo seleccionado es ${decision.mode}; este destino no necesita evidencia de productores de merge queue.`
              : `Selected mode is ${decision.mode}; merge-queue producer evidence is not required for this target.`,
            evidence: { targetRole: target.role, targetBranch: target.branch, selectedMode: decision.mode },
          })];
        }
        const readiness = evaluateMergeQueueReadiness({
          queueRequired: capabilities.mergeQueueRequired,
          targetRole: target.role,
          targetBranch: target.branch,
          producers: capabilities.mergeQueueProducers,
          problems: capabilities.mergeQueueObservationProblems,
          attestations: request.configuration.repository.mergeQueueCheckAttestations,
        });
        if (readiness.verdict !== "ready") {
          return [doctorCheck({
            id,
            status: "fail",
            summary: mergeQueueReadinessFailureMessage(readiness, request.configuration.repository.issueLocale),
            action: "Repair or attest every required merge-queue producer.",
            evidence: { targetRole: target.role, targetBranch: target.branch },
          }), ...producerChecks(readiness.producers, target.role, spanish)];
        }
        const verified = readiness.producers.filter((producer) => producer.verdict === "verified").length;
        const attested = readiness.producers.filter((producer) => producer.verdict === "attested").length;
        return [doctorCheck({
          id,
          status: "pass",
          summary: spanish
            ? `Listo. ${verified} productor(es) requerido(s) verificados automáticamente y ${attested} cubiertos por atestación exacta.`
            : `Ready. ${verified} required producer(s) verified automatically and ${attested} covered by exact attestation.`,
          evidence: { targetRole: target.role, targetBranch: target.branch, verified, attested },
        }), ...producerChecks(readiness.producers, target.role, spanish)];
      } catch (error) {
        return [doctorCheck({
          id,
          status: "fail",
          summary: `Target policy could not be inspected: ${safeError(error)}`,
          action: "Check the setup PAT permissions and target branch policy, then retry.",
          evidence: { targetRole: target.role, targetBranch: target.branch },
        })];
      }
    }));
    const checks = targetChecks.flat();
    if (request.configuration.features.hotfix !== false && configuredMode !== "create-only") {
      checks.push(doctorCheck({
        id: "github.merge-queue.active-release",
        status: "warn",
        summary: spanish
          ? "Las ramas de release activas se descubren dinámicamente y se revalidan antes de crear una rama o PR de reconciliación de hotfix."
          : "Active release branches are discovered dynamically and are revalidated before a hotfix reconciliation branch or PR is created.",
        evidence: { dynamicTarget: true },
      }));
    }
    for (const attestation of request.configuration.repository.mergeQueueCheckAttestations) {
      if (!observedCheckIdentities.has(`${attestation.context}\0${attestation.integrationId}`)) {
        checks.push(doctorCheck({
          id: `github.merge-queue.attestation.${normalizedDoctorPathId(`${attestation.context}-${attestation.integrationId}`)}`,
          status: "warn",
          summary: spanish
            ? "Esta atestación exacta no coincide con ningún check requerido observado en producción o desarrollo."
            : "This exact attestation does not match a required check observed on production or development.",
          action: "Remove the stale attestation or correct its exact check identity.",
          evidence: { context: attestation.context, integrationId: String(attestation.integrationId) },
        }));
      }
    }
    return checks;
  }
}

function producerChecks(
  producers: readonly import("../../../domain/merge_queue_readiness").MergeQueueEvaluatedProducer[],
  role: MergeQueueTargetRole,
  spanish: boolean,
): DoctorCheck[] {
  return producers.map((producer) => doctorCheck({
    id: `github.merge-queue.${role}.producer.${normalizedDoctorPathId(`${producer.name}-${producer.integrationId ?? 'workflow'}`)}`,
    status: producer.verdict === "verified" || producer.verdict === "attested" ? "pass" : "fail",
    summary: `${producer.verdict}: ${safeError(producer.reason)}${spanish && producer.verdict === "attested" ? " (atestación exacta revisada)" : ""}`,
    ...(producer.verdict === "verified" || producer.verdict === "attested"
      ? {}
      : { action: "Configure or exactly attest this required producer." }),
    evidence: { targetRole: role, producer: producer.name, verdict: producer.verdict },
  }));
}

function uniqueTargets(targets: readonly { role: MergeQueueTargetRole; branch: string }[]): Array<{ role: MergeQueueTargetRole; branch: string }> {
  const seen = new Set<string>();
  return targets.filter((target) => {
    const identity = `${target.role}\0${target.branch}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redactSensitiveText(message)
    .replace(/[\r\n<>]/g, " ")
    .replace(/::/g, "﹕﹕")
    .replace(/@/g, "@\u200b")
    .slice(0, 240);
}
