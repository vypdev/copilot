import type { BugbotFramedReviewSource } from '../../domain/bugbot/framed_review';
import type { BugbotPullRequestIdentity } from '../../domain/bugbot/context';
import { canonicalGitObjectId } from '../../domain/git_object_id';

function completeIdentity(pr: BugbotPullRequestIdentity): boolean {
    return Boolean(pr && pr.baseRepository && pr.state === 'open'
        && Number.isSafeInteger(pr.number) && pr.number > 0 && typeof pr.draft === 'boolean'
        && [pr.baseRepository.owner, pr.baseRepository.name, pr.headRepositoryOwner, pr.headRepositoryName,
            pr.baseRef, pr.headRef].every(value => typeof value === 'string' && value.length > 0)
        && [pr.baseSha, pr.headSha].every(value => typeof value === 'string' && canonicalGitObjectId(value) === value)
        && Number.isSafeInteger(pr.changedFileCount) && pr.changedFileCount! >= 0
        && (pr.baseRefSha === undefined || (typeof pr.baseRefSha === 'string' && canonicalGitObjectId(pr.baseRefSha) === pr.baseRefSha)));
}

/** Absence is never freshness. Only the initial provider read may precede live-ref acquisition. */
export function sameBugbotFramedPullRequest(expected: BugbotPullRequestIdentity, current: BugbotPullRequestIdentity): boolean {
    if (!completeIdentity(expected) || !completeIdentity(current)) return false;
    return expected.number === current.number && expected.draft === current.draft
        && expected.baseRepository.owner === current.baseRepository.owner
        && expected.baseRepository.name === current.baseRepository.name
        && expected.baseRepository.id === current.baseRepository.id
        && expected.baseSha === current.baseSha && expected.baseRef === current.baseRef
        && (expected.baseRefSha === undefined || expected.baseRefSha === current.baseRefSha)
        && expected.headRepositoryOwner === current.headRepositoryOwner
        && expected.headRepositoryName === current.headRepositoryName
        && expected.headRef === current.headRef && expected.headSha === current.headSha
        && expected.changedFileCount === current.changedFileCount;
}

export function bugbotFramedSourceMatchesPullRequest(source: BugbotFramedReviewSource, pr: BugbotPullRequestIdentity): boolean {
    const id = source?.identity;
    return Boolean(id && completeIdentity(pr) && typeof pr.baseRefSha === 'string' && Array.isArray(source.changes)
        && id.owner === pr.baseRepository.owner && id.repository === pr.baseRepository.name
        && id.repositoryId === pr.baseRepository.id && id.pullRequestNumber === pr.number
        && id.baseSha === pr.baseRefSha && id.baseRef === pr.baseRef
        && id.headOwner === pr.headRepositoryOwner && id.headRepository === pr.headRepositoryName
        && id.headRef === pr.headRef && id.headSha === pr.headSha
        && source.changes.length === pr.changedFileCount);
}
