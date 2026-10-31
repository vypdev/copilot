import { FindingsAgentAdapter } from '../../../../data/repository/ai/findings_agent_adapter';
import type { AgentCliPort } from '../../../../infrastructure/agents/ports/agent_provider_ports';
import { remainingProgressPromptBytes } from '../../../policies/progress_prompt_capacity_policy';
import { productFacingAgentQueryOptions } from '../../../policies/agent_output_locale_policy';
import { progressScopeResponseSchema, progressScopeSourceLines } from '../../../policies/progress_scope_policy';
import { AGENT_PROMPT_MAX_BYTES } from '../../../../domain/agent_execution_plan';

const task = 'progress-scope' as const;
const schema = progressScopeResponseSchema(progressScopeSourceLines('Implement the required source.'));
// A three-argument implementation remains callable here, making the regression
// executable against the prior adapter instead of failing TypeScript compilation.
const measure: (prompt: string, taskName: typeof task, responseSchema: typeof schema, effort?: string) => number = remainingProgressPromptBytes;
async function nativePrompt(effort?: string): Promise<string> {
    let actual = '';
    const cli: AgentCliPort = { execute: async request => {
        actual = request.prompt;
        return JSON.stringify({ outputLocale: 'en-US', lines: [{ id: 'L1', kind: 'required' }] });
    } };
    const adapter = new FindingsAgentAdapter({ cli });
    await adapter.query({ configuration: { provider: 'codex', model: 'gpt-6-luna', ...(effort !== undefined ? { effort } : {}) },
        agentId: 'plan', prompt: 'Complete immutable source.', options: productFacingAgentQueryOptions(task, schema) });
    return actual;
}
it.each([undefined, '   ', 'high'])('counts the actual native CLI prompt including configured effort %#', async effort => {
    const actual = await nativePrompt(effort);
    expect(measure('Complete immutable source.', task, schema, effort)).toBe(AGENT_PROMPT_MAX_BYTES - Buffer.byteLength(actual));
});
it('rejects an oversized effort envelope before a progress request can be admitted', async () => {
    const effort = 'x'.repeat(AGENT_PROMPT_MAX_BYTES), actual = await nativePrompt(effort);
    expect(Buffer.byteLength(actual)).toBeGreaterThan(AGENT_PROMPT_MAX_BYTES);
    expect(() => measure('Complete immutable source.', task, schema, effort)).toThrow(expect.objectContaining({ code: 'validation.evidence-too-large' }));
});
