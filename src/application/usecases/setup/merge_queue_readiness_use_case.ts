import type { TargetMergePolicyInspectionPort } from "../../ports/deployment_orchestration_ports";
import type { SetupMergeQueueReadinessPort, SetupMergeQueueReadinessRequest } from "../../ports/setup_wizard_ports";
import { mergeQueueReadinessFailureMessage, selectPullRequestMode } from "../../policies/deployment_plan_policy";
import { evaluateMergeQueueReadiness, type MergeQueueTargetRole } from "../../../domain/merge_queue_readiness";
import { redactSensitiveText } from "../../../domain/security/sensitive_text";
import type { DoctorCheck } from "../../../domain/setup";

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
      const area = `Merge queue readiness · ${target.role} (${target.branch})`;
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
            return [{ area, status: "fail", message: decision.reason }];
          }
          const readiness = evaluateMergeQueueReadiness({
            queueRequired: true,
            targetRole: target.role,
            targetBranch: target.branch,
            producers: capabilities.mergeQueueProducers,
            problems: capabilities.mergeQueueObservationProblems,
            attestations: request.configuration.repository.mergeQueueCheckAttestations,
          });
          return [{
            area,
            status: "fail",
            message: mergeQueueReadinessFailureMessage(readiness, request.configuration.repository.issueLocale),
          }, ...producerChecks(readiness.producers, target.role, spanish)];
        }
        if (decision.mode !== "merge-queue") {
          return [{
            area,
            status: "pass",
            message: spanish
              ? `El modo seleccionado es ${decision.mode}; este destino no necesita evidencia de productores de merge queue.`
              : `Selected mode is ${decision.mode}; merge-queue producer evidence is not required for this target.`,
          }];
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
          return [{
            area,
            status: "fail",
            message: mergeQueueReadinessFailureMessage(readiness, request.configuration.repository.issueLocale),
          }, ...producerChecks(readiness.producers, target.role, spanish)];
        }
        const verified = readiness.producers.filter((producer) => producer.verdict === "verified").length;
        const attested = readiness.producers.filter((producer) => producer.verdict === "attested").length;
        return [{
          area,
          status: "pass",
          message: spanish
            ? `Listo. ${verified} productor(es) requerido(s) verificados automáticamente y ${attested} cubiertos por atestación exacta.`
            : `Ready. ${verified} required producer(s) verified automatically and ${attested} covered by exact attestation.`,
        }, ...producerChecks(readiness.producers, target.role, spanish)];
      } catch (error) {
        return [{
          area,
          status: "fail",
          message: `Target policy could not be inspected: ${safeError(error)}`,
        }];
      }
    }));
    const checks = targetChecks.flat();
    if (request.configuration.features.hotfix !== false && configuredMode !== "create-only") {
      checks.push({
        area: "Merge queue readiness · active release",
        status: "warn",
        message: spanish
          ? "Las ramas de release activas se descubren dinámicamente y se revalidan antes de crear una rama o PR de reconciliación de hotfix."
          : "Active release branches are discovered dynamically and are revalidated before a hotfix reconciliation branch or PR is created.",
      });
    }
    for (const attestation of request.configuration.repository.mergeQueueCheckAttestations) {
      if (!observedCheckIdentities.has(`${attestation.context}\0${attestation.integrationId}`)) {
        checks.push({
          area: `Merge queue attestation · ${attestation.context}`,
          status: "warn",
          message: spanish
            ? "Esta atestación exacta no coincide con ningún check requerido observado en producción o desarrollo."
            : "This exact attestation does not match a required check observed on production or development.",
        });
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
  return producers.map((producer) => ({
    area: `Required producer · ${role} · ${producer.name}`,
    status: producer.verdict === "verified" || producer.verdict === "attested" ? "pass" : "fail",
    message: `${producer.verdict}: ${safeError(producer.reason)}${spanish && producer.verdict === "attested" ? " (atestación exacta revisada)" : ""}`,
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
