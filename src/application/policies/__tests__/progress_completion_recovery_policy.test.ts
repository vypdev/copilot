import { PROGRESS_COMPLETION_HINT_MAX_BYTES, progressCompletionRepairPrompt, reservedProgressCompletionPrompt } from '../progress_completion_recovery_policy';
import { remainingProgressAssessmentPromptBytes, remainingProgressPromptBytes, progressAggregateBudget } from '../progress_prompt_capacity_policy';
import { MAX_PROGRESS_AGGREGATE_BYTES, parseProgressPartitionFacts } from '../progress_partition_response_policy';
import { MAX_PROGRESS_SCOPE_BYTES, MAX_PROGRESS_SCOPE_CLAUSES, parseScopedProgressResponse, progressScopeResponseSchema, progressScopeSourceLines } from '../progress_scope_policy';
import { MAX_PROGRESS_ASSESSMENT_POINTS, MAX_PROGRESS_FACT_POINTS } from '../progress_assessment_capacity_policy';
import { AGENT_PROMPT_MAX_BYTES } from '../../../domain/agent_execution_plan';

it('github-communication-experience-change-C157: the closed numeric hint always fits the complete reserved envelope and never includes reserve padding', () => {
    const prompt = 'Complete pinned source.';
    for (const reportedProgress of [0, Number.MIN_VALUE, 1.2345678901234567, 99.99999999999999]) {
        const facts = { reportedProgress, requirementCount: 32, supportedCount: 32, missingCount: 0, unknownCount: 0 };
        const actual = progressCompletionRepairPrompt(prompt, facts), reserved = reservedProgressCompletionPrompt(prompt);
        expect(Buffer.byteLength(JSON.stringify(facts))).toBeLessThanOrEqual(PROGRESS_COMPLETION_HINT_MAX_BYTES);
        expect(Buffer.byteLength(actual)).toBeLessThanOrEqual(Buffer.byteLength(reserved));
        expect(actual.startsWith(prompt)).toBe(true); expect(actual).not.toContain(' '.repeat(256));
        expect(reserved).toContain(' '.repeat(256)); expect(actual).toContain(JSON.stringify(facts));
    }
    const schema = progressScopeResponseSchema(progressScopeSourceLines('Owned source.'));
    const available = remainingProgressAssessmentPromptBytes('', schema);
    expect(remainingProgressAssessmentPromptBytes('x'.repeat(available), schema)).toBe(0);
    expect(() => remainingProgressAssessmentPromptBytes('x'.repeat(available + 1), schema)).toThrow();
    expect(remainingProgressPromptBytes('x'.repeat(available + 1), 'progress', schema)).toBeGreaterThan(0);
});
it('github-communication-experience-change-C158: aggregate, scope, fact and cited projection capacities remain enforced without truncation', () => {
    expect([AGENT_PROMPT_MAX_BYTES, MAX_PROGRESS_AGGREGATE_BYTES, MAX_PROGRESS_SCOPE_BYTES, MAX_PROGRESS_SCOPE_CLAUSES,
        MAX_PROGRESS_FACT_POINTS, MAX_PROGRESS_ASSESSMENT_POINTS]).toEqual([524288, 384000, 64000, 32, 800, 8000]);
    const schema = progressScopeResponseSchema(progressScopeSourceLines('Owned source.'));
    expect(progressAggregateBudget('Small task.', schema)).toBe(384000);
    const part = { id: 'P1', paths: ['a.ts'], evidence: 'Complete source.' };
    const response = { outputLocale: 'en-US', partitionId: 'P1', files: [{ path: 'a.ts', implemented: 'x'.repeat(801), remaining: 'Unverified.' }] };
    expect(() => parseProgressPartitionFacts(response, part, 'en-US', 800)).toThrow();
    const scope = { requirements: Array.from({ length: 32 }, (_, i) => ({ id: `R${i + 1}`, quote: `Required ${i}.` })), exclusions: [] };
    const output = { outputLocale: 'en-US', progress: 100, requirements: scope.requirements.map(({ id }) =>
        ({ id, status: 'supported', evidence: 'source-only', summary: 'x'.repeat(800), remaining: null })) };
    expect(() => parseScopedProgressResponse(output, 'en-US', scope)).toThrow();
    expect(output.requirements).toHaveLength(32); expect(output.requirements[31].summary).toHaveLength(800);
});
