import type {
  DeploymentIssueState,
  DeploymentStateBinding,
  DeploymentStateStoreFactoryPort,
  DeploymentStateStorePort,
} from "../../../application/ports/deployment_orchestration_ports";
import type {
  IssueDescriptionCommandPort,
  IssueDescriptionQueryPort,
} from "../../../application/ports/issue_description_ports";
import {
  decideDeploymentStateSave,
  readDeploymentOperationState,
  type DeploymentStateLoadOutcome,
  type DeploymentStateSaveOutcome,
  type ExpectedDeploymentState,
} from "../../../domain/deployment_state_fence";
import type { DeploymentOperationSnapshot } from "../../../domain/deployment_operation";
import { CONFIG_SCHEMA_VERSION } from "../../model/config";
import { ConfigurationHandler } from "../../../manager/description/configuration_handler";
import { buildConfigurationPayload } from "../../../manager/description/configuration_payload_policy";

type IssueDescriptionPort = IssueDescriptionQueryPort & IssueDescriptionCommandPort;

export class DeploymentStateRepositoryFactory implements DeploymentStateStoreFactoryPort {
  constructor(private readonly issues: IssueDescriptionPort) {}

  bind(binding: DeploymentStateBinding): DeploymentStateStorePort {
    return new CredentialBoundDeploymentStateRepository(this.issues, binding);
  }
}

class CredentialBoundDeploymentStateRepository implements DeploymentStateStorePort {
  private readonly block: ConfigurationHandler;

  constructor(
    private readonly issues: IssueDescriptionPort,
    private readonly binding: DeploymentStateBinding,
  ) {
    this.block = new ConfigurationHandler(issues);
  }

  async load(): Promise<DeploymentStateLoadOutcome> {
    const description = await this.getDescription();
    return readStateFromDescription(this.block, description);
  }

  async save(command: {
    readonly expected: ExpectedDeploymentState;
    readonly state: DeploymentIssueState & { readonly deploymentOrchestration: DeploymentOperationSnapshot };
  }): Promise<DeploymentStateSaveOutcome> {
    const description = await this.getDescription();
    const actual = readStateFromDescription(this.block, description);
    const proposed = command.state.deploymentOrchestration;
    const decision = decideDeploymentStateSave(actual, command.expected, proposed);
    if (decision.kind !== "write") return decision;

    const stored = this.block.getContent(description);
    const payload = buildConfigurationPayload({ currentConfiguration: command.state }, stored);
    const updated = this.block.updateContent(description, payload);
    if (updated === undefined) {
      return { kind: "invalid", reason: "Issue configuration markers are missing or inconsistent." };
    }
    await this.issues.updateDescription(
      this.binding.owner,
      this.binding.repository,
      this.binding.issue,
      updated,
      this.binding.token,
    );
    return { kind: "saved", operation: proposed };
  }

  private async getDescription(): Promise<string> {
    return (await this.issues.getDescription(
      this.binding.owner,
      this.binding.repository,
      this.binding.issue,
      this.binding.token,
    )) ?? "";
  }
}

function readStateFromDescription(
  block: ConfigurationHandler,
  description: string,
): DeploymentStateLoadOutcome {
  const raw = block.getContent(description);
  if (raw === undefined) return { kind: "absent" };
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { kind: "invalid", reason: "Issue configuration is not valid JSON." };
  }
  if (!isRecord(payload)) {
    return { kind: "invalid", reason: "Issue configuration must be an object." };
  }
  if (payload.schemaVersion !== CONFIG_SCHEMA_VERSION) {
    return {
      kind: "unsupported",
      stateVersion: `configuration-schema-${String(payload.schemaVersion)}`,
    };
  }
  return readDeploymentOperationState(payload.deploymentOrchestration);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
