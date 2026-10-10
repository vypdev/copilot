import { normalizePullRequestSourceTitle, sanitizeIssueTitle, sanitizePullRequestTitle } from '../issue_title_policy';
import { BranchNameRepository } from '../branch_name_repository';

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

    it.each([sanitizeIssueTitle, sanitizePullRequestTitle])('keeps hyphenated word boundaries and the same issue branch after title formatting', sanitize => {
        const title = 'Document the first issue-to-pr workflow';
        const formatted = sanitize(`📝 - ${title}`);
        expect(formatted).toBe('Document the first issue to pr workflow');
        expect(sanitize(formatted)).toBe(formatted);
        const names = new BranchNameRepository();
        expect(names.formatBranchName(formatted, 453)).toBe(names.formatBranchName(title, 453));
    });

    it('removes an already generated Copilot prefix and repeated issue numbers', () => {
        expect(normalizePullRequestSourceTitle('[#347] 🤖 - 347  347 Develop', 347)).toBe('Develop');
    });

    it('preserves an intentional issue number at the start of an unformatted title', () => {
        expect(normalizePullRequestSourceTitle('347 Develop', 347)).toBe('347 Develop');
    });
});
