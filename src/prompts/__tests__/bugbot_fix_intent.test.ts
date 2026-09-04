import { getBugbotFixIntentPrompt } from '../bugbot_fix_intent';

describe('getBugbotFixIntentPrompt', () => {
    it('fills findingsBlock, parentBlock and userComment', () => {
        const prompt = getBugbotFixIntentPrompt({
            projectContextInstruction: '**Context.**',
            findingsBlock: '- **id:** `find-1` | **title:** Bug one',
            parentBlock: '\n**Parent comment:**\nPrevious finding.\n',
            userComment: 'fix find-1 please',
        });
        expect(prompt).toContain('**Context.**');
        expect(prompt).toContain('find-1');
        expect(prompt).toContain('Bug one');
        expect(prompt).toContain('Parent comment');
        expect(prompt).toContain('Previous finding.');
        expect(prompt).toContain('fix find-1 please');
        expect(prompt).toContain('is_fix_request');
        expect(prompt).toContain('target_finding_ids');
        expect(prompt).toContain('is_do_request');
        expect(prompt).toContain('is_review_request');
        expect(prompt).not.toContain('{{');
    });

    it('allows empty parentBlock', () => {
        const prompt = getBugbotFixIntentPrompt({
            projectContextInstruction: 'X',
            findingsBlock: '(No unresolved findings.)',
            parentBlock: '',
            userComment: 'fix all',
        });
        expect(prompt).toContain('(No unresolved findings.)');
        expect(prompt).toContain('fix all');
        expect(prompt).toContain('is_review_request');
        expect(prompt).not.toContain('{{');
    });
});
