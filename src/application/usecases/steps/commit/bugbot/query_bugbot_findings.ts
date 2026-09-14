import type { AgentConfiguration } from '../../../../../domain/agent';
import type { FindingsQueryPort } from '../../../../ports/agent_findings_ports';
import { AGENT_PLAN } from '../../../../../application/policies/agent_task_policy';
import { BUGBOT_RESPONSE_SCHEMA } from './schema';
import {
    agentOutputLocaleFailureMessage,
    productFacingAgentQueryOptions,
    validateAgentOutputLocale,
} from '../../../../policies/agent_output_locale_policy';
import { ApplicationError } from '../../../../errors/application_error';

export async function queryBugbotFindings(
    repository: FindingsQueryPort,
    configuration: Readonly<AgentConfiguration>,
    prompt: string,
    targetLocale: string,
): Promise<unknown> {
    const response = await repository.query({
        configuration,
        agentId: AGENT_PLAN,
        prompt,
        options: productFacingAgentQueryOptions('bugbot-review', BUGBOT_RESPONSE_SCHEMA),
    });
    if (response == null || typeof response !== 'object' || Array.isArray(response)) return response;
    const validation = validateAgentOutputLocale(response, targetLocale);
    if (validation.kind === 'invalid') {
        throw new ApplicationError('locale.output-invalid', agentOutputLocaleFailureMessage(validation));
    }
    return validation.payload;
}
