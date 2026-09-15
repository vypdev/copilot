import {
    APPLICATION_ERROR_METADATA,
    APPLICATION_ERROR_RECOVERY_IDS,
    ApplicationError,
    type ApplicationErrorCode,
    type ApplicationErrorRecovery,
} from '../../errors/application_error';
import {
    buildApplicationErrorPresentation,
    renderApplicationErrorText,
} from '../application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../application_error_message_catalog';

const CORRELATION_ID = '6f173f89-96a3-4fc8-b90e-4f8f48e0e319';

const RECOVERY_CASES: readonly Readonly<{
    recovery: ApplicationErrorRecovery;
    english: string;
    spanish: string;
}>[] = [
    {
        recovery: { id: 'pull-request-link-restored', variables: {} },
        english: 'The original pull-request base and description were restored.',
        spanish: 'Se restauraron la rama base y la descripción originales de la pull request.',
    },
    {
        recovery: { id: 'pull-request-link-base-retained', variables: {} },
        english: 'The temporary default base branch remains; the original description was restored.',
        spanish: 'La rama base predeterminada temporal permanece; se restauró la descripción original.',
    },
    {
        recovery: { id: 'pull-request-link-reference-retained', variables: {} },
        english: 'The original base branch was restored; the temporary issue reference remains in the description.',
        spanish: 'Se restauró la rama base original; la referencia temporal a la issue permanece en la descripción.',
    },
    {
        recovery: { id: 'pull-request-link-base-and-reference-retained', variables: {} },
        english: 'The temporary default base branch and issue reference remain.',
        spanish: 'La rama base predeterminada temporal y la referencia a la issue permanecen.',
    },
    {
        recovery: {
            id: 'managed-branch-enrichment-failed',
            variables: { branchName: 'feature/42-localized-errors' },
        },
        english: 'Branch feature/42-localized-errors and its configuration patch were preserved.',
        spanish: 'Se conservaron la rama feature/42-localized-errors y su parche de configuración.',
    },
    {
        recovery: { id: 'inactivity-explanation-failed', variables: { issueNumber: 42 } },
        english: 'Issue #42 remains closed; the completed close will not be repeated.',
        spanish: 'La issue #42 permanece cerrada; el cierre completado no se repetirá.',
    },
];

describe('application error presentation policy', () => {
    it.each(Object.keys(APPLICATION_ERROR_METADATA) as ApplicationErrorCode[])(
        'renders the complete stable view for %s',
        (code) => {
            const error = new ApplicationError(code, 'Safe cause.', { correlationId: CORRELATION_ID });
            const view = buildApplicationErrorPresentation(error);
            const text = renderApplicationErrorText(error);

            expect(view).toEqual({
                impact: error.impact,
                code,
                action: error.action,
                retainedState: error.retainedState,
                retryable: error.retryable ? 'Yes' : 'No',
                reference: CORRELATION_ID,
            });
            expect(text).toBe([
                `Impact: ${error.impact}`,
                `Error code: ${code}`,
                `Action: ${error.action}`,
                `Retained state: ${error.retainedState}`,
                `Retryable: ${error.retryable ? 'Yes' : 'No'}`,
                `Reference: ${CORRELATION_ID}`,
            ].join('\n'));
            expect(text).not.toContain('Safe cause.');
        },
    );

    it.each(Object.keys(APPLICATION_ERROR_METADATA) as ApplicationErrorCode[])(
        'renders every %s recovery view atomically in Spanish',
        (code) => {
            const error = new ApplicationError(code, 'English producer message.', { correlationId: CORRELATION_ID });
            const catalog = resolveStaticApplicationErrorCatalog('es-MX');
            const text = renderApplicationErrorText(error, catalog.message);

            expect(text).toContain(`Código de error: ${code}`);
            expect(text).toContain('Impacto:');
            expect(text).toContain('Acción:');
            expect(text).toContain('Estado conservado:');
            expect(text).toContain('Reintentable:');
            expect(text).toContain(`Referencia: ${CORRELATION_ID}`);
            expect(text).not.toContain('English producer message.');
            expect(text).not.toContain('Impact:');
            expect(catalog.resolutionSource).toBe('base');
        },
    );

    it.each(RECOVERY_CASES)(
        'preserves and localizes recovery variant $recovery.id',
        ({ recovery, english, spanish }) => {
            const error = new ApplicationError('provider.unavailable', 'Producer message.', {
                correlationId: CORRELATION_ID,
                recovery,
            });

            expect(buildApplicationErrorPresentation(error).retainedState).toBe(english);
            expect(buildApplicationErrorPresentation(
                error,
                resolveStaticApplicationErrorCatalog('es-ES').message,
            ).retainedState).toBe(spanish);
        },
    );

    it('covers every closed recovery variant exactly once', () => {
        expect(RECOVERY_CASES.map(({ recovery }) => recovery.id).sort())
            .toEqual([...APPLICATION_ERROR_RECOVERY_IDS].sort());
    });
});
