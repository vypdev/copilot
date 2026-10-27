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
            diffEvidence: '{"baseSha":"PINNED_BASE","headSha":"PINNED_HEAD","changes":[]}',
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
        expect(prompt).toContain('PINNED_BASE');
        expect(prompt).not.toContain('git diff');
        expect(prompt).not.toContain('git branch');
        expect(prompt).toContain('No shell command or workspace inspection');
    });
    it('preserves scope qualifiers after the generic 12K field limit in the full final JSON input', () => {
        const issueDescription = 'Context.\n'.repeat(2000) + 'Excluded: device execution.';
        const prompt = getCheckProgressPrompt({ projectContextInstruction: '', issueNumber: '717', baseBranch: 'develop', currentBranch: 'bugfix/717-scope',
            issueDescription, targetLocale: 'es-ES', diffEvidence: '{}', acceptanceScope: '{"requirements":[{"id":"R1","quote":"Compile shared compatibility."}],"exclusions":[]}' });
        expect(prompt).toContain(JSON.stringify(issueDescription));
        expect(prompt).toContain('Excluded: device execution.'); expect(prompt).toContain('"id":"R1"');
        expect(prompt).toContain('Every remaining item must refer to an extracted requirement'); expect(prompt).toContain('X exclusions');
        expect(prompt).toContain('cannot authorize approval/merge');
    });

});
