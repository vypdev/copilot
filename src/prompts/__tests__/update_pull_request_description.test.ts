import { getUpdatePullRequestDescriptionPrompt } from '../update_pull_request_description';

describe('getUpdatePullRequestDescriptionPrompt', () => {
    it('fills all params and contains template instructions', () => {
        const prompt = getUpdatePullRequestDescriptionPrompt({
            projectContextInstruction: '**Use repo.**',
            baseBranch: 'main',
            headBranch: 'feature/123',
            issueNumber: '42',
            issueDescription: 'Add login screen.',
            relatedIssueInstruction: 'Include `Closes #42` when relevant.',
        });
        expect(prompt).toContain('**Use repo.**');
        expect(prompt).toContain('`main`');
        expect(prompt).toContain('`feature/123`');
        expect(prompt).toContain('Closes #42');
        expect(prompt).toContain('Add login screen.');
        expect(prompt).toContain('pull_request_template.md');
        expect(prompt).toContain('git diff');
        expect(prompt).not.toContain('{{');
    });
});
