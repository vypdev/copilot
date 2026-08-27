import { logError } from '../../../utils/logger';
import { interpretFixerResponse } from '../agent_fixer_response_policy';
import type { FixerQueryPort, FixerQueryRequest } from '../../../application/ports/agent_fixer_ports';
import { AgentCapabilityAdapter, type AgentCapabilityInfrastructure } from './agent_capability_adapter';


const OPENCODE_AGENT_BUILD = 'build';

export class FixerAgentAdapter extends AgentCapabilityAdapter implements FixerQueryPort {

    constructor(infrastructure: AgentCapabilityInfrastructure) {
        super(infrastructure);
    }

    async fix(request: FixerQueryRequest): Promise<{ text: string; sessionId: string } | undefined> {
        if (!request.configuration) {
            logError('Missing required AI configuration for fixer.');
            return undefined;
        }
        return this.execute({
            configuration: request.configuration,
            prompt: request.prompt,
            agent: OPENCODE_AGENT_BUILD,
            capability: 'fixer',
            mapCliOutput: (text) => ({ text, sessionId: 'cli' }),
            mapServerResponse: (result) => interpretFixerResponse(result.parts, result.sessionId),
        });
    }
}
