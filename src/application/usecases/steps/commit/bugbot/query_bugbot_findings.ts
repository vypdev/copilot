import type { AgentConfiguration } from '../../../../../domain/agent';
import type { FindingsQueryPort } from '../../../../ports/agent_findings_ports';
import { AGENT_PLAN } from '../../../../../application/policies/agent_task_policy';
import { buildBugbotPartitionResponseSchema, BUGBOT_RESPONSE_SCHEMA } from './schema';
import {
    agentOutputLocaleFailureMessage,
    productFacingAgentQueryOptions,
    validateAgentOutputLocale,
} from '../../../../policies/agent_output_locale_policy';
import { ApplicationError } from '../../../../errors/application_error';
import { logInfo } from '../../../../ports/logging_ports';

const MAX_PARTITION_QUERY_ATTEMPTS = 3;

function bugbotQueryOptions(schema: Readonly<Record<string, unknown>>) {
    return productFacingAgentQueryOptions('bugbot-review', schema);
}

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
        options: bugbotQueryOptions(BUGBOT_RESPONSE_SCHEMA),
    });
    if (response == null || typeof response !== 'object' || Array.isArray(response)) return response;
    const validation = validateAgentOutputLocale(response, targetLocale);
    if (validation.kind === 'invalid') {
        throw new ApplicationError('locale.output-invalid', agentOutputLocaleFailureMessage(validation));
    }
    return validation.payload;
}

export interface BugbotPartitionAttestation {
    readonly partitionId: string;
    readonly headSha: string;
}

/** Queries one immutable diff partition and rejects stale, replayed, or malformed attestations. */
export async function queryBugbotPartitionFindings(
    repository: FindingsQueryPort,
    configuration: Readonly<AgentConfiguration>,
    prompt: string,
    targetLocale: string,
    expected: BugbotPartitionAttestation,
): Promise<Readonly<Record<string, unknown>>> {
    const schema = buildBugbotPartitionResponseSchema(expected);
    for (let attempt = 1; attempt <= MAX_PARTITION_QUERY_ATTEMPTS; attempt += 1) {
        try {
            const response = await repository.query({
                configuration,
                agentId: AGENT_PLAN,
                prompt,
                options: bugbotQueryOptions(schema),
            });
            const validation = validateAgentOutputLocale(response, targetLocale);
            if (validation.kind === 'invalid') {
                throw new ApplicationError('locale.output-invalid', agentOutputLocaleFailureMessage(validation));
            }
            if (validation.payload.partition_id !== expected.partitionId
                || validation.payload.reviewed_head_sha !== expected.headSha) {
                throw new ApplicationError(
                    'agent.failed',
                    `Configured agent returned an invalid Bugbot partition attestation for ${expected.partitionId}.`,
                );
            }
            return validation.payload;
        } catch (error) {
            if (attempt === MAX_PARTITION_QUERY_ATTEMPTS) throw error;
            logInfo(`Bugbot reviewer retrying one partition query (${attempt + 1}/${MAX_PARTITION_QUERY_ATTEMPTS}) after unusable agent output.`);
        }
    }
    throw new ApplicationError('agent.failed', 'Bugbot partition query exhausted its bounded attempts.');
}
