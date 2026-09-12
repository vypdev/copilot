import type {
  BugbotReconciliationSnapshot,
  BugbotReconciliationSnapshotResult,
  BugbotReconciliationTarget,
  BugbotSnapshotSurfaceState,
} from '../../../../contracts/bugbot_reconciliation';
import { PullRequestReviewOperationError } from '../../../../ports/pull_request_review_errors';
import type { BugbotReconciliationSnapshotPorts } from '../../../../ports/bugbot_reconciliation_ports';

export type { BugbotReconciliationSnapshotPorts } from '../../../../ports/bugbot_reconciliation_ports';

/**
 * Acquires one coherent final snapshot around two head guards. Surface reads
 * run concurrently, while the second guard rejects data collected across a
 * pull-request revision change.
 */
export async function loadBugbotReconciliationSnapshot(
  target: BugbotReconciliationTarget,
  ports: BugbotReconciliationSnapshotPorts,
): Promise<BugbotReconciliationSnapshotResult> {
  const initialHeadSha = await readHead(target, ports);
  if (!initialHeadSha || initialHeadSha !== target.analyzedHeadSha) {
    return superseded(target, initialHeadSha);
  }

  const conversationPromise = ports.listIssueComments(
    target.pullRequestNumber,
  );
  const linkedIssueNumber = target.linkedIssueNumber;
  const linkedIssueSharesConversation = linkedIssueNumber !== undefined
    && linkedIssueNumber === target.pullRequestNumber;
  const linkedIssuePromise = linkedIssueNumber === undefined
    ? Promise.resolve([])
    : linkedIssueSharesConversation
      ? conversationPromise
      : ports.listIssueComments(
          linkedIssueNumber,
        );

  const [commentsRead, threadsRead, reviewsRead, conversationRead, linkedIssueRead] =
    await Promise.allSettled([
      ports.listPullRequestReviewComments(
        target.pullRequestNumber,
      ),
      ports.listPullRequestReviewThreadStates(
        target.pullRequestNumber,
      ),
      ports.listPullRequestReviews(
        target.pullRequestNumber,
      ),
      conversationPromise,
      linkedIssuePromise,
    ]);

  const finalHeadSha = await readHead(target, ports);
  if (!finalHeadSha || finalHeadSha !== target.analyzedHeadSha) {
    return superseded(target, finalHeadSha);
  }

  let navigation: BugbotReconciliationSnapshot['navigation'];
  let navigationState: BugbotSnapshotSurfaceState = 'verified';
  try {
    navigation = ports.navigationForPullRequest(
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
  ports: BugbotReconciliationSnapshotPorts,
): Promise<string | undefined> {
  try {
    return await ports.getPullRequestHeadSha(
      target.pullRequestNumber,
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
