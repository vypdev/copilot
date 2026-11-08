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
    {"recovery": {"id": "branch-sync-sensitive-paths", "variables": {"command": "/copilot sync-branch", "conflictCount": 10, "sensitiveCount": 1}}, "english": "No fixer, repository verifier or synchronization push was invoked; existing remote heads were preserved.", "spanish": "No se invocaron el agente corrector, los verificadores del repositorio ni la publicación de sincronización; se conservaron las referencias remotas."},
    {"recovery": {"id": "branch-sync-conflict-limit", "variables": {"command": "/copilot sync-branch", "conflictCount": 21, "limit": 20}}, "english": "No fixer, repository verifier or synchronization push was invoked; existing remote heads were preserved.", "spanish": "No se invocaron el agente corrector, los verificadores del repositorio ni la publicación de sincronización; se conservaron las referencias remotas."},
    {"recovery": {"id": "bugbot-freshness-before-publication", "variables": {"operation": "get-head-sha", "providerStatus": "http-403", "providerReference": "AB12:CD34", "reason": "provider-request-failed"}}, "english": "This evaluation published no new finding mutations. Prior findings and resolutions were retained; no passing current review was authorized.", "spanish": "Esta evaluación no publicó cambios nuevos en los findings. Se conservaron los hallazgos y resoluciones anteriores; no se autorizó una revisión actual aprobada."},
    {"recovery": {"id": "bugbot-freshness-after-publication", "variables": {"operation": "get-head-sha", "providerStatus": "http-503", "providerReference": "unavailable", "reason": "provider-request-failed"}}, "english": "Finding mutations may already have completed. Existing effects were retained; this evaluation did not authorize a passing current review or repeat publication.", "spanish": "Es posible que ya se hayan completado cambios en los findings. Se conservaron los efectos existentes; esta evaluación no autorizó una revisión actual aprobada ni la repetición de publicaciones."},
    { recovery: { id: 'progress-evidence-capacity-exceeded', variables: { phase: 'source', dimension: 'source-unit-bytes', unit: 'bytes', bound: 'maximum', observedCount: 256001, supportedLimit: 256000, countKind: 'exact', context: { kind: 'unavailable' } } },
      english: 'Existing progress labels and assessments were preserved. No partial progress was published; independent completed workflow effects remain in their own results.',
      spanish: 'Se conservaron las etiquetas de progreso y las evaluaciones. No se publicó progreso parcial; los efectos independientes completados conservan sus propios resultados.' },
    { recovery: { id: 'sdd-draft-response-too-short', variables: { minimum: 1800, observed: 'unavailable', attempts: 1 } },
      english: 'Existing answers, selected ownership and published specifications were retained; this attempt published no specification or branch.',
      spanish: 'Se conservaron las respuestas, la propiedad seleccionada y las especificaciones publicadas; este intento no publicó ninguna especificación ni rama.' },
    { recovery: { id: 'issue-assignment-count-invalid', variables: {} },
      english: 'No assignment operation was attempted. Independent completed lifecycle effects are retained in their own results.',
      spanish: 'No se intentó ninguna operación de asignación. Los efectos independientes completados se conservan en sus propios resultados.' },
    { recovery: { id: 'issue-assignment-failed', variables: { targetNumber: 17, desiredCount: 2, stage: 'lookup-members', operation: 'list-teams', providerStatus: 'http-503', assigneeRead: 'verified', observedAssignees: 0, confirmedAssignments: 0, remainingAssignments: 2, mutation: 'not-attempted' } },
      english: 'Verified new assignments: 0. Remaining target count: 2. Current assignee read: verified. Assignment write: not attempted. Independent completed lifecycle effects are retained in their own results.',
      spanish: 'Asignaciones nuevas verificadas: 0. Objetivo pendiente: 2. Lectura de personas asignadas: verificada. Escritura de asignaciones: no intentada. Los efectos independientes completados se conservan en sus propios resultados.' },
    { recovery: { id: 'branch-sync-workflow-write-required', variables: { reason: 'workflow-write-required', remoteState: 'unchanged', originalSha: 'a'.repeat(40), candidateSha: 'b'.repeat(40), observedSha: 'a'.repeat(40), pushAttempted: true } },
      english: `The local merge commit step finished; candidate identity: ${'b'.repeat(40)}. A normal push was attempted. The observed remote still points to the original head; the candidate was not observed as published. Original head: ${'a'.repeat(40)}; observed head: ${'a'.repeat(40)}. Recovery did not reset or abort the committed workspace; runner-local storage is temporary.`,
      spanish: `Terminó el paso de commit del merge local; identidad del candidato: ${'b'.repeat(40)}. Se intentó un push normal. El remoto observado conserva el head original; no se observó la publicación del candidato. Head original: ${'a'.repeat(40)}; head observado: ${'a'.repeat(40)}. La recuperación no restableció ni abortó el espacio de trabajo confirmado; el almacenamiento del runner es temporal.` },
    { recovery: { id: 'branch-sync-publication-failed', variables: { reason: 'push-failed', remoteState: 'unchanged', originalSha: 'a'.repeat(40), candidateSha: 'b'.repeat(40), observedSha: 'a'.repeat(40), pushAttempted: true } },
      english: `The local merge commit step finished; candidate identity: ${'b'.repeat(40)}. A normal push was attempted. The observed remote still points to the original head; the candidate was not observed as published. Original head: ${'a'.repeat(40)}; observed head: ${'a'.repeat(40)}. Recovery did not reset or abort the committed workspace; runner-local storage is temporary.`,
      spanish: `Terminó el paso de commit del merge local; identidad del candidato: ${'b'.repeat(40)}. Se intentó un push normal. El remoto observado conserva el head original; no se observó la publicación del candidato. Head original: ${'a'.repeat(40)}; head observado: ${'a'.repeat(40)}. La recuperación no restableció ni abortó el espacio de trabajo confirmado; el almacenamiento del runner es temporal.` },
    { recovery: { id: 'sdd-source-context-unavailable', variables: { sourceCommit: 'a'.repeat(40), phase: 'analysis', reason: 'object-unavailable' } },
      english: 'The canonical checkout, existing answers, published SDDs and linked branch were retained; this attempt published no specification or branch.',
      spanish: 'Se conservaron el checkout canónico, las respuestas, los SDD publicados y la rama enlazada; este intento no publicó ninguna especificación ni rama.' },
    { recovery: { id: 'progress-partition-length-invalid', variables: { partitionId: 'part-7', filePath: 'src/example.ts', unitId: 'unit-21', field: '$.files[0].implemented', maximum: 600, observed: 618 } },
      english: 'Existing progress labels and assessments were preserved. No partial percentage or passing verification was published; execution and optional check-publication failures remain separate.',
      spanish: 'Se conservaron las etiquetas y evaluaciones de progreso. No se publicó ningún porcentaje parcial ni verificación aprobada; los fallos de ejecución y de publicación del check opcional siguen siendo independientes.' },
    { recovery: { id: 'progress-partition-bytes-invalid', variables: { partitionId: 'part-7', filePath: 'src/example.ts', unitId: 'unit-21', field: '$.files[0].implemented', maximum: 678, observed: 700 } },
      english: 'Prior progress labels and assessments were preserved. No partial percentage or passing verification was published; source freshness, review and coverage remain independent gates.',
      spanish: 'Se conservaron las etiquetas y evaluaciones anteriores. No se publicó un porcentaje parcial ni una verificación aprobada; los controles de fuente vigente, revisión y cobertura siguen siendo independientes.' },
    { recovery: { id: 'progress-assessment-length-invalid', variables: { requirementId: 'R11', sourceLineId: 'L11', field: '$.requirements[0].remaining', maximum: 54, observed: 62 } },
      english: 'Existing progress labels and published assessments were preserved. No partial percentage was published. Verification, review, coverage and approval remain independent gates.',
      spanish: 'Se conservaron las etiquetas de progreso y las evaluaciones publicadas. No se publicó ningún porcentaje parcial. Verificación, revisión, cobertura y aprobación siguen siendo controles independientes.' },
    { recovery: { id: 'bugbot-partition-query-exhausted', variables: { reason: 'schema-string-long', attempts: 3 } },
      english: 'Prior findings and resolutions were preserved. No partial review was published. Source freshness and complete-review gates remain required.',
      spanish: 'Se conservaron los hallazgos y resoluciones anteriores. No se publicó una revisión parcial. Siguen siendo obligatorios los controles de fuente vigente y revisión completa.' },
    { recovery: { id: 'bugbot-review-incomplete', variables: { profile: 'framed-v1', countKind: 'exact', resource: 'rawUtf16', observed: 8192001, limit: 8192000, unit: 'UTF-16 code units' } },
      english: 'Existing findings and resolution state were retained. This run published no partial findings or clean review; a fresh run must validate the complete current source.',
      spanish: 'Se conservaron los findings y su estado de resolución. Este intento no publicó findings parciales ni una revisión limpia; un nuevo intento debe validar toda la fuente actual.' },
    { recovery: { id: 'progress-batch-retained', variables: { reason: 'evidence-missing', verified: 2, expected: 3, batch: 3, requirementId: 'R17' } },
      english: 'Existing progress labels and published assessments were preserved. No partial percentage was authorized.',
      spanish: 'Se conservaron las etiquetas y evaluaciones de progreso anteriores. No se autorizó un porcentaje parcial.' },
    { recovery: { id: 'progress-sdd-seed-unverified', variables: {} },
      english: 'Existing progress was retained.',
      spanish: 'Se conservó el progreso anterior.' },
    { recovery: { id: 'progress-scope-clause-limit', variables: { clauseKind: 'required-or-uncertain', observed: 33, limit: 32, sourceLineId: 'L41' } },
      english: 'Existing progress labels and published assessments were preserved. No partial assessment or passing verification is authorized.',
      spanish: 'Se conservaron las etiquetas de progreso y las evaluaciones publicadas. No se autoriza ninguna evaluación parcial ni verificación aprobada.' },
    { recovery: { id: 'progress-inventory-incomplete', variables: { profile: 'immutable-tree-v1', reason: 'file-count', observedCount: 1025, supportedLimit: 1024, countKind: 'at-least', paths: '["src/a"]' } },
      english: 'Existing progress was retained. No partial assessment or progress publication was accepted. Build, review, coverage and approval remain independent gates.',
      spanish: 'Se conservó el progreso existente. No se aceptó ninguna evaluación parcial ni publicación del progreso. Build, revisión, cobertura y aprobación siguen siendo controles independientes.' },
    {
        recovery: { id: 'branch-sync-catalog-incompatible', variables: { phase: 'profile-compatibility', profile: 'legacy-evidence', field: 'workflows', capabilityNumber: 1, abort: 'completed' } },
        english: 'No synchronization commit or push was attempted; remote branches were preserved. Local abort: completed. completed means the abort call finished; unverified requires operator inspection. This result does not certify application readiness.',
        spanish: 'No se intentó crear ni subir un commit de sincronización; se conservaron las ramas remotas. Aborto local: completed. completed indica que terminó la llamada de aborto; unverified exige inspección del operador. Este resultado no certifica que la aplicación esté preparada.',
    },
    {
        recovery: { id: 'deployment-publication-context-missing', variables: {} },
        english: 'Existing persisted state and completed external effects were preserved; this attempt did not create a GitHub release.',
        spanish: 'Se conservaron el estado persistido y los efectos externos completados; este intento no creó una release de GitHub.',
    },
    {
        recovery: { id: 'progress-binary-evidence-unavailable', variables: { paths: '["lib/a.dll"]', pathCount: 1 } },
        english: 'Existing progress labels and assessments were preserved; no model assessment was made. Project verification remains a separate result.',
        spanish: 'Se conservaron las etiquetas de progreso y las evaluaciones; no se realizó ninguna evaluación del modelo. La verificación del proyecto sigue siendo un resultado independiente.',
    },
    {
        recovery: { id: 'progress-result-contract-invalid', variables: { phase: 'assessment', reason: 'requirement-evidence-invalid', field: '$.requirements[1].evidence', requirementId: 'R2', sourceLineId: 'L7' } },
        english: 'Existing progress labels and published assessments were preserved. An optional check-publication warning is a separate result.',
        spanish: 'Se conservaron las etiquetas de progreso y las evaluaciones publicadas. Un aviso de publicación del check opcional corresponde a otro resultado.',
    },
    {
        recovery: { id: 'progress-completion-recovery-exhausted', variables: { reportedProgress: 70, requirementCount: 2, supportedCount: 2, missingCount: 0, unknownCount: 0 } },
        english: 'Existing progress labels and published assessments were preserved. Verification, review, coverage and approval remain independent gates.',
        spanish: 'Se conservaron las etiquetas de progreso y las evaluaciones publicadas. Verificación, revisión, cobertura y aprobación siguen siendo controles independientes.',
    },
    {
        recovery: { id: 'progress-assessment-capacity-exceeded', variables: { phase: 'assessment', reason: 'assessment-text-limit', field: '$.requirements[1].summary', requirementId: 'R2', sourceLineId: 'L7' } },
        english: 'Existing progress labels and published assessments were preserved. No partial result or passing verification is authorized.',
        spanish: 'Se conservaron las etiquetas de progreso y las evaluaciones publicadas. No se autoriza un resultado parcial ni una verificación aprobada.',
    },
    {
        recovery: { id:'issue-workflow-admission-blocked', variables:{kind:'bugfix',reason:'missing-fields',fields:'["VaultStadio Version"]'} },
        english: 'No branch or planner was started. Issue configuration is unchanged; this run only reports the admission diagnostic.',
        spanish: 'No se inició ninguna rama ni planificador. La configuración de la issue permanece igual; esta ejecución solo informa del diagnóstico de admisión.',
    },

    {
        recovery: {id: 'branch-sync-verification-failed', variables: {stage: 'dependencies', reason: 'unsupported-graph', command: 'pnpm run typecheck', commandIndex: 2, childSha: 'a'.repeat(40), restoration: 'restored'}},
        english: `No synchronization commit or push was attempted. Original head: ${'a'.repeat(40)}. Local rollback: restored; restored means the original head was verified, unverified requires operator inspection before retrying.`,
        spanish: `No se intentó crear ni subir un commit de sincronización. Head original: ${'a'.repeat(40)}. Rollback local: restored; restored confirma el head original, unverified requiere inspección del operador antes de reintentar.`,
    },
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
        recovery: { id: 'change-size-reconciliation-failed', variables: {
            operation: 'pr-project-size', issueNumber: 42, targetNumber: 99, projectIndex: 1,
            verifiedOperations: 7, pendingProjectSizes: 0, providerStatus: 'http-403', providerReference: 'ABCD:1234',
        } },
        english: 'Completed effects were retained. Verified operations: 7; PR Project sizes awaiting lifecycle linkage: 0. The failed and later operations remain unverified; an optional Check Run warning is a separate publication stage.',
        spanish: 'Se conservaron los efectos completados. Operaciones verificadas: 7; tamaños de PR en Projects pendientes de vinculación: 0. La operación fallida y las posteriores siguen sin verificar; un aviso del Check Run opcional corresponde a otra etapa de publicación.',
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
        recovery: { id: 'sdd-catalog-missing-trusted-source', variables: {} },
        english: 'Existing answers, published specifications and any linked branch are retained; this attempt published no specification or branch.',
        spanish: 'Se conservan las respuestas, las especificaciones publicadas y cualquier rama enlazada; este intento no publicó ninguna especificación ni rama.',
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
        english: 'The original pull-request base and owned temporary-reference cleanup were verified.',
        spanish: 'Se verificaron la rama base original y la limpieza de la referencia temporal propia.',
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
        english: 'The original base and temporary-reference cleanup could not be verified; pending recovery evidence was retained when observable.',
        spanish: 'No se pudo verificar la base original ni la limpieza de la referencia temporal; se conservó la evidencia pendiente cuando pudo observarse.',
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
    it.each([['en-US', 'completed'], ['es-ES', 'completed'], ['en-US', 'unverified'], ['es-ES', 'unverified']] as const)(
        'renders catalog recovery in %s with truthful %s abort state and trusted destinations', (locale, abort) => {
            const error = new ApplicationError('configuration.unsupported', 'Catalog review required.', { correlationId: CORRELATION_ID,
                recovery: { id: 'branch-sync-catalog-incompatible', variables: {
                    phase: 'profile-compatibility', profile: 'legacy-evidence', field: 'workflows', capabilityNumber: 1, abort,
                } } });
            const message = jest.fn(resolveStaticApplicationErrorCatalog(locale).message);
            const view = buildApplicationErrorPresentation(error, message);
            expect(view.action).toContain('https://docs.page/vypdev/copilot/security-operations/operations/troubleshooting#branch-sync-catalog-compatibility');
            expect(view.action).toContain('/copilot sync-branch'); expect(view.retainedState).toContain(abort);
            expect(view.retryable).toBe('No'); expect(view.reference).toBe(CORRELATION_ID);
            expect(view.impact).toContain('workflows'); expect(view.impact).toContain('legacy-evidence');
            expect(message.mock.calls[0][1]).toMatchObject({ syncCommand: '/copilot sync-branch',
                catalogGuide: 'https://docs.page/vypdev/copilot/security-operations/operations/troubleshooting#branch-sync-catalog-compatibility' });
        });
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
