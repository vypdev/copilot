import type {
  DeploymentContinuationPort,
  DeploymentGitPort,
  DeploymentPresentationPort,
  DeploymentPublicationReceiptPort,
  DeploymentStateStoreFactoryPort,
  ManagedPullRequestPort,
  TargetMergePolicyInspectionPort,
} from "../ports/deployment_orchestration_ports";
import type { IssueClosurePort } from "../ports/issue_lifecycle_ports";
import type { IssueLabelsPort } from "../ports/issue_management_ports";

export interface DeploymentOrchestrationDependencies {
  readonly pullRequests: ManagedPullRequestPort;
  readonly targetRules: TargetMergePolicyInspectionPort;
  readonly git: DeploymentGitPort;
  readonly continuation: DeploymentContinuationPort;
  readonly presentation: DeploymentPresentationPort;
  readonly publication: DeploymentPublicationReceiptPort;
  readonly state: DeploymentStateStoreFactoryPort;
  readonly labels: IssueLabelsPort;
  readonly issues: IssueClosurePort;
  readonly operationId: () => string;
}
