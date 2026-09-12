import type { ApplicationError } from '../../data/model/application_error';

export interface ApplicationErrorPresentation {
    readonly impact: string;
    readonly cause: string;
    readonly code: string;
    readonly action: string;
    readonly retainedState: string;
    readonly reference: string;
}

/** Shared semantic view model for terminal, GitHub, and API presentation. */
export function buildApplicationErrorPresentation(error: ApplicationError): ApplicationErrorPresentation {
    return {
        impact: error.impact,
        cause: error.message,
        code: error.code,
        action: error.action,
        retainedState: error.retainedState,
        reference: error.correlationId,
    };
}

export function renderApplicationErrorText(error: ApplicationError): string {
    const view = buildApplicationErrorPresentation(error);
    return [
        `Impact: ${view.impact}`,
        `Cause (${view.code}): ${view.cause}`,
        `Action: ${view.action}`,
        `Retained state: ${view.retainedState}`,
        `Reference: ${view.reference}`,
    ].join('\n');
}
