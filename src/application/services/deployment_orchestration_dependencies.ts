import type { BoundDeploymentCandidateInspectionPort } from '../ports/deployment_candidate_inspection_ports';
import type {
  BoundDeploymentContinuationPort,
  BoundDeploymentGitPort,
  BoundDeploymentPresentationPort,
  BoundDeploymentPublicationReceiptPort,
  BoundDeploymentStateStoreFactoryPort,
  BoundManagedPullRequestPort,
  BoundTargetMergePolicyInspectionPort,
  DeploymentIssueCompletionRequest,
} from "../ports/deployment_orchestration_ports";
import type { BoundIssueClosurePort } from "../ports/issue_lifecycle_ports";
import type { BoundIssueLabelsPort } from "../ports/issue_management_ports";
import type { MessageCatalogResolutionPort } from '../ports/message_catalog_ports';
import type { Result } from '../../data/model/result';

export interface DeploymentOrchestrationDependencies {
  readonly pullRequests: BoundManagedPullRequestPort;
  readonly targetRules: BoundTargetMergePolicyInspectionPort;
  readonly git: BoundDeploymentGitPort;
  readonly continuation: BoundDeploymentContinuationPort;
  readonly presentation: BoundDeploymentPresentationPort;
  readonly publication: BoundDeploymentPublicationReceiptPort;
  readonly state: BoundDeploymentStateStoreFactoryPort;
  readonly labels: BoundIssueLabelsPort;
  readonly issues: BoundIssueClosurePort & { reconcileCompletion(request: DeploymentIssueCompletionRequest): Promise<Result[]> };
  readonly replacementInspection?: BoundDeploymentCandidateInspectionPort;
  readonly operationId: () => string;
  readonly catalogResolver?: MessageCatalogResolutionPort;
}
