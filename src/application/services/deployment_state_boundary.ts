import type {
  DeploymentOrchestrationContext,
  DeploymentStateStoreFactoryPort,
  DeploymentStateStorePort,
} from "../ports/deployment_orchestration_ports";
import type { IssueLabelsPort } from "../ports/issue_management_ports";
import {
  deploymentStateFence,
  nextDeploymentRevision,
  type ExpectedDeploymentState,
} from "../../domain/deployment_state_fence";
import type { DeploymentOperationSnapshot } from "../../domain/deployment_operation";
import { projectDeploymentLabels } from "../policies/deployment_lifecycle_policy";
import { ApplicationError } from "../errors/application_error";

export class DeploymentStateBoundary {
  private readonly checkpoints = new WeakMap<DeploymentOrchestrationContext, ExpectedDeploymentState>();
  private readonly stores = new WeakMap<DeploymentOrchestrationContext, DeploymentStateStorePort>();

  constructor(
    private readonly state: DeploymentStateStoreFactoryPort,
    private readonly labels: IssueLabelsPort,
  ) {}

  async initialize(execution: DeploymentOrchestrationContext): Promise<void> {
    const store = this.state.bind({
      owner: execution.owner,
      repository: execution.repo,
      issue: execution.singleAction.issue,
      token: execution.tokens.token,
    });
    this.stores.set(execution, store);
    const loaded = await store.load();
    if (loaded.kind === "absent") {
      execution.currentConfiguration.deploymentOrchestration = undefined;
      this.checkpoints.set(execution, { kind: "absent" });
      return;
    }
    if (loaded.kind === "current") {
      execution.currentConfiguration.deploymentOrchestration = loaded.operation;
      this.checkpoints.set(execution, { kind: "current", fence: deploymentStateFence(loaded.operation) });
      return;
    }
    if (loaded.kind === "unsupported") {
      throw new ApplicationError(
        "configuration.unsupported",
        `Stored deployment state version ${String(loaded.stateVersion)} is unsupported. Start a fresh launcher issue.`,
      );
    }
    throw new ApplicationError("configuration.invalid", `${loaded.reason} Start a fresh launcher issue.`);
  }

  async persist(execution: DeploymentOrchestrationContext): Promise<void> {
    const operation = execution.currentConfiguration.deploymentOrchestration;
    const expected = this.checkpoints.get(execution);
    const store = this.stores.get(execution);
    if (!operation || !expected || !store) {
      throw new ApplicationError("workflow.invalid-event", "Deployment state boundary was not initialized.");
    }
    const revision = nextDeploymentRevision(expected);
    if (revision === undefined) {
      throw new ApplicationError("configuration.invalid", "Deployment revision reached its safe integer limit.");
    }
    const proposed: DeploymentOperationSnapshot = { ...operation, stateVersion: 1, revision };
    execution.currentConfiguration.deploymentOrchestration = proposed;
    const outcome = await store.save({
      expected,
      state: { ...execution.currentConfiguration, deploymentOrchestration: proposed },
    });
    if (outcome.kind === "saved" || outcome.kind === "already-applied") {
      execution.currentConfiguration.deploymentOrchestration = outcome.operation;
      this.checkpoints.set(execution, { kind: "current", fence: deploymentStateFence(outcome.operation) });
      await this.projectLabels(execution, outcome.operation);
      return;
    }
    if (outcome.kind === "stale") throw new SupersededDeploymentInvocationError(outcome.operation);
    if (outcome.kind === "conflict") {
      throw new ApplicationError("provider.conflict", `Launcher issue is owned by deployment ${outcome.operation.operationId}.`);
    }
    if (outcome.kind === "missing") {
      throw new ApplicationError("workflow.stale", "The expected deployment operation disappeared before it could be saved.");
    }
    throw new ApplicationError("configuration.invalid", outcome.reason);
  }

  private async projectLabels(
    execution: DeploymentOrchestrationContext,
    operation: DeploymentOperationSnapshot,
  ): Promise<void> {
    const labels = await this.labels.getLabels(
      execution.owner,
      execution.repo,
      execution.singleAction.issue,
      execution.tokens.token,
    );
    const next = projectDeploymentLabels(labels, operation, execution.labels);
    if (next.join("\0") !== labels.join("\0")) {
      await this.labels.setLabels(
        execution.owner,
        execution.repo,
        execution.singleAction.issue,
        next,
        execution.tokens.token,
      );
    }
  }
}

export class SupersededDeploymentInvocationError extends Error {
  constructor(readonly current: DeploymentOperationSnapshot) {
    super(`Deployment invocation was superseded by revision ${current.revision}.`);
  }
}
