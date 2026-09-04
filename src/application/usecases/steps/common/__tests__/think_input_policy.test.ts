import { containsBotMention, extractMentionQuestion, getThinkCommentBody } from '../think_input_policy';

describe('think input policy', () => {
    it('selects issue comments before pull request review comments', () => {
        expect(getThinkCommentBody({
            issueCommentBody: '@bot issue',
            pullRequestReviewCommentBody: '@bot review',
            isIssueComment: true,
            isPullRequestReviewComment: true,
        })).toBe('@bot issue');
    });

    it('returns an empty body for an unrelated event', () => {
        expect(getThinkCommentBody({
            isIssueComment: false,
            isPullRequestReviewComment: false,
        })).toBe('');
    });

    it('removes all case-insensitive mentions and preserves escaped usernames', () => {
        expect(extractMentionQuestion('@a.b explain @A.B please', 'a.b')).toBe('explain  please');
    });

    it('matches bot mentions case-insensitively and avoids larger usernames', () => {
        expect(containsBotMention('Can @VYPBOT review this?', 'vypbot')).toBe(true);
        expect(containsBotMention('Can @vypbot-extra review this?', 'vypbot')).toBe(false);
        expect(containsBotMention('Can @vypbot review this?', '@vypbot')).toBe(true);
        expect(containsBotMention('Can @vypbot review this?', '')).toBe(false);
    });
});
