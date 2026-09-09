import type {
  DeploymentIssueState,
  DeploymentStateQuery,
  DeploymentStateStorePort,
} from "../../../application/ports/deployment_orchestration_ports";
import type {
  IssueDescriptionCommandPort,
  IssueDescriptionQueryPort,
} from "../../../application/ports/issue_description_ports";
import { Config } from "../../model/config";
import { ConfigurationHandler } from "../../../manager/description/configuration_handler";
import { buildConfigurationPayload } from "../../../manager/description/configuration_payload_policy";

export class DeploymentStateRepository implements DeploymentStateStorePort {
  private readonly block: ConfigurationHandler;

  constructor(private readonly issues: IssueDescriptionQueryPort & IssueDescriptionCommandPort) {
    this.block = new ConfigurationHandler(issues);
  }

  async load(query: DeploymentStateQuery) {
    const description = await this.issues.getDescription(query.owner, query.repository, query.issue, query.token);
    const raw = this.block.getContent(description);
    if (!raw) return undefined;
    return new Config(JSON.parse(raw)).deploymentOrchestration;
  }

  async save(command: DeploymentStateQuery & { readonly state: DeploymentIssueState }): Promise<void> {
    const description = await this.issues.getDescription(command.owner, command.repository, command.issue, command.token);
    const stored = this.block.getContent(description);
    const payload = buildConfigurationPayload({ currentConfiguration: command.state }, stored);
    const updated = this.block.updateContent(description, payload);
    if (updated === undefined) throw new Error("Issue configuration markers are missing or inconsistent.");
    await this.issues.updateDescription(command.owner, command.repository, command.issue, updated, command.token);
  }
}
