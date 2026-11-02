import { planProgressDiffPrompts, summarizeProgressDiff } from '../summarize_progress_diff_workflow';
import { progressPartitionRepairPrompt } from '../../../policies/progress_partition_length_policy';
import { progressPartitionResponseSchema } from '../../../policies/progress_partition_response_policy';
import { remainingProgressPromptBytes, PROGRESS_PROMPT_FRAMING_RESERVE_BYTES } from '../../../policies/progress_prompt_capacity_policy';
import { renderProgressPromptData } from '../../../../prompts/progress_scope';
import { AGENT_PROMPT_MAX_BYTES } from '../../../../domain/agent_execution_plan';
import type { ProgressDiffEvidence } from '../../../ports/progress_diff_query_ports';

const context = { issueNumber: 830, pushedBranch: 'bugfix/830-output', developmentBranch: 'develop', branchTypes: ['bugfix'],
    agentConfiguration: { provider: 'codex' as const, model: 'fixture-model' }, includeReasoning: false, targetLocale: 'en-US' };
const diff: Extract<ProgressDiffEvidence, { kind: 'partitioned' }> = { kind: 'partitioned', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), evidence: 'Complete immutable evidence.',
    partitions: [{ id: 'first', paths: ['a.ts'], evidence: 'Source.' }, { id: 'last', paths: ['b.ts'], evidence: 'x'.repeat(200_000) }] };
const issue = (size: number) => ('x'.repeat(999) + '\n').repeat(Math.floor(size / 1000)) + 'x'.repeat(size % 1000);
const plan = (size: number, reserve = false) => planProgressDiffPrompts(diff, context, issue(size), 384_000, 'R1: Source.', reserve);
let boundary: number;
beforeAll(() => {
    let low = 200_000, high = 380_000;
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        try { plan(mid); low = mid; } catch { high = mid - 1; }
    }
    boundary = low;
});
it('rejects a replacement envelope that cannot fit even though the original request fits', () => {
    const admitted = plan(boundary), previous = renderProgressPromptData(JSON.stringify(issue(boundary)), 'progress.issue-description', AGENT_PROMPT_MAX_BYTES);
    const next = renderProgressPromptData(JSON.stringify(issue(boundary + 1)), 'progress.issue-description', AGENT_PROMPT_MAX_BYTES);
    const initial = admitted.prompts[1].replace(previous, next), schema = progressPartitionResponseSchema(diff.partitions[1], admitted.factLimit);
    expect(initial).not.toBe(admitted.prompts[1]);
    expect(remainingProgressPromptBytes(initial, 'progress-partition', schema)).toBeGreaterThanOrEqual(0);
    expect(() => remainingProgressPromptBytes(progressPartitionRepairPrompt(initial), 'progress-partition', schema)).toThrow();
    expect(() => plan(boundary + 1)).toThrow(expect.objectContaining({ code: 'validation.evidence-too-large' }));
});
it('keeps the existing scope reserve in addition to the complete replacement envelope', () => {
    const admitted = plan(boundary), schema = progressPartitionResponseSchema(diff.partitions[1], admitted.factLimit);
    expect(remainingProgressPromptBytes(progressPartitionRepairPrompt(admitted.prompts[1]), 'progress-partition', schema)).toBeLessThan(PROGRESS_PROMPT_FRAMING_RESERVE_BYTES);
    expect(() => plan(boundary, true)).toThrow(expect.objectContaining({ code: 'validation.evidence-too-large' }));
});
it('preflights a late-part failure before the first otherwise valid source part is queried', async () => {
    expect(() => planProgressDiffPrompts({ ...diff, partitions: [diff.partitions[0]] }, context, issue(boundary + 1), 384_000, 'R1: Source.', false)).not.toThrow();
    const query = jest.fn();
    await expect(summarizeProgressDiff(diff, context, issue(boundary + 1), { query }, 384_000, 'R1: Source.')).rejects.toMatchObject({ code: 'validation.evidence-too-large' });
    expect(query).not.toHaveBeenCalled();
});
it('leaves a complete single-part result on its unchanged no-part-query path', async () => {
    const single = { kind: 'single' as const, baseSha: diff.baseSha, headSha: diff.headSha, evidence: 'Complete single evidence.' }, query = jest.fn();
    expect(planProgressDiffPrompts(single, context, 'Source.', 384_000, 'R1')).toEqual({ prompts: [], factLimit: 600 });
    await expect(summarizeProgressDiff(single, context, 'Source.', { query }, 384_000, 'R1')).resolves.toBe(single.evidence); expect(query).not.toHaveBeenCalled();
});
