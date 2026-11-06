import { canonicalGitObjectId } from './git_object_id';
import { githubUsersMatch } from './github_user_policy';
import { hasClosingKeywordForIssue } from './pull_request_closing_reference';

export interface StagedRolloutMergeScope {
    readonly headSha?: string;
    readonly integrationBranch?: string;
    readonly branchTypes: readonly string[];
    readonly botLogin?: string;
    readonly locale: string;
}

export interface StagedRolloutReview {
    readonly id: string | null;
    readonly body: string;
    readonly state: string;
    readonly submittedAt: string | null;
    readonly lastEditedAt: string | null;
    readonly commitSha: string | null;
    readonly author: { readonly login: string; readonly type: string } | null;
}

export interface StagedRolloutEvidence {
    readonly repository: string;
    readonly headRepository: string | null;
    readonly headBranch: string;
    readonly headSha: string;
    readonly baseBranch: string;
    readonly defaultBranch: string;
    readonly mergedAt: string;
    readonly body: string;
    readonly reviews: readonly StagedRolloutReview[];
}

export const STAGED_ROLLOUT_HOLD_REASONS = [
    'invalid-declaration', 'conflicting-declarations', 'unsupported-scope', 'invalid-review', 'unauthorized', 'evidence-unavailable',
] as const;
export type StagedRolloutHoldReason = typeof STAGED_ROLLOUT_HOLD_REASONS[number];

type StagedRolloutDecision =
    | { readonly kind: 'ordinary' }
    | { readonly kind: 'held'; readonly reason: StagedRolloutHoldReason }
    | { readonly kind: 'candidate'; readonly headSha: string; readonly reviewId: string; readonly author: string; readonly locale: string };

export function isStagedRolloutDeclaration(body: string): boolean {
    return /^Copilot-Stage-Rollout\b/iu.test(body.trimStart());
}

export function decideStagedRollout(
    evidence: StagedRolloutEvidence,
    scope: StagedRolloutMergeScope | undefined,
    issueNumber: number,
): StagedRolloutDecision {
    const declarations = evidence.reviews.filter(candidate => isStagedRolloutDeclaration(candidate.body));
    if (!declarations.length) return { kind: 'ordinary' };
    const headSha = canonicalGitObjectId(evidence.headSha);
    // An older commit can never authorize this merge. Keep declarations whose
    // commit is unknown in the conflict set so incomplete evidence fails closed.
    const candidates = declarations.length === 1 ? declarations : declarations.filter(declaration => {
        const reviewHead = canonicalGitObjectId(declaration.commitSha);
        return !reviewHead || reviewHead === headSha;
    });
    if (candidates.length !== 1) return { kind: 'held', reason: 'conflicting-declarations' };
    const [review] = candidates;
    if (review.body.trim() !== `Copilot-Stage-Rollout: #${issueNumber}`) {
        return { kind: 'held', reason: 'invalid-declaration' };
    }
    if (!scope || evidence.headRepository?.toLowerCase() !== evidence.repository.toLowerCase()
        || evidence.baseBranch === evidence.defaultBranch || evidence.baseBranch !== scope.integrationBranch
        || !scope.branchTypes.some(type => evidence.headBranch.startsWith(`${type}/${issueNumber}-`))
        || hasClosingKeywordForIssue(evidence.body, evidence.repository, issueNumber)) {
        return { kind: 'held', reason: 'unsupported-scope' };
    }
    const mergedAt = Date.parse(evidence.mergedAt);
    const submittedAt = Date.parse(review.submittedAt ?? '');
    if (!headSha || headSha !== canonicalGitObjectId(scope.headSha) || headSha !== canonicalGitObjectId(review.commitSha)
        || !Number.isFinite(mergedAt) || !(submittedAt < mergedAt) || review.lastEditedAt !== null
        || !['COMMENTED', 'APPROVED'].includes(review.state) || !review.id || !/^[1-9]\d{0,19}$/u.test(review.id)) {
        return { kind: 'held', reason: 'invalid-review' };
    }
    if (!scope.botLogin) return { kind: 'held', reason: 'evidence-unavailable' };
    if (review.author?.type !== 'User' || !/^[a-z\d][a-z\d-]{0,38}$/iu.test(review.author.login)
        || githubUsersMatch(review.author.login, scope.botLogin)) {
        return { kind: 'held', reason: 'unauthorized' };
    }
    return { kind: 'candidate', headSha, reviewId: review.id, author: review.author.login, locale: scope.locale };
}
