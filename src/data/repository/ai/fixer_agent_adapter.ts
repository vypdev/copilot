import { logError } from '../../../utils/logger';
import type { FixerQueryPort, FixerQueryRequest } from '../../../application/ports/agent_fixer_ports';
import { AgentCapabilityAdapter } from './agent_capability_adapter';

export class FixerAgentAdapter extends AgentCapabilityAdapter implements FixerQueryPort {
    async fix(request: FixerQueryRequest): Promise<{ text: string; sessionId: string } | undefined> {
        if (!request.configuration) {
            logError('Missing required AI configuration for fixer.');
            return undefined;
        }
        return this.execute({
            configuration: request.configuration,
            prompt: request.prompt,
            capability: 'fixer',
            mapCliOutput: (text) => ({ text, sessionId: 'cli' }),
        });
    }
}
