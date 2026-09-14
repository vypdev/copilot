import { getAnswerIssueHelpPrompt } from '../answer_issue_help';

describe('getAnswerIssueHelpPrompt', () => {
    it('fills description and projectContextInstruction', () => {
        const prompt = getAnswerIssueHelpPrompt({
            description: 'How do I configure X?',
            projectContextInstruction: '**Use project context.**',
            targetLocale: 'fr-FR',
        });
        expect(prompt).toContain('question/help issue');
        expect(prompt).toContain('How do I configure X?');
        expect(prompt).toContain('**Use project context.**');
        expect(prompt).toContain('human-readable sentence in fr-FR');
        expect(prompt).not.toContain('{{description}}');
        expect(prompt).not.toContain('{{projectContextInstruction}}');
    });
});
