import { getCheckProgressPrompt } from '../check_progress';

describe('getCheckProgressPrompt', () => {
    it('fills branches and issue description', () => {
        const prompt = getCheckProgressPrompt({
            projectContextInstruction: '**Context.**',
            issueNumber: '3',
            baseBranch: 'develop',
            currentBranch: 'feature/wip',
            issueDescription: 'Build the API.',
            targetLocale: 'pt-BR',
        });
        expect(prompt).toContain('**Context.**');
        expect(prompt).toContain('issue #3');
        expect(prompt).toContain('`develop`');
        expect(prompt).toContain('`feature/wip`');
        expect(prompt).toContain('Build the API.');
        expect(prompt).toContain('progress');
        expect(prompt).toContain('remaining');
        expect(prompt).toContain('"outputLocale": "pt-BR"');
        expect(prompt).not.toContain('{{');
    });
});
