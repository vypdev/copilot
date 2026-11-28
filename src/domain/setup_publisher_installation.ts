export const SETUP_PUBLISHER_WORKFLOW_PATH = '.github/workflows/copilot_bugbot_status_card.yml';
export const SETUP_PUBLISHER_PURPOSE = 'bugbot-status-publisher';
export const SETUP_PUBLISHER_PROPOSAL_MAX_BYTES = 128 * 1024;
import type { SetupPublisherInventoryLocator, SetupPublisherInventoryReviewFact } from './setup_publisher_inventory_review';

/** Untrusted review input. No observation in this document grants Apply authority. */
interface SetupPublisherProposalFields {
  readonly kind: 'review-only-publisher-installation-proposal';
  readonly destination: { readonly repository: string; readonly repositoryId: number;
    readonly defaultBranch: string; readonly head: string };
  readonly path: typeof SETUP_PUBLISHER_WORKFLOW_PATH;
  readonly baseline: string;
  readonly source: { readonly repository: 'vypdev/copilot'; readonly commit: string;
    readonly pullRequest: number; readonly merged: boolean; readonly maintainerApproval: string;
    readonly workflowSha256: string; readonly actionManifestSha256: string; readonly actionBundleSha256: string };
  readonly proposedWorkflowSha256: string;
  readonly sourceChange: string;
  readonly consumerTemplatesChanged: false;
  readonly productionVerification: 'disabled';
  readonly installationAuthorized: false;
  readonly installedDestinationSha: null;
  readonly nativeCanary: { readonly status: 'not-run'; readonly explicitlyAuthorizedPullRequest: null; readonly runId: null };
  readonly dependency: 976;
  readonly coordination: 814;
}
export type SetupPublisherProposal = SetupPublisherProposalFields & (
  | { readonly schemaVersion: 1; readonly inventoryReview?: never }
  | { readonly schemaVersion: 2; readonly inventoryReview: SetupPublisherInventoryLocator }
);

export type SetupPublisherFileEffect = 'tree' | 'commit' | 'branch' | 'pull-request';
/** Private metadata only; one target and no resource configuration, tokens or file bytes. */
export interface SetupPublisherOperation {
  readonly schemaVersion: 2;
  readonly purpose: typeof SETUP_PUBLISHER_PURPOSE;
  readonly operationId: string;
  readonly repositoryId: number;
  readonly repository: string;
  readonly defaultBranch: string;
  readonly baseSha: string;
  readonly sourceCommit: string;
  readonly planDigest: string;
  readonly approvalDigest: string;
  readonly actorId: number;
  readonly status: 'ready' | 'applying' | 'blocked' | 'partial' | 'waiting-for-merge' | 'verification-pending' | 'unchanged' | 'cancelled';
  readonly effects: readonly SetupPublisherFileEffect[];
  readonly preparedTree?: string;
  readonly preparedCommit?: string;
  readonly pullRequestNumber?: number;
  readonly uncertain?: SetupPublisherFileEffect;
}
import type { SetupBatchFile, SetupBatchTarget } from './setup_batch';


export interface SetupPublisherObservedFile {
  readonly path: string;
  readonly content: string;
  readonly mode: string;
}

/** Semantic facts from authenticated, complete reads; never proposal declarations. */
export interface SetupPublisherInspection {
  readonly target: SetupBatchTarget;
  readonly authority: {
    readonly actorId: number;
    readonly repositoryId: number;
    readonly contents: 'write' | 'denied' | 'unknown';
    readonly pullRequests: 'write' | 'denied' | 'unknown';
    readonly workflows: 'write' | 'denied' | 'unknown';
  };
  readonly source: {
    readonly repository: string;
    readonly repositoryId: number;
    readonly commit: string;
    readonly pullRequest: number;
    /** Selected revision independently established as reviewed and merged. */
    readonly reviewedRevision: string | null;
    readonly mergedRevision: string | null;
    readonly workflow: string;
    readonly actionManifestSha256: string;
    readonly actionBundleSha256: string;
  };
  readonly installation: {
    readonly complete: boolean;
    readonly manifest: SetupPublisherObservedFile | null;
    readonly guidance: readonly SetupPublisherObservedFile[];
    readonly workflows: readonly SetupPublisherObservedFile[];
    /** Classification of the complete relevant workflow inventory by the reader. */
    readonly publisher: { readonly kind: 'absent' | 'exact' | 'foreign' | 'unknown'; readonly paths: readonly string[] };
    readonly inventoryReview?: SetupPublisherInventoryReviewFact;
  };
}

/** Read-only review data, not an approval capability or a verified-native receipt. */
export interface SetupPublisherPlan {
  readonly purpose: typeof SETUP_PUBLISHER_PURPOSE;
  readonly operationId: string;
  readonly target: SetupBatchTarget;
  readonly actorId: number;
  readonly sourceCommit: string;
  readonly status: 'review' | 'unchanged';
  readonly digest: string;
  readonly approvalDigest: string | null;
  readonly files: readonly SetupBatchFile[];
  readonly nativeVerification: 'pending';
  readonly inventoryReview?: SetupPublisherInventoryReviewFact;
}
