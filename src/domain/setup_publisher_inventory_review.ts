/** Fixed external review input; never an installer output or an approval capability. */
export const SETUP_PUBLISHER_INVENTORY_PATH = '.copilot/bugbot-publisher-inventory-review.json';
export const SETUP_PUBLISHER_INVENTORY_LIMITS = Object.freeze({
  bytes: 1_048_576, workflows: 128, units: 2048, edges: 8192, inputs: 1024, depth: 16, explanationBytes: 2048,
});

export interface SetupPublisherInventoryLocator {
  readonly pullRequest: number;
  readonly head: string;
  readonly documentSha256: string;
}

export type SetupPublisherProducerDisposition = 'non-producer' | 'serialized-producer' | 'incompatible' | 'unresolved';
export type SetupPublisherInventoryUnitKind = 'workflow' | 'action' | 'reusable-workflow' | 'composite-action'
  | 'node-entrypoint' | 'shell-program' | 'data-file';
export type SetupPublisherInventoryInputOrigin = 'literal' | 'default' | 'workflow-env' | 'job-env' | 'step-env'
  | 'repository-variable' | 'organization-variable' | 'input-vars-json' | 'symbolic-secret';

export interface SetupPublisherInventoryFile {
  readonly path: string;
  readonly mode: '100644' | '100755';
  readonly blob: string;
  readonly contentSha256: string;
}

export interface SetupPublisherInventoryWorkflow extends SetupPublisherInventoryFile {
  readonly entryUnits: readonly string[];
  readonly disposition: SetupPublisherProducerDisposition;
}

export interface SetupPublisherInventoryUnit extends SetupPublisherInventoryFile {
  readonly id: string;
  readonly kind: SetupPublisherInventoryUnitKind;
  readonly repositoryId: number;
  readonly repository: string;
  readonly commit: string;
  readonly tree: string;
  /** Human-reviewed meaning of these exact bytes, not an executable directive. */
  readonly behavior: string;
}

export interface SetupPublisherInventoryEdge {
  readonly from: string;
  readonly to: string;
  /** Source-bound role, including the job/step anchor for inline programs. */
  readonly role: string;
}

export interface SetupPublisherInventoryInput {
  readonly id: string;
  readonly workflow: string;
  readonly job: string;
  /** Zero denotes workflow/job scope; executed steps use one-based positions. */
  readonly step: number;
  readonly input: string;
  readonly origin: SetupPublisherInventoryInputOrigin;
  readonly sourceFingerprint: string;
}

export interface SetupPublisherInventoryDocument {
  readonly schemaVersion: 1;
  readonly kind: 'bugbot-publisher-producer-inventory-review';
  readonly destination: { readonly repositoryId: number; readonly repository: string; readonly defaultBranch: string;
    readonly head: string; readonly tree: string };
  readonly publisher: { readonly repositoryId: number; readonly commit: string; readonly workflowSha256: string;
    readonly actionManifestSha256: string; readonly actionBundleSha256: string; readonly contractSha256: string };
  readonly workflowSetSha256: string;
  readonly workflows: readonly SetupPublisherInventoryWorkflow[];
  readonly units: readonly SetupPublisherInventoryUnit[];
  readonly edges: readonly SetupPublisherInventoryEdge[];
  readonly inputs: readonly SetupPublisherInventoryInput[];
}

/** Adapter-normalized authenticated facts; proposal/document fields cannot provide them. */
export interface SetupPublisherInventoryReviewRecord {
  readonly id: number;
  readonly actorId: number;
  readonly actorLogin: string;
  readonly actorType: 'User' | 'Bot';
  readonly state: 'PENDING' | 'COMMENTED' | 'APPROVED' | 'CHANGES_REQUESTED' | 'DISMISSED';
  readonly submittedAt: string | null;
  readonly commit: string | null;
  readonly body: string;
}

export interface SetupPublisherInventoryReviewer {
  readonly id: number;
  readonly login: string;
  readonly permission: 'admin' | 'write' | 'read' | 'none' | 'unavailable';
}

export interface SetupPublisherInventoryReviewAuthority {
  readonly authorId: number;
  readonly preparingActorIds: readonly number[];
  readonly reviews: readonly SetupPublisherInventoryReviewRecord[];
  readonly reviewers: readonly SetupPublisherInventoryReviewer[];
  readonly complete: boolean;
}

/** Stable verified identity for approval/freshness; contains no source or credential values. */
export interface SetupPublisherInventoryReviewFact {
  readonly pullRequest: number;
  readonly head: string;
  readonly base: string;
  readonly documentSha256: string;
  readonly workflowSetSha256: string;
  readonly closureSha256: string;
  readonly contractSha256: string;
  readonly decisionsSha256: string;
  readonly approvals: readonly { readonly reviewId: number; readonly actorId: number; readonly actorLogin: string }[];
  readonly workflows: readonly { readonly path: string; readonly disposition: SetupPublisherProducerDisposition }[];
}

export type SetupPublisherInventoryFailure = 'invalid-document' | 'binding-mismatch' | 'review-unavailable'
  | 'review-required' | 'changes-requested' | 'incompatible-producer' | 'unresolved-closure';
export class SetupPublisherInventoryError extends Error {
  constructor(readonly reason: SetupPublisherInventoryFailure) {
    super(`Publisher inventory review is blocked: ${reason}. No inventory or installation authority was inferred.`);
  }
}
