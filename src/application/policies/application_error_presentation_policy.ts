import type {
    ApplicationErrorCode,
    ApplicationErrorRecovery,
} from '../../data/model/application_error';
import {
    readEnglishApplicationErrorMessage,
    type ApplicationErrorMessageReader,
} from './application_error_message_catalog';

export interface ApplicationErrorPresentation {
    readonly impact: string;
    readonly code: string;
    readonly action: string;
    readonly retainedState: string;
    readonly retryable: string;
    readonly reference: string;
}

export interface ApplicationErrorPresentationSource {
    readonly code: ApplicationErrorCode;
    readonly retryable: boolean;
    readonly correlationId: string;
    readonly recovery?: ApplicationErrorRecovery;
}

/** Shared semantic view model for terminal, GitHub, and API presentation. */
export function buildApplicationErrorPresentation(
    error: ApplicationErrorPresentationSource,
    message: ApplicationErrorMessageReader = readEnglishApplicationErrorMessage,
): ApplicationErrorPresentation {
    const descriptor = error.recovery
        ? `error.recovery.${error.recovery.id}` as const
        : `error.${error.code}` as const;
    const variables = error.recovery?.variables;
    return {
        impact: message(`${descriptor}.impact`, variables),
        code: error.code,
        action: message(`${descriptor}.action`, variables),
        retainedState: message(`${descriptor}.retainedState`, variables),
        retryable: message(error.retryable ? 'error.label.yes' : 'error.label.no'),
        reference: error.correlationId,
    };
}

export function renderApplicationErrorText(
    error: ApplicationErrorPresentationSource,
    message: ApplicationErrorMessageReader = readEnglishApplicationErrorMessage,
): string {
    const view = buildApplicationErrorPresentation(error, message);
    return [
        `${message('error.label.impact')}: ${view.impact}`,
        `${message('error.label.errorCode')}: ${view.code}`,
        `${message('error.label.action')}: ${view.action}`,
        `${message('error.label.retainedState')}: ${view.retainedState}`,
        `${message('error.label.retryable')}: ${view.retryable}`,
        `${message('error.label.reference')}: ${view.reference}`,
    ].join('\n');
}

/** Renders the same safe semantic failure as compact GitHub Markdown. */
export function renderApplicationErrorMarkdown(
    error: ApplicationErrorPresentationSource,
    message: ApplicationErrorMessageReader = readEnglishApplicationErrorMessage,
): string {
    const view = buildApplicationErrorPresentation(error, message);
    return [
        `> **${message('error.label.impact')}:** ${view.impact}`,
        '',
        `**${message('error.label.action')}:** ${view.action}`,
        '',
        `**${message('error.label.retainedState')}:** ${view.retainedState}`,
        '',
        `**${message('error.label.errorCode')}:** \`${view.code}\``,
        '',
        `**${message('error.label.retryable')}:** ${view.retryable}`,
        '',
        `**${message('error.label.reference')}:** \`${view.reference}\``,
    ].join('\n');
}
