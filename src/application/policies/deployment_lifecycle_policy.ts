import type { CopilotLifecycleLabels } from "../../domain/copilot_lifecycle";
import type { DeploymentOperationSnapshot } from "../../domain/deployment_operation";
import { managedLifecycleLabelNames } from "../../domain/copilot_lifecycle";

export interface DeploymentLabelProjection {
  readonly deploy: string;
  readonly deployed: string;
  readonly lifecycle: CopilotLifecycleLabels;
}

export function projectDeploymentLabels(
  current: readonly string[],
  operation: DeploymentOperationSnapshot,
  labels: DeploymentLabelProjection,
): string[] {
  const managed = new Set(managedLifecycleLabelNames(labels.lifecycle));
  let projected = current.filter((label) => !managed.has(label));
  if (operation.publicationVerified) {
    projected = projected.filter((label) => label !== labels.deploy);
    if (!projected.includes(labels.deployed)) projected.push(labels.deployed);
  }

  const selectedMode = operation.selectedPrMode ?? operation.prMode;
  if (operation.phase === "completed") projected.push(labels.lifecycle.verified);
  else if (operation.phase === "blocked") projected.push(labels.lifecycle.blocked, labels.lifecycle.awaitingMaintainer);
  else if ((operation.phase === "promotion_pr_pending" || operation.phase === "reconciliation_pending") && selectedMode === "create-only") {
    projected.push(labels.lifecycle.ready, labels.lifecycle.awaitingMaintainer);
  } else if (operation.phase === "promotion_pr_pending" || operation.phase === "reconciliation_pending") {
    projected.push(labels.lifecycle.reviewing);
  } else {
    projected.push(labels.lifecycle.inProgress);
  }
  return [...new Set(projected)];
}
