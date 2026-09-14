import {
    agentOutputLocaleFailureMessage,
    validateAgentOutputLocale,
} from '../../../policies/agent_output_locale_policy';
import { ApplicationError } from '../../../errors/application_error';

export function extractStructuredAnswer(response: unknown, targetLocale: string): string {
    if (response == null) return '';
    const validation = validateAgentOutputLocale(response, targetLocale);
    if (validation.kind === 'invalid') {
        throw new ApplicationError('locale.output-invalid', agentOutputLocaleFailureMessage(validation));
    }
    const answer = validation.payload.answer;
    return typeof answer === 'string' ? answer.trim() : '';
}
