import type { IssueWorkflowKind } from '../../domain/issue_workflow_profile';
import type { BoundActorAuthorizationPort } from './actor_authorization_ports';
import type { BoundBugbotContextReadPorts } from './bugbot_context_ports';
import type { BoundIssueDescriptionQueryPort } from './issue_description_ports';
import type { BoundIssueLabelsPort } from './issue_management_ports';
import type { BoundIssueTitlePort } from './issue_title_ports';
import type { BoundLinkedBranchReadinessPort } from './linked_branch_readiness_ports';
import type { PreBranchSddWorkspacePort, SddCatalogSnapshot } from './pre_branch_sdd_ports';

export interface SddEvidenceQueryContext {
    readonly issueNumber: number;
    readonly admittedKind?: IssueWorkflowKind;
    readonly profileDigest?: string;
    readonly issueAuthor: string;
    readonly trustedBotLogin: string;
    readonly issueManagedBranches?: boolean;
    readonly preBranchSdd?: boolean;
    readonly baseBranch?: string;
}

export interface SddEvidenceReadPorts {
    readonly comments: Pick<BoundBugbotContextReadPorts, 'listIssueComments'>;
    readonly descriptions: BoundIssueDescriptionQueryPort;
    readonly titles: Pick<BoundIssueTitlePort, 'getTitle'>;
    readonly labels: Pick<BoundIssueLabelsPort, 'getLabels'>;
    readonly actors: Pick<BoundActorAuthorizationPort, 'isActorAllowedToModifyFiles'>;
    readonly branches: BoundLinkedBranchReadinessPort;
    readonly workspace: Pick<PreBranchSddWorkspacePort, 'loadSnapshot' | 'verifyPublication' | 'isAncestor'> & {
        loadSnapshotAtCommit(commitSha: string): Promise<SddCatalogSnapshot>;
    };
}

/** Retains only read operations, even when composition receives a broader adapter. */
export function bindSddEvidenceReadPorts(ports: SddEvidenceReadPorts): SddEvidenceReadPorts {
    return Object.freeze({
        comments: Object.freeze({ listIssueComments: ports.comments.listIssueComments.bind(ports.comments) }),
        descriptions: Object.freeze({ getDescription: ports.descriptions.getDescription.bind(ports.descriptions) }),
        titles: Object.freeze({ getTitle: ports.titles.getTitle.bind(ports.titles) }),
        labels: Object.freeze({ getLabels: ports.labels.getLabels.bind(ports.labels) }),
        actors: Object.freeze({ isActorAllowedToModifyFiles: ports.actors.isActorAllowedToModifyFiles.bind(ports.actors) }),
        branches: Object.freeze({ getLinkedBranch: ports.branches.getLinkedBranch.bind(ports.branches) }),
        workspace: Object.freeze({
            loadSnapshot: ports.workspace.loadSnapshot.bind(ports.workspace),
            loadSnapshotAtCommit: ports.workspace.loadSnapshotAtCommit.bind(ports.workspace),
            verifyPublication: ports.workspace.verifyPublication.bind(ports.workspace),
            isAncestor: ports.workspace.isAncestor.bind(ports.workspace),
        }),
    });
}

export interface VerifiedSddEvidence {
    readonly path: string;
    readonly capabilityId: string;
    readonly branchName: string;
    readonly branchHeadSha: string;
    readonly firstSha: string;
    readonly currentSha?: string;
}

export interface SddEvidenceSnapshot {
    /** Opaque hash of the exact fenced card and live issue authority, never their contents. */
    readonly authorityDigest?: string;
    readonly state: 'not-required' | 'absent' | 'unavailable' | 'invalid' | 'stale' | 'awaiting-answers' | 'publication-pending' | 'published';
    readonly path?: string;
    readonly pendingQuestionIds?: readonly string[];
    readonly cardId?: number;
    readonly verified?: VerifiedSddEvidence;
}


/** Application query capability supplied by composition; it cannot expose raw adapters. */
export interface SddEvidenceQueryPort {
    /** Trusted workflow server origin; never inferred from issue or comment content. */
    readonly serverOrigin?: string;
    read(context: SddEvidenceQueryContext): Promise<SddEvidenceSnapshot>;
}
