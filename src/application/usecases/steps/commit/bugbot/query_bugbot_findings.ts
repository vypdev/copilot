import { BugbotVerificationResponseFailure } from '../../../../errors/bugbot_verification_response_failure';
import { BugbotResponseFailure } from '../../../../../domain/bugbot/response_failure';
import { BugbotReviewCompletenessError, type BugbotFramedAssignment } from '../../../../../domain/bugbot/framed_review';
import { matchesBugbotFramedReceipt } from '../../../../policies/bugbot_framed_receipt_policy';
import type { AgentConfiguration } from '../../../../../domain/agent';
import type { FindingsQueryRequest, FindingsQueryPort } from '../../../../ports/agent_findings_ports';
import { AGENT_PLAN } from '../../../../../application/policies/agent_task_policy';
import { buildBugbotPartitionResponseSchema, BUGBOT_RESPONSE_SCHEMA } from './schema';
import {
    agentOutputLocaleFailureMessage,
    productFacingAgentQueryOptions,
    validateAgentOutputLocale,
} from '../../../../policies/agent_output_locale_policy';
import { ApplicationError } from '../../../../errors/application_error';
import { logInfo } from '../../../../ports/logging_ports';

import { verifyGeneratedLiteralFindings } from './verify_generated_literal_findings';

export interface BugbotLiteralVerificationOptions {
    readonly enabled: boolean;
    readonly observePrompt?: (prompt: string) => void;
    readonly observeResponse?: (response: unknown) => void;
}

const MAX_PARTITION_QUERY_ATTEMPTS = 3;

function bugbotQueryOptions(schema: Readonly<Record<string, unknown>>) {
    return productFacingAgentQueryOptions('bugbot-review', schema);
}

export async function queryBugbotFindings(
    repository: FindingsQueryPort,
    configuration: Readonly<AgentConfiguration>,
    prompt: string,
    targetLocale: string,
    verification?: BugbotLiteralVerificationOptions,
): Promise<unknown> {
    const response = await repository.query({
        configuration,
        agentId: AGENT_PLAN,
        prompt,
        options: bugbotQueryOptions(BUGBOT_RESPONSE_SCHEMA),
    });
    verification?.observeResponse?.(response);
    if (response == null || typeof response !== 'object' || Array.isArray(response)) {
        return verification?.enabled ? verifyGeneratedLiteralFindings(repository, configuration, prompt, response, targetLocale, verification.observePrompt, verification.observeResponse) : response;
    }
    const validation = validateAgentOutputLocale(response, targetLocale);
    if (validation.kind === 'invalid') {
        throw new ApplicationError('locale.output-invalid', agentOutputLocaleFailureMessage(validation));
    }
    return verification?.enabled
        ? verifyGeneratedLiteralFindings(repository, configuration, prompt, validation.payload, targetLocale, verification.observePrompt, verification.observeResponse)
        : validation.payload;
}

export interface BugbotPartitionAttestation {
    readonly framed?: BugbotFramedAssignment;
    readonly partitionId: string;
    readonly headSha: string;
}

/** Shared by whole-plan preflight and the actual identical partition queries. */
export function buildBugbotPartitionQueryRequest(configuration: Readonly<AgentConfiguration>, prompt: string,
    expected: BugbotPartitionAttestation): FindingsQueryRequest {
    return { configuration, agentId: AGENT_PLAN, prompt,
        options: bugbotQueryOptions(buildBugbotPartitionResponseSchema(expected)) };
}

/** Queries one immutable diff partition and rejects stale, replayed, or malformed attestations. */
export async function queryBugbotPartitionFindings(
    repository: FindingsQueryPort,
    configuration: Readonly<AgentConfiguration>,
    prompt: string,
    targetLocale: string,
    expected: BugbotPartitionAttestation,
    verification?: BugbotLiteralVerificationOptions,
): Promise<Readonly<Record<string, unknown>>> {
    for (let attempt = 1; attempt <= MAX_PARTITION_QUERY_ATTEMPTS; attempt += 1) {
        try {
            if (attempt > 1) verification?.observePrompt?.(prompt);
            const response = await repository.query(buildBugbotPartitionQueryRequest(configuration, prompt, expected));
            verification?.observeResponse?.(response);
            const validation = validateAgentOutputLocale(response, targetLocale);
            if (validation.kind === 'invalid') {
                throw new ApplicationError('locale.output-invalid', agentOutputLocaleFailureMessage(validation));
            }
            if (validation.payload.partition_id !== expected.partitionId
                || validation.payload.reviewed_head_sha !== expected.headSha
                || (expected.framed && !matchesBugbotFramedReceipt(expected.framed, validation.payload))) {
                if (expected.framed) throw new BugbotReviewCompletenessError('receipt');
                throw new ApplicationError(
                    'agent.failed',
                    `Configured agent returned an invalid Bugbot partition attestation for ${expected.partitionId}.`,
                );
            }
            return verification?.enabled
                ? await verifyGeneratedLiteralFindings(repository, configuration, prompt, validation.payload, targetLocale, verification.observePrompt, verification.observeResponse) as Readonly<Record<string, unknown>>
                : validation.payload;
        } catch (error) {
            if (attempt === MAX_PARTITION_QUERY_ATTEMPTS && (error instanceof BugbotResponseFailure || error instanceof BugbotVerificationResponseFailure)) {
                throw new ApplicationError('agent.failed', 'The completed Bugbot partition responses failed completed-response validation after three attempts.',
                    { retryable: false, recovery: { id: 'bugbot-partition-query-exhausted', variables: { reason: error.reason, attempts: 3 } } });
            }
            if (attempt === MAX_PARTITION_QUERY_ATTEMPTS || (error instanceof BugbotReviewCompletenessError && error.facts.resource !== 'receipt')) throw error;
            logInfo(`Bugbot reviewer retrying one partition query (${attempt + 1}/${MAX_PARTITION_QUERY_ATTEMPTS}) after unusable agent output.`);
        }
    }
    throw new ApplicationError('agent.failed', 'Bugbot partition query exhausted its bounded attempts.');
}
