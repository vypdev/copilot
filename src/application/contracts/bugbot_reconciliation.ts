import type { BugbotIssueComment } from '../ports/bugbot_issue_read_ports';
import type { BugbotReviewNavigation } from '../ports/bugbot_review_navigation_ports';
import type {
  PullRequestReviewComment,
  PullRequestReviewSummary,
  PullRequestReviewThreadState,
} from '../ports/pull_request_review_comment_ports';
import type {
  BugbotProjectedFinding,
  BugbotReviewProjection,
} from '../../domain/bugbot/review_projection';
import type { BugbotContextCoverage } from '../../domain/bugbot/context';

/** Narrow runtime facts required to reconcile one analyzed pull-request head. */
export interface BugbotReconciliationTarget {
  readonly pullRequestNumber: number;
  readonly linkedIssueNumber?: number;
  readonly analyzedHeadSha: string;
  readonly trustedAuthorLogin?: string;
  readonly locale: string;
}

export type BugbotSnapshotSurfaceState =
  | 'verified'
  | 'failed'
  | 'not-applicable';

/**
 * Completeness is explicit per independently readable surface. Empty verified
 * collections and failed reads must never be confused during reconciliation.
 */
export interface BugbotSnapshotCompleteness {
  readonly linkedIssueComments: BugbotSnapshotSurfaceState;
  readonly pullRequestComments: BugbotSnapshotSurfaceState;
  readonly reviewThreads: BugbotSnapshotSurfaceState;
  readonly reviews: BugbotSnapshotSurfaceState;
  readonly conversation: BugbotSnapshotSurfaceState;
  readonly navigation: BugbotSnapshotSurfaceState;
}

export interface BugbotReconciliationSnapshot {
  readonly verifiedHeadSha: string;
  readonly linkedIssueComments: readonly BugbotIssueComment[];
  readonly pullRequestComments: readonly PullRequestReviewComment[];
  readonly reviewThreads: Readonly<Record<string, PullRequestReviewThreadState>>;
  readonly reviews: readonly PullRequestReviewSummary[];
  readonly conversationComments: readonly BugbotIssueComment[];
  readonly navigation?: BugbotReviewNavigation;
  readonly completeness: BugbotSnapshotCompleteness;
}

export type BugbotReconciliationSnapshotResult =
  | {
      readonly kind: 'current';
      readonly snapshot: BugbotReconciliationSnapshot;
    }
  | {
      readonly kind: 'superseded';
      readonly verifiedHeadSha: string;
    };

export interface BugbotReconciliationPlan {
  readonly findings: readonly BugbotProjectedFinding[];
  readonly diagnostics: readonly string[];
  readonly coverage: BugbotContextCoverage;
}

export interface BugbotPresentationReport {
  readonly projection: BugbotReviewProjection;
  readonly reviewUpdates: number;
  readonly pendingReviewUpdates: number;
  readonly statusCardOperation: 'created' | 'updated' | 'unchanged' | 'failed';
  readonly errors: readonly Error[];
}
