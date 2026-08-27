import { extractMentionQuestion, getThinkCommentBody } from '../think_input_policy';

describe('think input policy', () => {
    it('selects issue comments before pull request review comments', () => {
        expect(getThinkCommentBody({
            issueCommentBody: '@bot issue',
            pullRequestReviewCommentBody: '@bot review',
            isIssueComment: true,
            isPullRequestReviewComment: true,
        })).toBe('@bot issue');
    });

    it('removes all case-insensitive mentions and preserves escaped usernames', () => {
        expect(extractMentionQuestion('@a.b explain @A.B please', 'a.b')).toBe('explain  please');
    });
});
