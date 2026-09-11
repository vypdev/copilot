import type {
  BugbotReconciliationCredential,
  BugbotReconciliationSnapshot,
  BugbotReconciliationSnapshotResult,
  BugbotReconciliationTarget,
  BugbotSnapshotSurfaceState,
} from '../../../../contracts/bugbot_reconciliation';
import type { BugbotIssueReadPort } from '../../../../ports/bugbot_issue_read_ports';
import type { BugbotPullRequestReadPort } from '../../../../ports/bugbot_pull_request_read_ports';
import type { BugbotReviewNavigationPort } from '../../../../ports/bugbot_review_navigation_ports';
import type { PullRequestReviewSummaryQueryPort } from '../../../../ports/pull_request_review_comment_ports';
import { PullRequestReviewOperationError } from '../../../../ports/pull_request_review_errors';

export interface BugbotReconciliationSnapshotPorts {
  readonly issueComments: BugbotIssueReadPort;
  readonly pullRequest: Pick<
    BugbotPullRequestReadPort,
    | 'getPullRequestHeadSha'
    | 'listPullRequestReviewComments'
    | 'listPullRequestReviewThreadStates'
  >;
  readonly reviews: PullRequestReviewSummaryQueryPort;
  readonly navigation: BugbotReviewNavigationPort;
}

/**
 * Acquires one coherent final snapshot around two head guards. Surface reads
 * run concurrently, while the second guard rejects data collected across a
 * pull-request revision change.
 */
export async function loadBugbotReconciliationSnapshot(
  target: BugbotReconciliationTarget,
  credential: BugbotReconciliationCredential,
  ports: BugbotReconciliationSnapshotPorts,
): Promise<BugbotReconciliationSnapshotResult> {
  const initialHeadSha = await readHead(target, credential, ports);
  if (!initialHeadSha || initialHeadSha !== target.analyzedHeadSha) {
    return superseded(target, initialHeadSha);
  }

  const conversationPromise = ports.issueComments.listIssueComments(
    target.owner,
    target.repository,
    target.pullRequestNumber,
    credential.token,
  );
  const linkedIssueNumber = target.linkedIssueNumber;
  const linkedIssueSharesConversation = linkedIssueNumber !== undefined
    && linkedIssueNumber === target.pullRequestNumber;
  const linkedIssuePromise = linkedIssueNumber === undefined
    ? Promise.resolve([])
    : linkedIssueSharesConversation
      ? conversationPromise
      : ports.issueComments.listIssueComments(
          target.owner,
          target.repository,
          linkedIssueNumber,
          credential.token,
        );

  const [commentsRead, threadsRead, reviewsRead, conversationRead, linkedIssueRead] =
    await Promise.allSettled([
      ports.pullRequest.listPullRequestReviewComments(
        target.owner,
        target.repository,
        target.pullRequestNumber,
        credential.token,
      ),
      ports.pullRequest.listPullRequestReviewThreadStates(
        target.owner,
        target.repository,
        target.pullRequestNumber,
        credential.token,
      ),
      ports.reviews.listPullRequestReviews(
        target.owner,
        target.repository,
        target.pullRequestNumber,
        credential.token,
      ),
      conversationPromise,
      linkedIssuePromise,
    ]);

  const finalHeadSha = await readHead(target, credential, ports);
  if (!finalHeadSha || finalHeadSha !== target.analyzedHeadSha) {
    return superseded(target, finalHeadSha);
  }

  let navigation: BugbotReconciliationSnapshot['navigation'];
  let navigationState: BugbotSnapshotSurfaceState = 'verified';
  try {
    navigation = ports.navigation.forPullRequest(
      target.owner,
      target.repository,
      target.pullRequestNumber,
      finalHeadSha,
    );
  } catch {
    navigationState = 'failed';
  }

  const conversationComments = valueOr(conversationRead, []);
  return {
    kind: 'current',
    snapshot: {
      verifiedHeadSha: finalHeadSha,
      pullRequestComments: valueOr(commentsRead, []),
      reviewThreads: valueOr(threadsRead, {}),
      reviews: valueOr(reviewsRead, []),
      conversationComments,
      linkedIssueComments: linkedIssueSharesConversation
        ? conversationComments
        : valueOr(linkedIssueRead, []),
      ...(navigation ? { navigation } : {}),
      completeness: {
        pullRequestComments: stateOf(commentsRead),
        reviewThreads: stateOf(threadsRead),
        reviews: stateOf(reviewsRead),
        conversation: stateOf(conversationRead),
        navigation: navigationState,
        linkedIssueComments: linkedIssueNumber === undefined
          ? 'not-applicable'
          : linkedIssueSharesConversation
            ? stateOf(conversationRead)
            : stateOf(linkedIssueRead),
      },
    },
  };
}

async function readHead(
  target: BugbotReconciliationTarget,
  credential: BugbotReconciliationCredential,
  ports: BugbotReconciliationSnapshotPorts,
): Promise<string | undefined> {
  try {
    return await ports.pullRequest.getPullRequestHeadSha(
      target.owner,
      target.repository,
      target.pullRequestNumber,
      credential.token,
    );
  } catch {
    throw new PullRequestReviewOperationError('get-head-sha');
  }
}

function superseded(
  target: BugbotReconciliationTarget,
  verifiedHeadSha: string | undefined,
): BugbotReconciliationSnapshotResult {
  return {
    kind: 'superseded',
    verifiedHeadSha: verifiedHeadSha ?? target.analyzedHeadSha,
  };
}

function valueOr<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

function stateOf(result: PromiseSettledResult<unknown>): BugbotSnapshotSurfaceState {
  return result.status === 'fulfilled' ? 'verified' : 'failed';
}
