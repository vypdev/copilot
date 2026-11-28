import type { SetupPublisherInspection, SetupPublisherOperation, SetupPublisherPlan, SetupPublisherProposal } from '../../domain/setup_publisher_installation';
import type { SetupPublisherInventoryFailure, SetupPublisherInventoryLocator } from '../../domain/setup_publisher_inventory_review';

/** Display coordinates and retained-state context only; no approved bytes or authority. */
export interface SetupPublisherBlockedReview {
  readonly reason: SetupPublisherInventoryFailure;
  readonly operationId: string;
  readonly repository: string;
  readonly evidence: SetupPublisherInventoryLocator;
}

/** The adapter pairs these facts with its private credential generation. */
export interface SetupPublisherReadSnapshot {
  readonly inspection: SetupPublisherInspection;
  readonly session: object;
}
export interface SetupPublisherReviewPorts {
  inspect(proposal: SetupPublisherProposal): Promise<SetupPublisherReadSnapshot>;
  present(plan: SetupPublisherPlan, retained?: SetupPublisherOperation): Promise<void>;
  confirm(plan: SetupPublisherPlan): Promise<'approve' | 'decline' | 'cancel'>;
  active(): boolean;
}

/** Composition resolves the same private session; no credential enters the plan. */
export type SetupPublisherApprovedAction<T> = (plan: SetupPublisherPlan, session: object,
  revalidate: () => Promise<boolean>) => Promise<T>;
