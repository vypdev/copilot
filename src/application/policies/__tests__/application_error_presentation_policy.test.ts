import { COPILOT_COMMAND_VALIDATION_REASONS } from '../../../domain/copilot_command_validation';
import {
    APPLICATION_ERROR_METADATA,
    APPLICATION_ERROR_RECOVERY_IDS,
    ApplicationError,
    type ApplicationErrorCode,
    type ApplicationErrorRecovery,
} from '../../errors/application_error';
import {
    buildApplicationErrorPresentation,
    renderApplicationErrorMarkdown,
    renderApplicationErrorText,
} from '../application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../application_error_message_catalog';

const CORRELATION_ID = '6f173f89-96a3-4fc8-b90e-4f8f48e0e319';

const RECOVERY_CASES: readonly Readonly<{
    recovery: ApplicationErrorRecovery;
    english: string;
    spanish: string;
}>[] = [
    ...COPILOT_COMMAND_VALIDATION_REASONS.map(id => ({
        recovery: { id, variables: { command: id.startsWith('comment-command-review-') ? 'review' as const
            : id.startsWith('comment-command-sync-') ? 'sync-branch' as const
                : id === 'comment-command-arguments-unexpected' ? 'status' as const
                    : id === 'comment-command-arguments-missing' || id === 'comment-command-finding-quoting' ? 'fix' as const : 'help' as const } },
        english: 'No command action ran. Existing files, branches and reviews were preserved.',
        spanish: 'No se ejecutó ninguna acción del comando. Se conservaron los archivos, las ramas y las revisiones existentes.',
    })),
    ...(['sdd-draft-case-identity-invalid', 'sdd-draft-case-budget-invalid', 'sdd-draft-requirement-mapping-invalid', 'sdd-draft-repository-path-invalid'] as const).map(id => ({
        recovery: { id, variables: {} },
        english: 'Existing answers and published SDDs were preserved; no draft was published. Publication checks do not establish runtime acceptance.',
        spanish: 'Se conservaron las respuestas y los SDD publicados; no se publicó ningún borrador. Estas comprobaciones no demuestran la aceptación en ejecución.',
    })),
    ...(['stored-configuration-schema-missing', 'stored-configuration-schema-unsupported', 'stored-configuration-invalid'] as const).map(id => ({
        recovery: id === 'stored-configuration-schema-unsupported'
            ? { id, variables: { issueNumber: 144, expectedVersion: 3, actualVersion: 2 } }
            : { id, variables: { issueNumber: 144, expectedVersion: 3 } },
        english: 'The issue/PR description and stored configuration were not changed by this read.',
        spanish: 'Esta lectura no modificó la descripción de la issue/PR ni su configuración almacenada.',
    })),
    {
        recovery: { id: 'closed-issue-reconciliation-failed', variables: { resultId: 'RetireProgressUseCase', phase: 'card-verification', state: 'closed', reason: 'completed', changed: 1, remaining: 1 } },
        english: 'Native state was preserved. Confirmed changes: 1; remaining required changes in the last verified plan: 1. Unavailable reads do not establish completion.',
        spanish: 'Se conservó el estado nativo. Cambios confirmados: 1; cambios pendientes en el último plan verificado: 1. Una lectura no disponible no demuestra que haya finalizado.',
    },
    {
        recovery: { id: 'approval-evidence-read-failed', variables: { operation: 'jobs', reason: 'http-403', permission: 'actions-read' } },
        english: 'No approval is authorized by this failed read. Existing PRs, reviews and completed external effects were preserved.',
        spanish: 'Esta lectura fallida no autoriza ninguna aprobación. Se conservaron las PRs, revisiones y efectos externos completados.',
    },
    {
        recovery: { id: 'branch-sync-resolution-invalid', variables: { validationCode: 'sdd-catalog-invalid', command: '/copilot sync-branch' } },
        english: 'No synchronization commit was pushed; remote branches were preserved.',
        spanish: 'No se publicó ningún commit de sincronización; se conservaron las ramas remotas.',
    },
    {
        recovery: { id: 'sdd-catalog-unsupported-profile', variables: {} },
        english: 'The repository catalog, answers and published SDDs remain unchanged; no specification or branch was published by this attempt.',
        spanish: 'El catálogo, las respuestas y los SDD publicados permanecen intactos; este intento no publicó ninguna especificación ni rama.',
    },
    {
        recovery: { id: 'sdd-catalog-format-invalid', variables: {} },
        english: 'The source catalog, answers and published SDDs remain unchanged; no automatic catalog conversion was attempted.',
        spanish: 'El catálogo de origen, las respuestas y los SDD publicados permanecen intactos; no se intentó convertir el catálogo automáticamente.',
    },
    {
        recovery: { id: 'sdd-draft-format-invalid', variables: {} },
        english: 'Existing answers and published SDDs were preserved; no draft was published.',
        spanish: 'Se conservaron las respuestas y los SDD publicados; no se publicó ningún borrador.',
    },
    {
        recovery: { id: 'sdd-draft-size-exceeded', variables: {} },
        english: 'Existing answers and published SDDs were preserved; no draft was published.',
        spanish: 'Se conservaron las respuestas y los SDD publicados; no se publicó ningún borrador.',
    },
    {
        recovery: { id: 'branch-sync-agent-disabled', variables: { command: '/copilot sync-branch' } },
        english: 'No synchronization commit was pushed; remote branches were preserved.',
        spanish: 'No se publicó ningún commit de sincronización; se conservaron las ramas remotas.',
    },
    {
        recovery: { id: 'branch-sync-fixer-unavailable', variables: { command: '/copilot sync-branch' } },
        english: 'No synchronization commit was pushed; remote branches were preserved.',
        spanish: 'No se publicó ningún commit de sincronización; se conservaron las ramas remotas.',
    },
    {
        recovery: { id: 'workspace-changes-rejected', variables: {} },
        english: 'The normal commit and push steps were skipped. Verify the current state before retrying.',
        spanish: 'Se omitieron los pasos normales de commit y push. Comprueba el estado actual antes de reintentar.',
    },
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
    {
        recovery: { id: 'bugbot-review-blocks-pending', variables: { pendingCount: 22 } },
        english: 'The completed analysis and successful review updates were preserved.',
        spanish: 'Se conservaron el análisis completado y las actualizaciones de revisión correctas.',
    },
];

describe('application error presentation policy', () => {
    it.each(['en-US', 'es-ES'])('explains missing evidence as nonretryable with retained progress in %s', locale => {
        const error = new ApplicationError('validation.evidence-unavailable', 'Omitted patch.', { correlationId: CORRELATION_ID });
        const catalog = resolveStaticApplicationErrorCatalog(locale);
        const text = renderApplicationErrorText(error, catalog.message);
        expect(text).toContain('validation.evidence-unavailable');
        expect(text).toContain(locale === 'es-ES' ? 'Reintentable: No' : 'Retryable: No');
        expect(text).toContain(locale === 'es-ES' ? 'No se evaluó el progreso' : 'Progress was not assessed');
        expect(text).toContain(locale === 'es-ES' ? 'Se conservaron las etiquetas' : 'Existing progress labels');
        expect(text).not.toContain(locale === 'es-ES' ? 'temporalmente' : 'temporarily');
    });

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

    it('renders the exact pending-review count without alleging provider unavailability', () => {
        const error = new ApplicationError('workflow.presentation-pending', 'Internal detail.', {
            correlationId: CORRELATION_ID,
            recovery: { id: 'bugbot-review-blocks-pending', variables: { pendingCount: 22 } },
        });
        const english = renderApplicationErrorText(error);
        const spanish = renderApplicationErrorText(
            error, resolveStaticApplicationErrorCatalog('es-ES').message,
        );
        expect(english).toContain('22 historical review status blocks remain pending');
        expect(spanish).toContain('quedan 22 bloques de estado');
        expect(english).not.toContain('The provider was temporarily unavailable');
        expect(spanish).not.toContain('El proveedor no estaba disponible');
    });

    it('renders compact GitHub Markdown from semantic fields without producer prose', () => {
        const error = new ApplicationError('provider.unavailable', 'Raw provider detail.', {
            correlationId: CORRELATION_ID,
        });
        const markdown = renderApplicationErrorMarkdown(
            error,
            resolveStaticApplicationErrorCatalog('es-ES').message,
        );

        expect(markdown).toContain('> **Impacto:** El proveedor no estaba disponible temporalmente.');
        expect(markdown).toContain('**Código de error:** `provider.unavailable`');
        expect(markdown).toContain(`**Referencia:** \`${CORRELATION_ID}\``);
        expect(markdown).not.toContain('Raw provider detail.');
        expect(renderApplicationErrorMarkdown(error)).toContain(
            '> **Impact:** The provider was temporarily unavailable.',
        );
    });
});


it.each([['en-US', 'workspace verification', 'configured agent was not started'], ['es-ES', 'verificación del espacio de trabajo', 'agente configurado no se inició']])('reports the actual postflight stage in %s without an unstarted-agent claim', (locale, stage, wrongStage) => {
    const { ApplicationError } = require('../../errors/application_error');
    const { renderApplicationErrorMarkdown } = require('../application_error_presentation_policy');
    const { resolveStaticApplicationErrorCatalog } = require('../application_error_message_catalog');
    const error = new ApplicationError('workflow.failed', 'PRIVATE-PATH', { retryable: false, recovery: { id: 'workspace-changes-rejected', variables: {} } });
    const body = renderApplicationErrorMarkdown(error, resolveStaticApplicationErrorCatalog(locale).message);
    expect(body).toContain(stage); expect(body).not.toContain(wrongStage); expect(body).not.toContain('PRIVATE-PATH');
});
