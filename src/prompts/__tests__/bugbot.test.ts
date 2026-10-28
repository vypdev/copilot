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

describe('external-fact evidence in review prompts', () => {
    it.each([false, true])('requires current evidence with partitioned=%s', (partitioned) => {
        const prompt = getBugbotPrompt({
            projectContextInstruction: '', owner: 'org', repo: 'repo',
            headBranch: 'bugfix/721', baseBranch: 'develop', issueNumber: '721',
            changeScopeInstruction: 'Inspect the supplied diff.', ignoreBlock: '',
            previousBlock: '', coverageBlock: '', targetLocale: 'en-US',
            ...(partitioned ? { partitionBlock: 'Review only partition 1/2.', outputContractBlock: 'Return partition attestation.' } : {}),
        });
        expect(prompt).toContain('historical naming conventions and model memory do not prove absence');
        expect(prompt).toContain('do not establish that the reviewed command succeeds');
        expect(prompt).toContain('omit that unsupported finding');
        expect(prompt).toContain('Verify a proposed replacement');
        expect(prompt).toContain('still report a demonstrated package-resolution failure');
        expect(prompt).toContain('evaluate each execution path independently');
        expect(prompt).toContain('only blocks a build is a medium-severity reliability finding');
    });
});


describe('resolved dependency type evidence', () => {
    it.each([false, true])('requires exact type and fault evidence with partitioned=%s', partitioned => {
        const prompt = getBugbotPrompt({
            projectContextInstruction: '', owner: 'org', repo: 'repo', headBranch: 'bugfix/736',
            baseBranch: 'develop', issueNumber: '736', changeScopeInstruction: 'Inspect the changed error handler.',
            ignoreBlock: '', previousBlock: '', coverageBlock: '', targetLocale: 'en-US',
            ...(partitioned ? { partitionBlock: 'Review partition 1/2.', outputContractBlock: 'Return partition attestation.' } : {}),
        });
        expect(prompt).toContain('exact imported type, resolved coordinate/version and reviewed platform');
        expect(prompt).toContain('version-matched source or actual artifact class hierarchy');
        expect(prompt).toContain('cause containment is not inheritance');
        expect(prompt).toContain('reconcile the actual fault path and its asserted result');
        expect(prompt).toContain('A green mock, skipped test or another artifact is not counterevidence');
        expect(prompt).toContain('Preserve genuine uncaught-wrapper and swallowed-cancellation defects');
        expect(prompt).toContain('omit an unsupported inheritance finding');
    });
});
