import { APPLICATION_ERROR_METADATA, ApplicationError, type ApplicationErrorCode } from '../../errors/application_error';
import {
    buildApplicationErrorPresentation,
    renderApplicationErrorText,
} from '../application_error_presentation_policy';

const CORRELATION_ID = '6f173f89-96a3-4fc8-b90e-4f8f48e0e319';

describe('application error presentation policy', () => {
    it.each(Object.keys(APPLICATION_ERROR_METADATA) as ApplicationErrorCode[])(
        'renders the complete stable view for %s',
        (code) => {
            const error = new ApplicationError(code, 'Safe cause.', { correlationId: CORRELATION_ID });
            const view = buildApplicationErrorPresentation(error);
            const text = renderApplicationErrorText(error);

            expect(view).toEqual({
                impact: error.impact,
                cause: 'Safe cause.',
                code,
                action: error.action,
                retainedState: error.retainedState,
                reference: CORRELATION_ID,
            });
            expect(text).toBe([
                `Impact: ${error.impact}`,
                `Cause (${code}): Safe cause.`,
                `Action: ${error.action}`,
                `Retained state: ${error.retainedState}`,
                `Reference: ${CORRELATION_ID}`,
            ].join('\n'));
        },
    );
});
