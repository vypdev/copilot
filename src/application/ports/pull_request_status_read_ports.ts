import type { ApprovalObservationTarget, PullRequestApprovalPort } from './pull_request_approval_ports';
import type { ReadinessRevision } from '../policies/pull_request_readiness_policy';
export type LinkedStatusPullRequests = { readonly state: 'available'; readonly repositoryId: number; readonly issueNumber: number;
    readonly numbers: readonly number[] } | { readonly state: 'unavailable' };
export interface PullRequestStatusQueryPorts {
    readonly serverOrigin: string;
    readLinkedPullRequests(issueNumber: number): Promise<LinkedStatusPullRequests>;
    readonly approval: Pick<PullRequestApprovalPort, 'readPolicy' | 'loadEvidence'> & {
        readRevision(target: ApprovalObservationTarget): Promise<ReadinessRevision>;
    };
}
