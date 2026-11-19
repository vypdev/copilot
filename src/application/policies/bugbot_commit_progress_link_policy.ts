import { canonicalGitObjectId } from '../../domain/git_object_id';
import type { BugbotIssueComment } from '../ports/bugbot_issue_read_ports';
import type { BugbotCommitProgressLink } from '../ports/bugbot_review_navigation_ports';
import { isTrustedBugbotAuthor } from './bugbot_review_ownership_policy';
import { parsePublicationMarker } from './publication_identity_policy';

/** Links a complete, owned Commit card from the verified linked issue's conversation. */
export function selectBugbotCommitProgressLink(
    comments: readonly BugbotIssueComment[], issueNumber: number, pullRequestNumber: number,
    pullRequestUrl: string, trustedAuthorLogin: string | undefined,
): BugbotCommitProgressLink | undefined {
    const suffix = `/pull/${pullRequestNumber}`;
    if (!pullRequestUrl.startsWith('https://') || !pullRequestUrl.endsWith(suffix)) return undefined;
    const repositoryUrl = pullRequestUrl.slice(0, -suffix.length);
    const candidates = comments.flatMap(comment => {
        if (!Number.isSafeInteger(comment.id) || comment.id <= 0
            || !isTrustedBugbotAuthor(comment.user?.login, trustedAuthorLogin)) return [];
        const body = comment.body?.trim();
        const marker = parsePublicationMarker(body?.split('\n', 1)[0]);
        if (!body || marker?.identity.topic !== 'progress' || marker.identity.key !== 'work'
            || marker.identity.target.kind !== 'issue' || marker.identity.target.number !== issueNumber) return [];
        const assessed = /^head:([a-f0-9]{40}):scope:[a-f0-9]{64}$/u.exec(marker.sourceVersion);
        // The structured Commit renderer writes the immutable PR destination in its footer.
        const links = body.slice(body.lastIndexOf('\n') + 1).split(' · ');
        if (!assessed || !canonicalGitObjectId(assessed[1])
            || !links.some(link => /^\[[^\]\r\n]+\]\(/u.test(link) && link.slice(link.indexOf('](') + 2) === `${pullRequestUrl})`)) return [];
        return [{ assessedHeadSha: assessed[1], url: `${repositoryUrl}/issues/${issueNumber}#issuecomment-${comment.id}` }];
    });
    return candidates.length === 1 ? candidates[0] : undefined;
}
