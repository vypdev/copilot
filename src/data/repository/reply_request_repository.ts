import { replyRequestBodyDigest } from '../../domain/reply_request_digest';
import type { BoundReplyRequestReadPort, ReplyRequestSnapshot } from '../../application/ports/reply_request_read_ports';
import { githubUsersMatch } from '../../domain/github_user_policy';
import type { GithubReplyRequestClient } from '../../infrastructure/github/ports/github_reply_request_client';

interface Binding { readonly owner: string; readonly repository: string; readonly apiBaseUrl: string }
/** Provider identity and diagnostics terminate here. Requests forbid redirects. */
export class ReplyRequestRepository implements BoundReplyRequestReadPort {
    private readonly binding: Binding;
    constructor(private readonly client: GithubReplyRequestClient, binding: Binding) {
        this.binding = Object.freeze({ ...binding });
    }
    async matches(snapshot: ReplyRequestSnapshot): Promise<boolean> {
        try {
            const base = new URL(this.binding.apiBaseUrl);
            if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash
                || !Number.isSafeInteger(snapshot.commentId) || snapshot.commentId < 1
                || !Number.isSafeInteger(snapshot.target.number) || snapshot.target.number < 1
                || !['issue', 'pull-request'].includes(snapshot.target.kind)
                || !['issue-comment', 'review-comment'].includes(snapshot.surface)
                || snapshot.surface === 'review-comment' && snapshot.target.kind !== 'pull-request'
                || !/^[a-f0-9]{64}$/u.test(snapshot.bodyDigest) || !snapshot.author) return false;
            const root = base.href.replace(/\/$/u, '') + '/repos/' + encodeURIComponent(this.binding.owner) + '/' + encodeURIComponent(this.binding.repository);
            const parameters = { owner: this.binding.owner, repo: this.binding.repository, comment_id: snapshot.commentId,
                request: { redirect: 'error' as const } };
            const review = snapshot.surface === 'review-comment';
            const response = review ? await this.client.rest.pulls.getReviewComment(parameters) : await this.client.rest.issues.getComment(parameters);
            const data = record(response.data), user = record(data.user);
            if (response.url !== root + (review ? '/pulls/comments/' : '/issues/comments/') + snapshot.commentId
                || data.id !== snapshot.commentId || typeof data.body !== 'string' || data.body.length > 70_000
                || typeof user.login !== 'string' || !githubUsersMatch(user.login, snapshot.author)
                || data[review ? 'pull_request_url' : 'issue_url'] !== root + (review ? '/pulls/' : '/issues/') + snapshot.target.number) return false;
            return replyRequestBodyDigest(data.body) === snapshot.bodyDigest;
        } catch { return false; }
    }
}
function record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
