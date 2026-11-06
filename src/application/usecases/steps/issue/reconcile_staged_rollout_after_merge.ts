import { Result } from '../../../../data/model/result';
import type { StatusPublicationIntent } from '../../../../domain/github_publication';
import type { NativeIssueCompletionFacts } from '../../../../domain/issue_completion';
import { decideStagedRollout, type StagedRolloutHoldReason } from '../../../../domain/staged_rollout';
import { ApplicationError } from '../../../errors/application_error';
import { createSemanticDigest } from '../../../policies/publication_identity_policy';
import {
    hasActiveStagedRolloutCard, renderStagedRolloutCard, STAGED_ROLLOUT_RESULT, type StagedRolloutCardProjection,
} from '../../../policies/staged_rollout_presentation_policy';
import type { BoundIssueCommentPublicationPort } from '../../../ports/issue_lifecycle_ports';
import type { StagedRolloutReviewPort } from '../../../ports/staged_rollout_ports';
import type { CloseIssueAfterMergeContext } from '../../issue_workflow_context';
import { reconcileStatusCard, type StatusCardPublicationContext } from '../common/status_card_publication_workflow';
import { githubUsersMatch } from '../../../../domain/github_user_policy';

export interface StagedRolloutPorts {
    readonly publicationTarget: Pick<StatusCardPublicationContext, 'owner' | 'repository'> & {
        readonly repositoryUrl: string;
    };
    readonly reviews: StagedRolloutReviewPort;
    readonly comments: BoundIssueCommentPublicationPort;
}

type RolloutStatus =
    | { readonly state: 'held'; readonly reason: StagedRolloutHoldReason }
    | { readonly state: 'registration-failed'; readonly headSha: string }
    | { readonly state: 'pending'; readonly headSha?: string; readonly commentId?: number };

export async function reconcileStagedRolloutAfterMerge(
    request: CloseIssueAfterMergeContext,
    ports: StagedRolloutPorts,
    read: () => Promise<NativeIssueCompletionFacts>,
    removeLabel: (label: string) => Promise<void>,
): Promise<Result | undefined> {
    const { issueNumber, pullRequestNumber: pullNumber, stagedRollout: scope } = request;
    const botLogin = scope?.botLogin ?? '';
    const result = (status: RolloutStatus, executed = false) => {
        const evidenceUnavailable = status.state === 'held' && status.reason === 'evidence-unavailable';
        const success = status.state !== 'registration-failed' && !evidenceUnavailable;
        const steps = evidenceUnavailable
            ? ['Rollout evidence could not be verified. Restore access and re-run failed jobs for this workflow run.']
            : status.state === 'held'
                ? ['Staged rollout declaration was held. Review operational acceptance on the original issue.']
                : status.state === 'registration-failed'
                    ? ['Rollout registration could not be verified. Re-run failed jobs for this workflow run.']
                    : ['Preparatory PR merged. Operational acceptance remains on the open issue.'];
        return new Result({
            id: STAGED_ROLLOUT_RESULT, success, executed, steps,
            ...(!success ? { errors: [new ApplicationError('workflow.failed', steps[0])] } : {}),
            payload: { issueNumber, pullNumber, ...status },
        });
    };

    let decision: ReturnType<typeof decideStagedRollout>;
    try {
        const evidence = await ports.reviews.readMergedPullRequest(pullNumber);
        decision = decideStagedRollout(evidence, scope, issueNumber);
        if (decision.kind === 'ordinary') {
            const inventory = botLogin && await ports.comments.listIssueComments(issueNumber);
            if (inventory && hasActiveStagedRolloutCard(inventory, issueNumber, botLogin)) {
                return result({ state: 'pending' });
            }
            return undefined;
        }
        if (decision.kind === 'held') return result({ state: 'held', reason: decision.reason });
        if (!await ports.reviews.isMaintainer(decision.author)) return result({ state: 'held', reason: 'unauthorized' });
    } catch {
        return result({ state: 'held', reason: 'evidence-unavailable' });
    }

    const { headSha, reviewId } = decision;
    const locale = scope?.locale ?? 'en-US';
    const projection: StagedRolloutCardProjection = {
        kind: 'staged-rollout', pullNumber,
        repositoryUrl: ports.publicationTarget.repositoryUrl,
        headSha, reviewId,
    };
    const intent: StatusPublicationIntent<StagedRolloutCardProjection> = {
        kind: 'status', locale, projection, digest: createSemanticDigest({ locale, projection }),
        identity: { topic: 'staged-rollout', target: { kind: 'issue', number: issueNumber }, key: `pr:${pullNumber}` },
        sourceVersion: `head:${headSha}:review:${reviewId}`,
    };
    const isOpen = (facts: NativeIssueCompletionFacts) =>
        facts.state === 'open' && facts.reason !== 'reopened' && facts.deploymentCompletion !== 'pending';
    let executed = false;
    try {
        const publication = await reconcileStatusCard({ ...ports.publicationTarget, botLogin, intent }, ports.comments, undefined,
            async () => isOpen(await read()));
        executed = publication.effect !== 'unchanged' || publication.duplicatesRemoved > 0 || publication.duplicatesCompacted > 0;
        const commentId = publication.canonicalCommentId;
        const rendered = renderStagedRolloutCard(intent);
        if (publication.reason || !commentId || !(await ports.comments.listIssueComments(issueNumber)).some(comment =>
            comment.id === commentId && githubUsersMatch(comment.user?.login ?? '', botLogin) && comment.body === rendered)) {
            return result({ state: 'registration-failed', headSha }, executed);
        }
        const current = await read();
        if (!isOpen(current)) return result({ state: 'registration-failed', headSha }, executed);
        if (current.labels.includes('100%')) {
            await removeLabel('100%');
            executed = true;
        }
        return result({ state: 'pending', headSha, commentId }, executed);
    } catch {
        return result({ state: 'registration-failed', headSha }, executed);
    }
}
