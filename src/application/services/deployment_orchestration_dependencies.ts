import type {
  BoundDeploymentContinuationPort,
  BoundDeploymentGitPort,
  BoundDeploymentPresentationPort,
  BoundDeploymentPublicationReceiptPort,
  BoundDeploymentStateStoreFactoryPort,
  BoundManagedPullRequestPort,
  BoundTargetMergePolicyInspectionPort,
} from "../ports/deployment_orchestration_ports";
import type { BoundIssueClosurePort } from "../ports/issue_lifecycle_ports";
import type { BoundIssueLabelsPort } from "../ports/issue_management_ports";

export interface DeploymentOrchestrationDependencies {
  readonly pullRequests: BoundManagedPullRequestPort;
  readonly targetRules: BoundTargetMergePolicyInspectionPort;
  readonly git: BoundDeploymentGitPort;
  readonly continuation: BoundDeploymentContinuationPort;
  readonly presentation: BoundDeploymentPresentationPort;
  readonly publication: BoundDeploymentPublicationReceiptPort;
  readonly state: BoundDeploymentStateStoreFactoryPort;
  readonly labels: BoundIssueLabelsPort;
  readonly issues: BoundIssueClosurePort;
  readonly operationId: () => string;
}
