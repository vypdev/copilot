import { logError } from '../../../utils/logger';
import { buildAgentPrompt } from '../agent_prompt_policy';
import { interpretFindingsResponse } from '../agent_findings_response_policy';
import type { FindingsQueryPort, FindingsQueryRequest } from '../../../application/ports/agent_findings_ports';
import { AgentCapabilityAdapter, type AgentCapabilityInfrastructure } from './agent_capability_adapter';

export class FindingsAgentAdapter extends AgentCapabilityAdapter implements FindingsQueryPort {
    constructor(infrastructure: AgentCapabilityInfrastructure) {
        super(infrastructure);
    }

    async query(request: FindingsQueryRequest): Promise<string | Record<string, unknown> | undefined> {
        const options = request.options ?? {};
        const schemaName = options.schemaName ?? 'response';
        const promptText = buildAgentPrompt(
            request.prompt,
            options.expectJson ?? false,
            options.schema,
            schemaName,
        );
        if (!request.configuration) {
            logError('Missing required AI configuration for findings.');
            return undefined;
        }
        return this.execute({
            configuration: request.configuration,
            prompt: promptText,
            capability: 'findings',
            mapCliOutput: (output) => {
                if (options.expectJson && options.schema) return interpretFindingsResponse(output, options);
                return output;
            },
        });
    }
}
