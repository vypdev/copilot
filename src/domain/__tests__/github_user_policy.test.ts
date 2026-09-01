import { githubUsersMatch } from '../github_user_policy';

describe('githubUsersMatch', () => {
    it('matches GitHub logins without case sensitivity', () => {
        expect(githubUsersMatch('Copilot-Bot', 'copilot-bot')).toBe(true);
    });

    it('does not match different or empty logins', () => {
        expect(githubUsersMatch('developer', 'copilot-bot')).toBe(false);
        expect(githubUsersMatch('', '')).toBe(false);
    });
});
