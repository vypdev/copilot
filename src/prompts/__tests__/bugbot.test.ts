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
            coverageBlock: '**Context coverage:** complete.',
            targetLocale: 'de-DE',
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
        expect(prompt).toContain('Context coverage');
        expect(prompt).toContain('findings');
        expect(prompt).toContain('resolved_findings');
        expect(prompt).toContain('Read effective repository configuration and inherited library/protocol defaults');
        expect(prompt).toContain('Trace short-circuit guards, validation helpers and the actual caller/render path');
        expect(prompt).toContain('Recompute arithmetic and check cited line numbers');
        expect(prompt).toContain('withdraw the finding entirely');
        expect(prompt).toContain('Report a confirmed failure when those protections are absent');
        expect(prompt).toContain('outputLocale` exactly as `de-DE');
        expect(prompt).not.toContain('{{');
    });
    it('requires versioned ownership and startup-path evidence before alleging missing cleanup', () => {
        const prompt = getBugbotPrompt({
            projectContextInstruction: '', owner: 'org', repo: 'repo', headBranch: 'bugfix/722',
            baseBranch: 'develop', issueNumber: '722', changeScopeInstruction: 'Review current changes.',
            ignoreBlock: '', previousBlock: '', coverageBlock: '', targetLocale: 'en-US',
        });
        expect(prompt).toContain('verify the exact resolved dependency version');
        expect(prompt).toContain('version-matched official documentation or source');
        expect(prompt).toContain('initialization prerequisites, owned container boundary and success/failure paths');
        expect(prompt).toContain('Missing manual DOM-removal code alone is insufficient evidence');
        expect(prompt).toContain('children outside the owned container');
        expect(prompt).toContain('intentional error UI is not a permanent-loading defect');
        expect(prompt).toContain('omit the speculative claim rather than inventing framework behavior');
    });
});
