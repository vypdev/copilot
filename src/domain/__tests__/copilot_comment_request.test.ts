import { containsBotMention, isCopilotCommentRequest } from '../copilot_comment_request';

describe('Copilot comment request', () => {
    it('accepts explicit commands, including invalid commands that need deterministic feedback', () => {
        expect(isCopilotCommentRequest('/copilot help', 'vypbot')).toBe(true);
        expect(isCopilotCommentRequest('  /copilot unknown', 'vypbot')).toBe(true);
    });

    it('accepts an exact bot mention and rejects username prefix collisions', () => {
        expect(containsBotMention('Can @VYPBOT review this?', 'vypbot')).toBe(true);
        expect(isCopilotCommentRequest('Can @vypbot review this?', 'vypbot')).toBe(true);
        expect(isCopilotCommentRequest('Can @vypbot-extra review this?', 'vypbot')).toBe(false);
    });

    it('keeps passive comments inert even when no bot login is configured', () => {
        expect(isCopilotCommentRequest('Automated coverage report', 'vypbot')).toBe(false);
        expect(isCopilotCommentRequest('ordinary user reply', '')).toBe(false);
    });
});
