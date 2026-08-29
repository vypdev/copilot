import { getRecommendStepsPrompt } from '../recommend_steps';

describe('getRecommendStepsPrompt', () => {
    it('fills issue number and description', () => {
        const prompt = getRecommendStepsPrompt({
            projectContextInstruction: '**Use project.**',
            issueNumber: '7',
            issueDescription: 'Implement OAuth flow.',
        });
        expect(prompt).toContain('**Use project.**');
        expect(prompt).toContain('Issue #7');
        expect(prompt).toContain('Implement OAuth flow.');
        expect(prompt).toContain('recommend concrete steps');
        expect(prompt).toContain('NO_NEW_RECOMMENDATIONS');
        expect(prompt).not.toContain('{{');
    });

    it('includes the previous recommendation when supplied', () => {
        const prompt = getRecommendStepsPrompt({
            projectContextInstruction: '',
            issueNumber: '7',
            issueDescription: 'Implement OAuth flow.',
            previousRecommendation: '1. Reuse the existing auth service.',
        });

        expect(prompt).toContain('<previous-recommendation>');
        expect(prompt).toContain('Reuse the existing auth service.');
    });
});
