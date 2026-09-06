import { normalizePullRequestSourceTitle, sanitizeIssueTitle, sanitizePullRequestTitle } from '../issue_title_policy';

describe('issue title policy', () => {
    it('removes issue versions and unknown version markers while preserving periods', () => {
        expect(sanitizeIssueTitle('Fix 1.2.3 Unknown Version.')).toBe('Fix .');
    });

    it('sanitizes pull request titles without applying issue version rules', () => {
        expect(sanitizePullRequestTitle('Fix 1.2.3!')).toBe('Fix 123');
    });

    it('normalizes spaces and dashes consistently', () => {
        expect(sanitizePullRequestTitle('  Fix  -  title--- ')).toBe('Fix  title');
    });

    it('removes an already generated Copilot prefix and repeated issue numbers', () => {
        expect(normalizePullRequestSourceTitle('[#347] 🤖 - 347  347 Develop', 347)).toBe('Develop');
    });

    it('preserves an intentional issue number at the start of an unformatted title', () => {
        expect(normalizePullRequestSourceTitle('347 Develop', 347)).toBe('347 Develop');
    });
});
