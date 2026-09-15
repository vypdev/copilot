import { getUpdatePullRequestDescriptionPrompt } from '../update_pull_request_description';

describe('getUpdatePullRequestDescriptionPrompt', () => {
    it('fills all params and requires a concise evidence-based body', () => {
        const prompt = getUpdatePullRequestDescriptionPrompt({
            projectContextInstruction: '**Use repo.**',
            baseBranch: 'main',
            headBranch: 'feature/123',
            issueNumber: '42',
            issueDescription: 'Add login screen.',
            relatedIssueInstruction: 'Set `closesLinkedIssue` for issue #42 only when fully resolved.',
            targetLocale: 'es-ES',
        });
        expect(prompt).toContain('**Use repo.**');
        expect(prompt).toContain('`main`');
        expect(prompt).toContain('`feature/123`');
        expect(prompt).toContain('`closesLinkedIssue` for issue #42');
        expect(prompt).toContain('Add login screen.');
        expect(prompt).toContain('pull_request_template.md');
        expect(prompt).toContain('git diff main...feature/123');
        expect(prompt).toContain('`whatChangedHeading`');
        expect(prompt).toContain('never infer that result from the presence of test files or commands');
        expect(prompt).toContain('set both fields to `null`');
        expect(prompt).toContain('do not add a “not run” placeholder');
        expect(prompt).toContain('`validationHeading`');
        expect(prompt).toContain('application renders the Markdown structure');
        expect(prompt).toContain('normally under 4,000 characters');
        expect(prompt).toContain('never exceed 12,000 characters');
        expect(prompt).toContain('Never claim a check passed unless the evidence says it did');
        expect(prompt).toContain('Do not infer consumers, compatibility obligations, upgrade steps');
        expect(prompt).toContain('no installed users, external consumers, or persisted production state');
        expect(prompt).toContain('conclusive evidence that removed contracts require no migration note');
        expect(prompt).toContain('Do not use review notes to restate greenfield removals');
        expect(prompt).toContain('identifies a concrete affected consumer, required transition, reviewer action, or unresolved risk');
        expect(prompt).toContain('Do not reproduce empty placeholder sections');
        expect(prompt).not.toContain('full filled template');
        expect(prompt).toContain('Do not use emoji, horizontal separators, generic checklists');
        expect(prompt).toContain('outputLocale` exactly as `es-ES');
        expect(prompt).not.toContain('{{');
    });
});
