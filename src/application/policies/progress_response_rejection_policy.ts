import { isProgressScopeCapacityFacts, type ProgressScopeCapacityFacts } from '../../domain/progress_response_diagnostic';
import { validateAgentOutputLocale, agentOutputLocaleFailureMessage } from './agent_output_locale_policy';
import type { ProgressResponsePhase } from '../../domain/progress_response_diagnostic';
import { ApplicationError } from '../errors/application_error';
import { isProgressResponseDiagnosticFacts, type ProgressResponseDiagnosticFacts } from '../../domain/progress_response_diagnostic';

export function progressResponseRejected(facts: ProgressResponseDiagnosticFacts, code: 'agent.failed' | 'locale.output-invalid' = 'agent.failed'): ApplicationError {
    if (!isProgressResponseDiagnosticFacts(facts)) throw new TypeError('Progress response diagnostic is invalid.');
    return new ApplicationError(code,
        `Progress ${facts.phase} result was rejected (${facts.reason}; field ${facts.field}; requirement ${facts.requirementId}; source ${facts.sourceLineId}). Existing progress was retained.`,
        { recovery: { id: 'progress-result-contract-invalid', variables: facts } });
}

/** An absent result retains its original code without claiming completed output. */
export function progressResponsePayload(response: unknown, locale: string, phase: ProgressResponsePhase,
    code: 'agent.failed' | 'locale.output-invalid' = 'locale.output-invalid'): Readonly<Record<string, unknown>> {
    const validation = validateAgentOutputLocale(response, locale);
    if (validation.kind === 'valid') return validation.payload;
    if (response === undefined) throw new ApplicationError(code, agentOutputLocaleFailureMessage(validation));
    throw progressResponseRejected({ phase, reason: validation.reason,
        field: validation.reason === 'response-not-object' ? '$' : '$.outputLocale', requirementId: 'none', sourceLineId: 'none' }, code);
}


export function progressScopeCapacityRejected(facts: ProgressScopeCapacityFacts): ApplicationError {
    if (!isProgressScopeCapacityFacts(facts)) throw new TypeError('Progress scope capacity diagnostic is invalid.');
    return new ApplicationError('agent.failed',
        `Progress scope result was rejected (scope-clause-limit; ${facts.clauseKind}: ${facts.observed}; limit ${facts.limit}; source ${facts.sourceLineId}). Existing progress was retained.`,
        { recovery: { id: 'progress-scope-clause-limit', variables: facts } });
}
