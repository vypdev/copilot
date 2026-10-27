import { getBugbotPrompt } from '../bugbot';
import { buildBugbotBenchmarkPrompt } from '../../tooling/bugbot_benchmark_runner';

const reviewPrompt = () => getBugbotPrompt({
    projectContextInstruction: '', owner: 'org', repo: 'repo',
    headBranch: 'bugfix/720', baseBranch: 'develop', issueNumber: '720',
    changeScopeInstruction: 'Review the current diff.', ignoreBlock: '',
    previousBlock: '', coverageBlock: '', targetLocale: 'en-US',
});
const benchmarkPrompt = () => buildBugbotBenchmarkPrompt({
    id: 'compose', language: 'kotlin', category: 'correctness',
    description: 'A form with bounded parent constraints.',
    file: 'ui/AuthForm.kt', startLine: 1, diff: '+Card(Modifier.width(400.dp)) {}',
    expected: [{ title: 'Hidden evaluation verdict' }],
});

describe('framework semantics before review publication', () => {
    it.each([
        ['production review', reviewPrompt],
        ['real-agent benchmark', benchmarkPrompt],
    ] as const)('requires constraint and replacement evidence in the %s', (_name, build) => {
        const prompt = build();
        expect(prompt).toContain('Verify the exact framework API and reviewed version');
        expect(prompt).toContain('preferred width/size (which obey incoming constraints)');
        expect(prompt).toContain('requiredWidth/requiredSize (which can override them)');
        expect(prompt).toContain('incoming min/max constraints, modifier order and padding');
        expect(prompt).toContain('actual unclipped interactive bounds');
        expect(prompt).toContain('padding passed in the Card modifier itself');
        expect(prompt).toContain('control width is min(P,W) - 2*a - 2*b');
        expect(prompt).toContain('reported coerced size from the actual centered child bounds');
        expect(prompt).toContain('both the failing boundary and other intended constraints');
        expect(prompt).toContain('narrow responsiveness and wide-screen caps');
        expect(prompt).toContain('fillMaxWidth before widthIn can establish an exact wide constraint');
        expect(prompt).toContain('rather than assuming either order is universally safe');
        expect(prompt).toContain('omit suggestedCode rather than presenting an unverified replacement');
        expect(prompt).toContain('still report a demonstrated requiredWidth overflow or a lost width cap');
        expect(prompt).not.toContain('Hidden evaluation verdict');
    });
});
