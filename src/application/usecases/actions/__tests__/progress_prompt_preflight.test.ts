import { planProgressDiffPrompts } from '../summarize_progress_diff_workflow';
import { partitionProgressDiff } from '../../../policies/progress_diff_partition_policy';
import { progressPartitionResponseSchema } from '../../../policies/progress_partition_response_policy';
import { remainingProgressPromptBytes } from '../../../policies/progress_prompt_capacity_policy';
import { MAX_PROGRESS_SCOPE_BYTES } from '../../../policies/progress_scope_policy';

it('reserves dynamic scope framing in every part before admitting the first model request', () => {
    const diff = partitionProgressDiff('a'.repeat(40), 'b'.repeat(40), ['a.md', 'b.md'].map(path => ({
        path, status: 'added', additions: 1, deletions: 0, patch: 'x'.repeat(150_000),
    })));
    if (diff.kind !== 'partitioned') throw Error('Expected multipart fixture');
    const context = { issueNumber: 1, pushedBranch: 'feature/1-work', developmentBranch: 'develop', branchTypes: ['feature'],
        agentConfiguration: { provider: 'codex' as const, model: 'fixture-model' }, includeReasoning: false, targetLocale: 'en-US' };
    const scope = ' '.repeat(MAX_PROGRESS_SCOPE_BYTES);
    // Keep each issue line inside its original 1,200-code-point bound.
    const issue = (size: number) => ('x'.repeat(999) + '\n').repeat(Math.floor(size / 1000)) + 'x'.repeat(size % 1000);
    let low = 200_000, high = 350_000;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        try { planProgressDiffPrompts(diff, context, issue(middle), 384_000, scope); low = middle; }
        catch (error) {
            expect(error).toMatchObject({ code: 'validation.evidence-too-large' }); high = middle - 1;
        }
    }
    const { prompts, factLimit } = planProgressDiffPrompts(diff, context, issue(low), 384_000, scope);
    const available = prompts.map((prompt, index) => remainingProgressPromptBytes(prompt, 'progress-partition', progressPartitionResponseSchema(diff.partitions[index], factLimit)));
    expect(Math.min(...available)).toBeGreaterThanOrEqual(1_024);
    expect(Math.min(...available)).toBeLessThan(1_030);
});
