import type { TargetMergePolicyInspectionPort } from "../../ports/deployment_orchestration_ports";
import type { SetupMergeQueueReadinessPort, SetupMergeQueueReadinessRequest } from "../../ports/setup_wizard_ports";
import {
  mergeQueueReadinessFailureMessage,
  pullRequestModeDecisionMessage,
  selectPullRequestMode,
} from "../../policies/deployment_plan_policy";
import { evaluateMergeQueueReadiness, type MergeQueueTargetRole } from "../../../domain/merge_queue_readiness";
import type { DoctorCheck } from "../../../domain/setup";
import { doctorCheck, normalizedDoctorPathId } from "../../policies/setup_doctor_report_policy";
import type { MessageCatalogResolutionPort } from '../../ports/message_catalog_ports';
import {
  resolveSetupDoctorCatalog,
  type SetupDoctorMessageCatalog,
} from '../../policies/setup_doctor_message_catalog';
import { producerStateMessageId } from '../../policies/merge_queue_message_catalog';

export class SetupMergeQueueReadinessUseCase implements SetupMergeQueueReadinessPort {
  constructor(
    private readonly targets: TargetMergePolicyInspectionPort,
    private readonly catalogResolver?: MessageCatalogResolutionPort,
  ) {}

  async inspect(request: SetupMergeQueueReadinessRequest): Promise<readonly DoctorCheck[]> {
    if (request.configuration.features.release === false && request.configuration.features.hotfix === false) return [];
    const catalog = request.catalog ?? await resolveSetupDoctorCatalog(
      request.configuration.repository.repositoryLocale,
      request.configuration.agents.planner,
      this.catalogResolver,
    );
    const configuredMode = request.configuration.repository.reconciliationPullRequestMode;
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
              summary: pullRequestModeDecisionMessage(decision, catalog),
              action: catalog.message('doctor.mergeQueue.configureSupportedAction'),
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
            summary: mergeQueueReadinessFailureMessage(readiness, catalog),
            action: catalog.message('doctor.mergeQueue.repairOrAttestAction'),
            evidence: { targetRole: target.role, targetBranch: target.branch },
          }), ...producerChecks(readiness.producers, target.role, catalog)];
        }
        if (decision.mode !== "merge-queue") {
          return [doctorCheck({
            id,
            status: "pass",
            summary: catalog.message('doctor.mergeQueue.selectedMode', { mode: decision.mode }),
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
            summary: mergeQueueReadinessFailureMessage(readiness, catalog),
            action: catalog.message('doctor.mergeQueue.repairOrAttestAction'),
            evidence: { targetRole: target.role, targetBranch: target.branch },
          }), ...producerChecks(readiness.producers, target.role, catalog)];
        }
        const verified = readiness.producers.filter((producer) => producer.verdict === "verified").length;
        const attested = readiness.producers.filter((producer) => producer.verdict === "attested").length;
        return [doctorCheck({
          id,
          status: "pass",
          summary: catalog.message('doctor.mergeQueue.ready', { verified, attested }),
          evidence: { targetRole: target.role, targetBranch: target.branch, verified, attested },
        }), ...producerChecks(readiness.producers, target.role, catalog)];
      } catch {
        return [doctorCheck({
          id,
          status: "fail",
          summary: catalog.message('doctor.mergeQueue.targetUnverified'),
          action: catalog.message('doctor.mergeQueue.targetUnverifiedAction'),
          evidence: { targetRole: target.role, targetBranch: target.branch },
        })];
      }
    }));
    const checks = targetChecks.flat();
    if (request.configuration.features.hotfix !== false && configuredMode !== "create-only") {
      checks.push(doctorCheck({
        id: "github.merge-queue.active-release",
        status: "warn",
        summary: catalog.message('doctor.mergeQueue.activeRelease'),
        evidence: { dynamicTarget: true },
      }));
    }
    for (const attestation of request.configuration.repository.mergeQueueCheckAttestations) {
      if (!observedCheckIdentities.has(`${attestation.context}\0${attestation.integrationId}`)) {
        checks.push(doctorCheck({
          id: `github.merge-queue.attestation.${normalizedDoctorPathId(`${attestation.context}-${attestation.integrationId}`)}`,
          status: "warn",
          summary: catalog.message('doctor.mergeQueue.staleAttestation'),
          action: catalog.message('doctor.mergeQueue.staleAttestationAction'),
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
  catalog: SetupDoctorMessageCatalog,
): DoctorCheck[] {
  return producers.map((producer) => doctorCheck({
    id: `github.merge-queue.${role}.producer.${normalizedDoctorPathId(`${producer.name}-${producer.integrationId ?? 'workflow'}`)}`,
    status: producer.verdict === "verified" || producer.verdict === "attested" ? "pass" : "fail",
    summary: catalog.message('doctor.mergeQueue.producer', {
      verdict: producer.verdict,
      state: catalog.message(producerStateMessageId(producer.verdict)),
    }),
    ...(producer.verdict === "verified" || producer.verdict === "attested"
      ? {}
      : { action: catalog.message('doctor.mergeQueue.producerAction') }),
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
