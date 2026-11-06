import type { FindingsQueryRequest } from '../ports/agent_findings_ports';
import { applyAgentEffortInstruction, buildAgentPrompt } from './agent_prompt_envelope_policy';

/** Exact native findings envelope, including schema, security framing and effort suffix. */
export function bugbotFramedPromptBytes(request: FindingsQueryRequest): number {
    const options = request.options ?? {};
    return Buffer.byteLength(applyAgentEffortInstruction(buildAgentPrompt(request.prompt,
        options.expectJson ?? false, options.schema, options.schemaName ?? 'response'), request.configuration?.effort));
}
