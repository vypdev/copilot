import { getRecommendStepsPrompt } from '../recommend_steps';

describe('getRecommendStepsPrompt', () => {
    it('fills issue number and description', () => {
        const prompt = getRecommendStepsPrompt({
            projectContextInstruction: '**Use project.**',
            issueNumber: '7',
            issueDescription: 'Implement OAuth flow.',
            targetLocale: 'fr-FR',
        });
        expect(prompt).toContain('**Use project.**');
        expect(prompt).toContain('Issue #7');
        expect(prompt).toContain('Implement OAuth flow.');
        expect(prompt).toContain('three to eight logically ordered steps');
        expect(prompt).toContain('zero to two brief supporting details');
        expect(prompt).toContain('specific, verifiable acceptance criterion');
        expect(prompt).toContain('Do not write Markdown or headings inside fields');
        expect(prompt).toContain('status` to `unchanged');
        expect(prompt).toContain('outputLocale` exactly as `fr-FR');
        expect(prompt).not.toContain('{{');
    });

    it('includes the previous recommendation when supplied', () => {
        const prompt = getRecommendStepsPrompt({
            projectContextInstruction: '',
            issueNumber: '7',
            issueDescription: 'Implement OAuth flow.',
            previousRecommendation: '1. Reuse the existing auth service.',
            previousRecommendationFormat: 'structured',
            targetLocale: 'en-US',
        });

        expect(prompt).toContain('Previous structured recommendation');
        expect(prompt).toContain('<previous-recommendation>');
        expect(prompt).toContain('Reuse the existing auth service.');
    });

    it('requires migration when the previous recommendation is legacy free-form text', () => {
        const prompt = getRecommendStepsPrompt({
            projectContextInstruction: '',
            issueNumber: '7',
            issueDescription: 'Implement OAuth flow.',
            previousRecommendation: '1. Reuse the existing auth service.',
            previousRecommendationFormat: 'legacy',
            targetLocale: 'en-US',
        });

        expect(prompt).toContain('Previous legacy recommendation');
        expect(prompt).toContain('complete structured replacement');
        expect(prompt).toContain('do not return unchanged');
    });

    it('requires a complete replacement when a structured plan uses another or unknown locale', () => {
        const prompt = getRecommendStepsPrompt({
            projectContextInstruction: '',
            issueNumber: '7',
            issueDescription: 'Implement OAuth flow.',
            previousRecommendation: '1. Definir el contrato.',
            previousRecommendationFormat: 'structured-other-locale',
            targetLocale: 'en-US',
        });

        expect(prompt).toContain('Previous structured recommendation from another or unknown locale');
        expect(prompt).toContain('complete structured replacement in the requested locale');
        expect(prompt).toContain('do not return unchanged');
    });
});
