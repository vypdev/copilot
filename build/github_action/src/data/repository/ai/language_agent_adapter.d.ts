import type { LanguageQueryPort, LanguageQueryRequest } from '../../../application/ports/agent_language_ports';
import { AgentCapabilityAdapter } from './agent_capability_adapter';
/** Infrastructure adapter for the read-only language capability. */
export declare class LanguageAgentAdapter extends AgentCapabilityAdapter implements LanguageQueryPort {
    query(request: LanguageQueryRequest): Promise<string | Record<string, unknown> | undefined>;
}
