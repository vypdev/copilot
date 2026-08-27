import { getBugbotFixPrompt } from '../bugbot_fix';

describe('getBugbotFixPrompt', () => {
    it('fills all params including prNumberLine and verifyBlock', () => {
        const prompt = getBugbotFixPrompt({
            projectContextInstruction: '**Context.**',
            owner: 'o',
            repo: 'r',
            headBranch: 'fix/branch',
            baseBranch: 'main',
            issueNumber: '1',
            prNumberLine: '- Pull request number: 5',
            findingsBlock: '---\n**Finding id:** `f1`\n\n**Full comment:**\nBug here.\n',
            userComment: 'fix it',
            verifyBlock: '\n**Verify commands:**\n- `pnpm test`\n',
        });
        expect(prompt).toContain('**Context.**');
        expect(prompt).toContain('Pull request number: 5');
        expect(prompt).toContain('Finding id');
        expect(prompt).toContain('fix it');
        expect(prompt).toContain('Verify commands');
        expect(prompt).toContain('pnpm test');
        expect(prompt).not.toContain('{{');
    });

    it('allows empty prNumberLine', () => {
        const prompt = getBugbotFixPrompt({
            projectContextInstruction: 'X',
            owner: 'o',
            repo: 'r',
            headBranch: 'b',
            baseBranch: 'main',
            issueNumber: '1',
            prNumberLine: '',
            findingsBlock: 'findings',
            userComment: 'fix',
            verifyBlock: 'Verify.',
        });
        expect(prompt).toContain('findings');
        expect(prompt).not.toContain('{{');
    });
});
