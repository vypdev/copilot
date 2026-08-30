import { logError } from '../../../utils/logger';
import { buildAgentPrompt } from '../agent_prompt_policy';
import { interpretFindingsResponse } from '../agent_findings_response_policy';
import type { LanguageQueryPort, LanguageQueryRequest } from '../../../application/ports/agent_language_ports';
import { AgentCapabilityAdapter } from './agent_capability_adapter';

/** Infrastructure adapter for the read-only language capability. */
export class LanguageAgentAdapter extends AgentCapabilityAdapter implements LanguageQueryPort {
    async query(request: LanguageQueryRequest): Promise<string | Record<string, unknown> | undefined> {
        const options = request.options ?? {};
        const schemaName = options.schemaName ?? 'response';
        const promptText = buildAgentPrompt(
            request.prompt,
            options.expectJson ?? false,
            options.schema,
            schemaName,
        );
        if (!request.configuration) {
            logError('Missing required AI configuration for language capability.');
            return undefined;
        }
        return this.execute({
            configuration: request.configuration,
            prompt: promptText,
            capability: 'language',
            mapCliOutput: (output) => {
                if (options.expectJson && options.schema) return interpretFindingsResponse(output, options);
                return output;
            },
        });
    }
}
