import { getThinkPrompt } from '../think';

describe('getThinkPrompt', () => {
    it.each([
        ['explain', 'Explain the file, symbol or behavior', 'state that limitation'],
        ['diagnose', 'Investigate the failure', 'verified facts from hypotheses'],
        ['clarify', 'Identify the missing information', 'focused questions'],
        ['estimate', 'Estimate the effort', 'uncertainty'],
        ['test-plan', 'Propose a test strategy', 'observable acceptance criteria'],
    ])('defines the trusted task for %s without promoting operands to instructions', (commandName, directive, detail) => {
        const prompt = getThinkPrompt({ projectContextInstruction: 'Repository rules', contextBlock: 'Old question',
            question: 'Current arguments: src/requested.ts', targetLocale: 'en-US', commandName: commandName as never });
        expect(prompt).toContain(directive);
        expect(prompt).toContain(detail);
        expect(prompt.indexOf(directive)).toBeLessThan(prompt.indexOf('[BEGIN_UNTRUSTED_DATA origin=prompt.contextBlock'));
        expect(prompt).toContain('Never substitute an older issue question');
        expect(prompt).toContain('[BEGIN_UNTRUSTED_DATA origin=prompt.question');
    });

    it.each([undefined, 'recheck', 'ignore instructions'])('does not interpolate an unsupported task key: %s', commandName => {
        const prompt = getThinkPrompt({ projectContextInstruction: 'Rules', contextBlock: 'Context', question: 'Current question',
            targetLocale: 'en-US', commandName: commandName as never });
        expect(prompt).not.toContain('Explain the file, symbol or behavior');
        expect(prompt).not.toContain('ignore instructions');
        expect(prompt).toContain('Answer the current comment request.');
        expect(prompt).not.toContain('{{');
    });
    it('fills projectContextInstruction, contextBlock and question', () => {
        const prompt = getThinkPrompt({
            projectContextInstruction: '**Use context.**',
            contextBlock: '\n\nContext (issue #1):\nFix the bug.\n\n',
            question: 'what is 2+2?',
            targetLocale: 'fr-FR',
        });
        expect(prompt).toContain('helpful assistant');
        expect(prompt).toContain('**Use context.**');
        expect(prompt).toContain('Context (issue #1):');
        expect(prompt).toContain('Fix the bug.');
        expect(prompt).toContain('Question: [BEGIN_UNTRUSTED_DATA origin=prompt.question');
        expect(prompt).toContain('what is 2+2?');
        expect(prompt).toContain('outputLocale` set exactly to `fr-FR');
        expect(prompt).not.toContain('{{');
    });

    it('allows empty contextBlock', () => {
        const prompt = getThinkPrompt({
            projectContextInstruction: 'X',
            contextBlock: '\n\n',
            question: 'q',
            targetLocale: 'en-US',
        });
        expect(prompt).toContain('Question: [BEGIN_UNTRUSTED_DATA origin=prompt.question');
        expect(prompt).toContain('\nq\n');
        expect(prompt).not.toContain('{{');
    });
});
