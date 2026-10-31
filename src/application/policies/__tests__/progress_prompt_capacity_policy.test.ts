import { progressAggregateBudget, remainingProgressPromptBytes } from '../progress_prompt_capacity_policy';
import { buildAgentPrompt } from '../agent_prompt_envelope_policy';
import { AGENT_PROMPT_MAX_BYTES } from '../../../domain/agent_execution_plan';
import { progressScopeResponseSchema, progressScopeSourceLines } from '../progress_scope_policy';
import { productFacingAgentQueryOptions } from '../agent_output_locale_policy';
import { MAX_PROGRESS_AGGREGATE_BYTES } from '../progress_partition_response_policy';

const schema = progressScopeResponseSchema(progressScopeSourceLines('Implement the feature.'));
it('counts the exact native security, schema name, schema and task envelope', () => {
    const options = productFacingAgentQueryOptions('progress-scope', schema), prompt = '🧪 source data';
    expect(remainingProgressPromptBytes(prompt, 'progress-scope', schema)).toBe(AGENT_PROMPT_MAX_BYTES - Buffer.byteLength(buildAgentPrompt(prompt, true, options.schema, options.schemaName)));
});
it('admits the exact full runtime boundary and rejects one extra byte', () => {
    const available = remainingProgressPromptBytes('', 'progress-scope', schema);
    expect(remainingProgressPromptBytes('a'.repeat(available), 'progress-scope', schema)).toBe(0);
    expect(() => remainingProgressPromptBytes('a'.repeat(available + 1), 'progress-scope', schema)).toThrow(expect.objectContaining({ code: 'validation.evidence-too-large' }));
});
it('rejects a raw task that fits but whose security/schema envelope does not', () => {
    expect(() => remainingProgressPromptBytes('a'.repeat(AGENT_PROMPT_MAX_BYTES - 10), 'progress-scope', schema)).toThrow();
});
it('keeps the unchanged aggregate ceiling for small prompts', () => {
    expect(progressAggregateBudget('Small task.', schema)).toBe(MAX_PROGRESS_AGGREGATE_BYTES);
});
it('reserves dynamic framing in addition to the exact final response envelope', () => {
    const prompt = 'a'.repeat(200_000), remaining = remainingProgressPromptBytes(prompt, 'progress', schema);
    expect(progressAggregateBudget(prompt, schema)).toBe(remaining - 1_024);
});
it('rejects an envelope with no room for dynamic framing and aggregate facts', () => {
    const available = remainingProgressPromptBytes('', 'progress', schema);
    expect(() => progressAggregateBudget('a'.repeat(available - 1_024), schema)).toThrow();
});
