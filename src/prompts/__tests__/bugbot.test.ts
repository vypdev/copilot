import { getBugbotPrompt } from '../bugbot';

describe('getBugbotPrompt', () => {
    it('fills repo context, ignoreBlock and previousBlock', () => {
        const prompt = getBugbotPrompt({
            projectContextInstruction: '**Context.**',
            owner: 'org',
            repo: 'repo',
            headBranch: 'feature/42',
            baseBranch: 'develop',
            issueNumber: '42',
            changeScopeInstruction: 'Inspect only abc1234..def5678.',
            ignoreBlock: '\n**Files to ignore:** *.test.ts',
            previousBlock: '(No previous findings.)',
        });
        expect(prompt).toContain('**Context.**');
        expect(prompt).toContain('org');
        expect(prompt).toContain('repo');
        expect(prompt).toContain('feature/42');
        expect(prompt).toContain('develop');
        expect(prompt).toContain('42');
        expect(prompt).toContain('Inspect only abc1234..def5678.');
        expect(prompt).toContain('*.test.ts');
        expect(prompt).toContain('(No previous findings.)');
        expect(prompt).toContain('findings');
        expect(prompt).toContain('resolved_finding_ids');
        expect(prompt).not.toContain('{{');
    });
});
