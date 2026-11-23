import type { SetupPublisherInspection, SetupPublisherOperation, SetupPublisherPlan, SetupPublisherProposal } from '../../domain/setup_publisher_installation';

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
