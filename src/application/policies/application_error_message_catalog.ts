import { ENGLISH_COMMAND_VALIDATION_CONTENT, SPANISH_COMMAND_VALIDATION_CONTENT } from './comment_command_validation_message_catalog';
import type {
  ApplicationErrorCode,
  ApplicationErrorRecoveryId,
} from '../../data/model/application_error';
import {
  APPLICATION_ERROR_METADATA,
  APPLICATION_ERROR_RECOVERY_IDS,
} from '../../data/model/application_error';
import {
  MESSAGE_CATALOG_VERSION,
  renderCatalogMessage,
  type CatalogMessage,
  type MessageCatalogDefinition,
} from '../../domain/message_catalog';
import type { AgentConfiguration } from '../../domain/agent';
import type { MessageCatalogResolutionPort } from '../ports/message_catalog_ports';
import {
  resolveMessageCatalogView,
  resolveStaticMessageCatalogView,
  type ResolvedMessageCatalogView,
} from './resolved_message_catalog_policy';

const LABEL_KEYS = Object.freeze([
  'impact', 'errorCode', 'action', 'retainedState', 'retryable', 'yes', 'no', 'reference',
] as const);
const CONTENT_FIELDS = Object.freeze(['impact', 'action', 'retainedState'] as const);

export const APPLICATION_ERROR_CODES = Object.freeze(
  Object.keys(APPLICATION_ERROR_METADATA) as ApplicationErrorCode[],
);

type LabelKey = typeof LABEL_KEYS[number];
type ContentField = typeof CONTENT_FIELDS[number];
type LabelMessageId = `error.label.${LabelKey}`;
type ContentMessageId = `error.${ApplicationErrorCode}.${ContentField}`;
type RecoveryMessageId = `error.recovery.${ApplicationErrorRecoveryId}.${ContentField}`;

export type ApplicationErrorMessageId = LabelMessageId | ContentMessageId | RecoveryMessageId;
export type ApplicationErrorMessageReader = (
  id: ApplicationErrorMessageId,
  variables?: Readonly<Record<string, string | number>>,
) => string;
export type ApplicationErrorMessageCatalog = ResolvedMessageCatalogView<ApplicationErrorMessageId>;

export const APPLICATION_ERROR_MESSAGE_IDS: readonly ApplicationErrorMessageId[] = Object.freeze([
  ...LABEL_KEYS.map(key => `error.label.${key}` as const),
  ...APPLICATION_ERROR_CODES.flatMap(code => CONTENT_FIELDS.map(field => `error.${code}.${field}` as const)),
  ...APPLICATION_ERROR_RECOVERY_IDS.flatMap(id => CONTENT_FIELDS
    .map(field => `error.recovery.${id}.${field}` as const)),
]);

const ENGLISH_LABELS: Readonly<Record<LabelKey, string>> = Object.freeze({
  impact: 'Impact',
  errorCode: 'Error code',
  action: 'Action',
  retainedState: 'Retained state',
  retryable: 'Retryable',
  yes: 'Yes',
  no: 'No',
  reference: 'Reference',
});

const SPANISH_LABELS: Readonly<Record<LabelKey, string>> = Object.freeze({
  impact: 'Impacto',
  errorCode: 'Código de error',
  action: 'Acción',
  retainedState: 'Estado conservado',
  retryable: 'Reintentable',
  yes: 'Sí',
  no: 'No',
  reference: 'Referencia',
});

type ErrorContent = Readonly<Record<ApplicationErrorCode, Readonly<Record<ContentField, string>>>>;
type RecoveryContent = Readonly<
  Record<ApplicationErrorRecoveryId, Readonly<Record<ContentField, string>>>
>;

const ENGLISH_CONTENT: ErrorContent = Object.freeze(Object.fromEntries(
  APPLICATION_ERROR_CODES.map(code => [code, Object.freeze({
    impact: APPLICATION_ERROR_METADATA[code].impact,
    action: APPLICATION_ERROR_METADATA[code].action,
    retainedState: APPLICATION_ERROR_METADATA[code].retainedState,
  })]),
) as Record<ApplicationErrorCode, Readonly<Record<ContentField, string>>>);

const UNCHANGED_STATE_ES = 'No se creó ningún estado ni efecto externo nuevo.';
const PRESERVED_STATE_ES = 'Se conservaron el estado persistente existente y los efectos externos completados.';

const SPANISH_CONTENT: ErrorContent = Object.freeze({
  'configuration.invalid': Object.freeze({
    impact: 'La operación no pudo usar los valores configurados.',
    action: 'Corrige la configuración no válida y reinténtalo.',
    retainedState: UNCHANGED_STATE_ES,
  }),
  'configuration.unsupported': Object.freeze({
    impact: 'La capacidad solicitada no es compatible con esta instalación.',
    action: 'Usa una configuración compatible o actualiza la instalación.',
    retainedState: UNCHANGED_STATE_ES,
  }),
  'authorization.denied': Object.freeze({
    impact: 'La operación no pudo acceder al recurso necesario.',
    action: 'Concede el permiso documentado y reinténtalo.',
    retainedState: UNCHANGED_STATE_ES,
  }),
  'authorization.credential-invalid': Object.freeze({
    impact: 'La operación no pudo autenticarse con el proveedor necesario.',
    action: 'Sustituye o configura la credencial necesaria y reinténtalo.',
    retainedState: UNCHANGED_STATE_ES,
  }),
  'provider.not-found': Object.freeze({
    impact: 'No se encontró un recurso necesario del proveedor.',
    action: 'Verifica el recurso de destino y reintenta la operación.',
    retainedState: PRESERVED_STATE_ES,
  }),
  'provider.conflict': Object.freeze({
    impact: 'El proveedor rechazó un estado actual conflictivo.',
    action: 'Vuelve a cargar el estado actual y reinténtalo si la operación sigue siendo necesaria.',
    retainedState: PRESERVED_STATE_ES,
  }),
  'provider.rate-limited': Object.freeze({
    impact: 'El proveedor limitó temporalmente la operación.',
    action: 'Reinténtalo cuando se restablezca el límite del proveedor.',
    retainedState: PRESERVED_STATE_ES,
  }),
  'provider.unavailable': Object.freeze({
    impact: 'El proveedor no estaba disponible temporalmente.',
    action: 'Reinténtalo cuando el proveedor esté disponible.',
    retainedState: PRESERVED_STATE_ES,
  }),
  'provider.contract-invalid': Object.freeze({
    impact: 'La respuesta del proveedor no se pudo interpretar de forma segura.',
    action: 'Revisa la integración del proveedor antes de reintentarlo.',
    retainedState: PRESERVED_STATE_ES,
  }),
  'agent.policy-rejected': Object.freeze({
    impact: 'El agente configurado no se inició.',
    action: 'Usa una configuración de agente permitida y reinténtalo.',
    retainedState: UNCHANGED_STATE_ES,
  }),
  'agent.failed': Object.freeze({
    impact: 'El agente admitido no produjo un resultado utilizable.',
    action: 'Revisa el estado saneado del agente y reinténtalo si procede.',
    retainedState: PRESERVED_STATE_ES,
  }),
  'locale.output-invalid': Object.freeze({
    impact: 'El contenido de producto generado por el agente se rechazó antes de publicarse porque su contrato de locale no era válido.',
    action: 'Reinténtalo con un proveedor compatible con el locale configurado del repositorio.',
    retainedState: UNCHANGED_STATE_ES,
  }),
  'locale.translation-failed': Object.freeze({
    impact: 'La solicitud no se pudo interpretar de forma segura en el idioma configurado del repositorio.',
    action: 'Reformula la solicitud o reinténtalo cuando esté disponible el proveedor de idioma configurado.',
    retainedState: UNCHANGED_STATE_ES,
  }),
  'validation.invalid-input': Object.freeze({
    impact: 'La operación no aceptó la entrada suministrada.',
    action: 'Corrige la entrada y reinténtalo.',
    retainedState: UNCHANGED_STATE_ES,
  }),
  'validation.evidence-unavailable': Object.freeze({
    impact: 'No se evaluó el progreso porque GitHub omitió un patch necesario.',
    action: 'Inspecciona manualmente la comparación entre los commits base y head exactos o divide el trabajo en cambios revisados más pequeños con patches completos antes de otra evaluación. Reintentar los mismos commits no recuperará la evidencia omitida.',
    retainedState: 'Se conservaron las etiquetas de progreso y las evaluaciones publicadas; no se realizó ninguna evaluación del modelo.',
  }),
  'validation.evidence-too-large': Object.freeze({
    impact: 'No se pudo evaluar el progreso dentro de los límites fijos de evidencia.',
    action: 'Reduce el tamaño de la comparación o divide el trabajo en cambios revisados más pequeños antes de iniciar otra evaluación.',
    retainedState: 'Se conservaron las etiquetas de progreso y las evaluaciones publicadas.',
  }),
  'workflow.invalid-event': Object.freeze({
    impact: 'El evento no puede iniciar el workflow solicitado.',
    action: 'Inicia la operación desde un evento o superficie compatible.',
    retainedState: UNCHANGED_STATE_ES,
  }),
  'workflow.stale': Object.freeze({
    impact: 'Un estado más reciente sustituyó esta ejecución del workflow.',
    action: 'Revisa el estado actual e inicia una nueva ejecución solo si es necesario.',
    retainedState: PRESERVED_STATE_ES,
  }),
  'workflow.cancelled': Object.freeze({
    impact: 'El workflow se detuvo antes de completarse.',
    action: 'Inicia una nueva ejecución si la operación sigue siendo necesaria.',
    retainedState: PRESERVED_STATE_ES,
  }),
  'workflow.failed': Object.freeze({
    impact: 'El workflow no pudo completar la operación solicitada.',
    action: 'Revisa el estado actual y reintenta el paso fallido.',
    retainedState: PRESERVED_STATE_ES,
  }),
  'workflow.presentation-pending': Object.freeze({
    impact: 'Bugbot completó la revisión, pero los resúmenes históricos de revisión aún no están totalmente sincronizados.',
    action: 'Ejecuta una nueva revisión de Bugbot para continuar la reparación limitada de la presentación.',
    retainedState: PRESERVED_STATE_ES,
  }),
  timeout: Object.freeze({
    impact: 'La operación superó su tiempo de ejecución limitado.',
    action: 'Verifica el estado actual antes de reintentarlo.',
    retainedState: PRESERVED_STATE_ES,
  }),
  unexpected: Object.freeze({
    impact: 'La operación se detuvo porque un fallo inesperado se gestionó de forma segura.',
    action: 'Usa el ID de correlación para investigar antes de reintentarlo.',
    retainedState: PRESERVED_STATE_ES,
  }),
});

const STORED_CONFIGURATION_ACTION_EN = 'A maintainer must review {recoveryGuide}. Preserve a copy before removing only a verified obsolete unmanaged block. If managed branch, release, hotfix or orchestration state may exist, stop and restore verified supported state with a maintainer. Do not just add a schema version or delete managed state. Correct the configuration before rerunning; retrying unchanged state will fail again.';
const STORED_CONFIGURATION_ACTION_ES = 'Un mantenedor debe revisar {recoveryGuide}. Conserva una copia antes de retirar solo un bloque obsoleto confirmado como no gestionado. Si puede existir estado gestionado de ramas, releases, hotfixes u orquestación, detente y restaura estado compatible verificado con un mantenedor. No añadas simplemente una versión de esquema ni borres estado gestionado. Corrige la configuración antes de reejecutar; el mismo estado volverá a fallar.';
const STORED_CONFIGURATION_RETAINED_EN = 'The issue/PR description and stored configuration were not changed by this read.';
const STORED_CONFIGURATION_RETAINED_ES = 'Esta lectura no modificó la descripción de la issue/PR ni su configuración almacenada.';

const ENGLISH_RECOVERY_CONTENT: RecoveryContent = Object.freeze({
  ...ENGLISH_COMMAND_VALIDATION_CONTENT,
  'stored-configuration-schema-missing': Object.freeze({
    impact: 'Automation stopped for issue/PR #{issueNumber}: the stored configuration has no schema version; version {expectedVersion} is required.',
    action: STORED_CONFIGURATION_ACTION_EN,
    retainedState: STORED_CONFIGURATION_RETAINED_EN,
  }),
  'stored-configuration-schema-unsupported': Object.freeze({
    impact: 'Automation stopped for issue/PR #{issueNumber}: stored schema version {actualVersion} is unsupported; version {expectedVersion} is required.',
    action: STORED_CONFIGURATION_ACTION_EN,
    retainedState: STORED_CONFIGURATION_RETAINED_EN,
  }),
  'stored-configuration-invalid': Object.freeze({
    impact: 'Automation stopped for issue/PR #{issueNumber}: the stored configuration, markers or schema value are malformed; valid schema version {expectedVersion} is required.',
    action: STORED_CONFIGURATION_ACTION_EN,
    retainedState: STORED_CONFIGURATION_RETAINED_EN,
  }),
  'closed-issue-reconciliation-failed': Object.freeze({
    impact: 'Issue cleanup remains unverified: {resultId}, phase {phase}; native state {state}, reason {reason}.',
    action: 'Inspect the closed-issue or merged-PR run and current native state. Retry cleanup only if the issue is still closed with the intended reason; leave reopened work open. Resolve the named failure before retrying.',
    retainedState: 'Native state was preserved. Confirmed changes: {changed}; remaining required changes in the last verified plan: {remaining}. Unavailable reads do not establish completion.',
  }),
  'approval-evidence-read-failed': Object.freeze({
    impact: 'Approval evidence could not be verified: {operation} ({reason}).',
    action: 'Inspect {permission} access for the runtime credential and the named evidence response. Correct authorization, missing-resource or schema errors before rerunning; retry transient failures only after provider recovery or rate-limit reset.',
    retainedState: 'No approval is authorized by this failed read. Existing PRs, reviews and completed external effects were preserved.',

  }),
  'workspace-changes-rejected': Object.freeze({
    impact: 'The changes were rejected during workspace verification.',
    action: 'Inspect the rejected paths in the workflow and correct the workspace before retrying.',
    retainedState: 'The normal commit and push steps were skipped. Verify the current state before retrying.',
  }),
  'sdd-draft-case-identity-invalid': Object.freeze({
    impact: 'SDD publication stopped after one automatic repair: case IDs collide with an owning SDD or are ambiguous.',
    action: 'Review the safe validation diagnostics in the issue status card; use distinct fully qualified case IDs and preserve the baseline inventory. Retry the same issue workflow.',
    retainedState: 'Existing answers and published SDDs were preserved; no draft was published. Publication checks do not establish runtime acceptance.',
  }),
  'sdd-draft-case-budget-invalid': Object.freeze({
    impact: 'SDD publication stopped after one automatic repair: per-area allocations disagree with the distinct case inventory.',
    action: 'Review the safe validation diagnostics in the issue status card; reconcile each area and the total with the enumerated cases. Retry the same issue workflow.',
    retainedState: 'Existing answers and published SDDs were preserved; no draft was published. Publication checks do not establish runtime acceptance.',
  }),
  'sdd-draft-requirement-mapping-invalid': Object.freeze({
    impact: 'SDD publication stopped after one automatic repair: requirements and case mappings are incomplete or inconsistent.',
    action: 'Review the safe validation diagnostics in the issue status card; map every requirement to defined cases and match the reverse links. Retry the same issue workflow.',
    retainedState: 'Existing answers and published SDDs were preserved; no draft was published. Publication checks do not establish runtime acceptance.',
  }),
  'sdd-draft-repository-path-invalid': Object.freeze({
    impact: 'SDD publication stopped after one automatic repair: cited repository paths cannot be verified at the immutable base.',
    action: 'Review the safe validation diagnostics in the issue status card; correct existing paths or explicitly declare intended new files. Retry the same issue workflow.',
    retainedState: 'Existing answers and published SDDs were preserved; no draft was published. Publication checks do not establish runtime acceptance.',
  }),
  'sdd-catalog-unsupported-profile': Object.freeze({
    impact: 'SDD preparation stopped before model analysis because the repository selected a catalog profile unsupported by the installed publication adapter.',
    action: 'Review catalog profile support in the SDD guide. Preserve the native schema, readiness, requirements, evidence and blockers; have a maintainer provide a reviewed compatible adapter, then retry this same issue.',
    retainedState: 'The repository catalog, answers and published SDDs remain unchanged; no specification or branch was published by this attempt.',
  }),
  'sdd-catalog-format-invalid': Object.freeze({
    impact: 'SDD preparation stopped before ownership operations because the catalog cannot establish one valid supported profile and unique owner paths.',
    action: 'Validate the catalog JSON, supported profile, required metadata and normalized unique owner-path arrays. Preserve repository-owned readiness rules and retry the same issue after maintainer review.',
    retainedState: 'The source catalog, answers and published SDDs remain unchanged; no automatic catalog conversion was attempted.',
  }),
  'sdd-draft-format-invalid': Object.freeze({
    impact: 'SDD preparation stopped because the draft still lacked required headings or a numeric test budget after one automatic repair.',
    action: 'Retry SDD preparation with the canonical specification template and the explicit acceptance requirements.',
    retainedState: 'Existing answers and published SDDs were preserved; no draft was published.',
  }),
  'sdd-draft-size-exceeded': Object.freeze({
    impact: 'SDD preparation stopped because the draft remained too large after one automatic size repair.',
    action: 'Retry SDD preparation with a proportional appendix or an approved companion specification.',
    retainedState: 'Existing answers and published SDDs were preserved; no draft was published.',
  }),
  'branch-sync-verification-failed': Object.freeze({
    impact: 'Branch synchronization stopped at verification command {commandIndex} ({command}): stage {stage}, reason {reason}.',
    action: 'Inspect the failed stage in the linked workflow logs. For dependencies, provision the source Node/pnpm toolchain and repair the frozen candidate workspace graph; for setup/runtime, repair the same-job prerequisites; for command failures, correct the configured verifier. Then retry {syncCommand}. Blind retries do not repair a graph mismatch.',
    retainedState: 'No synchronization commit or push was attempted. Original head: {childSha}. Local rollback: {restoration}; restored means the original head was verified, unverified requires operator inspection before retrying.',
  }),
  'branch-sync-resolution-invalid': Object.freeze({
    impact: 'Branch synchronization stopped because workspace validation rejected the resolution ({validationCode}).',
    action: 'Inspect this validation code in the workflow logs and correct the resolution before retrying {command}.',
    retainedState: 'No synchronization commit was pushed; remote branches were preserved.',
  }),
  'branch-sync-agent-disabled': Object.freeze({
    impact: 'Branch synchronization stopped because the merge has conflicts and --no-agent disables automatic resolution.',
    action: 'Run {command} to let the configured fixer resolve eligible conflicts, or use --dry-run to inspect the merge without publishing it.',
    retainedState: 'No synchronization commit was pushed; remote branches were preserved.',
  }),
  'branch-sync-fixer-unavailable': Object.freeze({
    impact: 'Branch synchronization stopped because the merge has conflicts and no fixer agent is configured.',
    action: 'Configure a supported fixer and retry {command}; use --dry-run to inspect the merge without publishing it.',
    retainedState: 'No synchronization commit was pushed; remote branches were preserved.',
  }),
  'pull-request-link-restored': Object.freeze({
    impact: 'The pull request could not be linked to its issue.',
    action: 'Rerun the workflow; no temporary pull-request state needs manual recovery.',
    retainedState: 'The original pull-request base and description were restored.',
  }),
  'pull-request-link-base-retained': Object.freeze({
    impact: 'The pull request could not be linked to its issue.',
    action: 'Restore the temporary default base branch, then rerun the workflow.',
    retainedState: 'The temporary default base branch remains; the original description was restored.',
  }),
  'pull-request-link-reference-retained': Object.freeze({
    impact: 'The pull request could not be linked to its issue.',
    action: 'Remove the temporary issue reference from the description, then rerun the workflow.',
    retainedState: 'The original base branch was restored; the temporary issue reference remains in the description.',
  }),
  'pull-request-link-base-and-reference-retained': Object.freeze({
    impact: 'The pull request could not be linked to its issue.',
    action: 'Restore the temporary default base branch and remove the temporary issue reference, then rerun the workflow.',
    retainedState: 'The temporary default base branch and issue reference remain.',
  }),
  'managed-branch-enrichment-failed': Object.freeze({
    impact: 'The linked branch exists, but later issue metadata may be incomplete.',
    action: 'Continue on {branchName} and rerun issue enrichment.',
    retainedState: 'Branch {branchName} and its configuration patch were preserved.',
  }),
  'inactivity-explanation-failed': Object.freeze({
    impact: 'Issue #{issueNumber} was closed without its terminal inactivity explanation.',
    action: 'Inspect issue #{issueNumber} and add the explanation manually if the missing context matters.',
    retainedState: 'Issue #{issueNumber} remains closed; the completed close will not be repeated.',
  }),
  'bugbot-review-blocks-pending': Object.freeze({
    impact: 'Bugbot completed the review, but {pendingCount} historical review status blocks remain pending.',
    action: 'Run a Bugbot recheck to continue the bounded presentation repair.',
    retainedState: 'The completed analysis and successful review updates were preserved.',
  }),
});

const SPANISH_RECOVERY_CONTENT: RecoveryContent = Object.freeze({
  ...SPANISH_COMMAND_VALIDATION_CONTENT,
  'stored-configuration-schema-missing': Object.freeze({
    impact: 'La automatización se detuvo para la issue/PR #{issueNumber}: la configuración almacenada no tiene versión de esquema; se requiere la versión {expectedVersion}.',
    action: STORED_CONFIGURATION_ACTION_ES,
    retainedState: STORED_CONFIGURATION_RETAINED_ES,
  }),
  'stored-configuration-schema-unsupported': Object.freeze({
    impact: 'La automatización se detuvo para la issue/PR #{issueNumber}: la versión de esquema almacenada {actualVersion} no es compatible; se requiere la versión {expectedVersion}.',
    action: STORED_CONFIGURATION_ACTION_ES,
    retainedState: STORED_CONFIGURATION_RETAINED_ES,
  }),
  'stored-configuration-invalid': Object.freeze({
    impact: 'La automatización se detuvo para la issue/PR #{issueNumber}: la configuración almacenada, sus delimitadores o el valor del esquema no son válidos; se requiere un esquema válido de versión {expectedVersion}.',
    action: STORED_CONFIGURATION_ACTION_ES,
    retainedState: STORED_CONFIGURATION_RETAINED_ES,
  }),
  'closed-issue-reconciliation-failed': Object.freeze({
    impact: 'La limpieza de la issue sigue sin verificarse: {resultId}, fase {phase}; estado nativo {state}, motivo {reason}.',
    action: 'Revisa la ejecución de cierre o de la PR fusionada y el estado nativo actual. Reintenta la limpieza solo si la issue sigue cerrada con el motivo previsto; conserva abierto el trabajo reabierto. Resuelve el fallo indicado antes de reintentar.',
    retainedState: 'Se conservó el estado nativo. Cambios confirmados: {changed}; cambios pendientes en el último plan verificado: {remaining}. Una lectura no disponible no demuestra que haya finalizado.',
  }),
  'approval-evidence-read-failed': Object.freeze({
    impact: 'No se pudo verificar la evidencia de aprobación: {operation} ({reason}).',
    action: 'Comprueba el acceso {permission} de la credencial de ejecución y la respuesta indicada. Corrige los errores de autorización, recurso o esquema antes de reejecutar; reintenta los fallos transitorios solo tras recuperarse el proveedor o restablecerse el límite.',
    retainedState: 'Esta lectura fallida no autoriza ninguna aprobación. Se conservaron las PRs, revisiones y efectos externos completados.',

  }),
  'workspace-changes-rejected': Object.freeze({
    impact: 'Los cambios se rechazaron durante la verificación del espacio de trabajo.',
    action: 'Revisa las rutas rechazadas en la ejecución y corrige el espacio de trabajo antes de reintentar.',
    retainedState: 'Se omitieron los pasos normales de commit y push. Comprueba el estado actual antes de reintentar.',
  }),
  'sdd-draft-case-identity-invalid': Object.freeze({
    impact: 'La publicación del SDD se detuvo tras un intento automático de corrección: los identificadores de casos coinciden con un SDD existente o son ambiguos.',
    action: 'Revisa los diagnósticos seguros de validación de la tarjeta de estado; usa identificadores completos y distintos y conserva el inventario original. Reintenta el workflow de la misma incidencia.',
    retainedState: 'Se conservaron las respuestas y los SDD publicados; no se publicó ningún borrador. Estas comprobaciones no demuestran la aceptación en ejecución.',
  }),
  'sdd-draft-case-budget-invalid': Object.freeze({
    impact: 'La publicación del SDD se detuvo tras un intento automático de corrección: las asignaciones por área no coinciden con el inventario de casos distintos.',
    action: 'Revisa los diagnósticos seguros de validación de la tarjeta de estado; reconcilia cada área y el total con los casos enumerados. Reintenta el workflow de la misma incidencia.',
    retainedState: 'Se conservaron las respuestas y los SDD publicados; no se publicó ningún borrador. Estas comprobaciones no demuestran la aceptación en ejecución.',
  }),
  'sdd-draft-requirement-mapping-invalid': Object.freeze({
    impact: 'La publicación del SDD se detuvo tras un intento automático de corrección: los requisitos y sus casos están incompletos o son inconsistentes.',
    action: 'Revisa los diagnósticos seguros de validación de la tarjeta de estado; vincula cada requisito a casos definidos y comprueba los enlaces inversos. Reintenta el workflow de la misma incidencia.',
    retainedState: 'Se conservaron las respuestas y los SDD publicados; no se publicó ningún borrador. Estas comprobaciones no demuestran la aceptación en ejecución.',
  }),
  'sdd-draft-repository-path-invalid': Object.freeze({
    impact: 'La publicación del SDD se detuvo tras un intento automático de corrección: no se pueden verificar las rutas citadas en la revisión base inmutable.',
    action: 'Revisa los diagnósticos seguros de validación de la tarjeta de estado; corrige las rutas existentes o declara explícitamente los archivos nuevos previstos. Reintenta el workflow de la misma incidencia.',
    retainedState: 'Se conservaron las respuestas y los SDD publicados; no se publicó ningún borrador. Estas comprobaciones no demuestran la aceptación en ejecución.',
  }),
  'sdd-catalog-unsupported-profile': Object.freeze({
    impact: 'La preparación del SDD se detuvo antes del análisis del modelo porque el repositorio seleccionó un perfil de catálogo que el adaptador de publicación instalado no admite.',
    action: 'Revisa los perfiles admitidos en la guía de SDD. Conserva el esquema nativo, los estados, requisitos, evidencias y bloqueos; pide a un mantenedor un adaptador compatible revisado y reintenta esta misma incidencia.',
    retainedState: 'El catálogo, las respuestas y los SDD publicados permanecen intactos; este intento no publicó ninguna especificación ni rama.',
  }),
  'sdd-catalog-format-invalid': Object.freeze({
    impact: 'La preparación del SDD se detuvo antes de las operaciones de propiedad porque el catálogo no permite establecer un único perfil admitido con rutas de propiedad válidas y únicas.',
    action: 'Valida el JSON del catálogo, el perfil admitido, los metadatos obligatorios y las listas de rutas de propiedad normalizadas y únicas. Conserva las reglas de preparación del repositorio y reintenta la misma incidencia tras la revisión de un mantenedor.',
    retainedState: 'El catálogo de origen, las respuestas y los SDD publicados permanecen intactos; no se intentó convertir el catálogo automáticamente.',
  }),
  'sdd-draft-format-invalid': Object.freeze({
    impact: 'La preparación del SDD se detuvo porque seguían faltando secciones obligatorias o un presupuesto numérico de pruebas tras un intento automático de corrección.',
    action: 'Reintenta la preparación del SDD con la plantilla canónica y los criterios de aceptación explícitos.',
    retainedState: 'Se conservaron las respuestas y los SDD publicados; no se publicó ningún borrador.',
  }),
  'sdd-draft-size-exceeded': Object.freeze({
    impact: 'La preparación del SDD se detuvo porque el borrador seguía siendo demasiado largo tras un intento automático de reducción.',
    action: 'Reintenta la preparación del SDD con un apéndice proporcional o una especificación complementaria aprobada.',
    retainedState: 'Se conservaron las respuestas y los SDD publicados; no se publicó ningún borrador.',
  }),
  'branch-sync-verification-failed': Object.freeze({
    impact: 'La sincronización se detuvo en el comando de verificación {commandIndex} ({command}): fase {stage}, motivo {reason}.',
    action: 'Revisa la fase fallida en los logs del workflow enlazado. Para dependencias, prepara Node/pnpm del repositorio fuente y corrige el grafo congelado del candidato; para setup/runtime, corrige los requisitos del mismo job; para fallos del comando, corrige el verificador configurado. Después reintenta {syncCommand}. Repetir sin cambios no corrige un grafo incompatible.',
    retainedState: 'No se intentó crear ni subir un commit de sincronización. Head original: {childSha}. Rollback local: {restoration}; restored confirma el head original, unverified requiere inspección del operador antes de reintentar.',
  }),
  'branch-sync-resolution-invalid': Object.freeze({
    impact: 'La sincronización se detuvo porque la validación del repositorio rechazó la resolución ({validationCode}).',
    action: 'Revisa este código de validación en los logs del workflow y corrige la resolución antes de reintentar {command}.',
    retainedState: 'No se publicó ningún commit de sincronización; se conservaron las ramas remotas.',
  }),
  'branch-sync-agent-disabled': Object.freeze({
    impact: 'La sincronización se detuvo porque el merge tiene conflictos y --no-agent desactiva la resolución automática.',
    action: 'Ejecuta {command} para que el fixer configurado resuelva los conflictos admitidos, o usa --dry-run para inspeccionar el merge sin publicarlo.',
    retainedState: 'No se publicó ningún commit de sincronización; se conservaron las ramas remotas.',
  }),
  'branch-sync-fixer-unavailable': Object.freeze({
    impact: 'La sincronización se detuvo porque el merge tiene conflictos y no hay un fixer configurado.',
    action: 'Configura un fixer compatible y reintenta {command}; usa --dry-run para inspeccionar el merge sin publicarlo.',
    retainedState: 'No se publicó ningún commit de sincronización; se conservaron las ramas remotas.',
  }),
  'pull-request-link-restored': Object.freeze({
    impact: 'No se pudo vincular la pull request con su issue.',
    action: 'Vuelve a ejecutar el workflow; ningún estado temporal de la pull request requiere recuperación manual.',
    retainedState: 'Se restauraron la rama base y la descripción originales de la pull request.',
  }),
  'pull-request-link-base-retained': Object.freeze({
    impact: 'No se pudo vincular la pull request con su issue.',
    action: 'Restaura la rama base predeterminada temporal y vuelve a ejecutar el workflow.',
    retainedState: 'La rama base predeterminada temporal permanece; se restauró la descripción original.',
  }),
  'pull-request-link-reference-retained': Object.freeze({
    impact: 'No se pudo vincular la pull request con su issue.',
    action: 'Elimina la referencia temporal a la issue de la descripción y vuelve a ejecutar el workflow.',
    retainedState: 'Se restauró la rama base original; la referencia temporal a la issue permanece en la descripción.',
  }),
  'pull-request-link-base-and-reference-retained': Object.freeze({
    impact: 'No se pudo vincular la pull request con su issue.',
    action: 'Restaura la rama base predeterminada temporal, elimina la referencia temporal a la issue y vuelve a ejecutar el workflow.',
    retainedState: 'La rama base predeterminada temporal y la referencia a la issue permanecen.',
  }),
  'managed-branch-enrichment-failed': Object.freeze({
    impact: 'La rama vinculada existe, pero los metadatos posteriores de la issue pueden estar incompletos.',
    action: 'Continúa en {branchName} y vuelve a ejecutar el enriquecimiento de la issue.',
    retainedState: 'Se conservaron la rama {branchName} y su parche de configuración.',
  }),
  'inactivity-explanation-failed': Object.freeze({
    impact: 'La issue #{issueNumber} se cerró sin su explicación final sobre la inactividad.',
    action: 'Revisa la issue #{issueNumber} y añade la explicación manualmente si falta contexto importante.',
    retainedState: 'La issue #{issueNumber} permanece cerrada; el cierre completado no se repetirá.',
  }),
  'bugbot-review-blocks-pending': Object.freeze({
    impact: 'Bugbot completó la revisión, pero quedan {pendingCount} bloques de estado de revisiones históricas pendientes.',
    action: 'Ejecuta una nueva revisión de Bugbot para continuar la reparación limitada de la presentación.',
    retainedState: 'Se conservaron el análisis completado y las actualizaciones de revisión correctas.',
  }),
});

function catalogMessages(
  labels: Readonly<Record<LabelKey, string>>,
  content: ErrorContent,
  recoveryContent: RecoveryContent,
): Readonly<Record<ApplicationErrorMessageId, CatalogMessage>> {
  return Object.freeze({
    ...Object.fromEntries(LABEL_KEYS.map(key => [`error.label.${key}`, labels[key]])),
    ...Object.fromEntries(APPLICATION_ERROR_CODES.flatMap(code => CONTENT_FIELDS.map(field => [
      `error.${code}.${field}`,
      content[code][field],
    ]))),
    ...Object.fromEntries(APPLICATION_ERROR_RECOVERY_IDS.flatMap(id => CONTENT_FIELDS.map(field => [
      `error.recovery.${id}.${field}`,
      recoveryContent[id][field],
    ]))),
  }) as Readonly<Record<ApplicationErrorMessageId, CatalogMessage>>;
}

export const ENGLISH_APPLICATION_ERROR_MESSAGES = catalogMessages(
  ENGLISH_LABELS,
  ENGLISH_CONTENT,
  ENGLISH_RECOVERY_CONTENT,
);
export const SPANISH_APPLICATION_ERROR_MESSAGES = catalogMessages(
  SPANISH_LABELS,
  SPANISH_CONTENT,
  SPANISH_RECOVERY_CONTENT,
);

export const ENGLISH_APPLICATION_ERROR_DEFINITION: MessageCatalogDefinition<ApplicationErrorMessageId> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION,
  locale: 'en-US',
  compatibleBaseLanguage: 'en',
  messages: ENGLISH_APPLICATION_ERROR_MESSAGES,
});

export const SPANISH_APPLICATION_ERROR_DEFINITION: MessageCatalogDefinition<ApplicationErrorMessageId> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION,
  locale: 'es-ES',
  compatibleBaseLanguage: 'es',
  messages: SPANISH_APPLICATION_ERROR_MESSAGES,
});

export const APPLICATION_ERROR_CATALOG_DEFINITIONS = Object.freeze([
  ENGLISH_APPLICATION_ERROR_DEFINITION,
  SPANISH_APPLICATION_ERROR_DEFINITION,
]);

export function resolveStaticApplicationErrorCatalog(locale: string): ApplicationErrorMessageCatalog {
  return resolveStaticMessageCatalogView(
    locale,
    ENGLISH_APPLICATION_ERROR_DEFINITION,
    APPLICATION_ERROR_CATALOG_DEFINITIONS,
  );
}

export function resolveApplicationErrorCatalog(
  locale: string,
  configuration: Readonly<AgentConfiguration> | undefined,
  resolver: MessageCatalogResolutionPort | undefined,
): Promise<ApplicationErrorMessageCatalog> {
  return resolveMessageCatalogView(
    locale,
    APPLICATION_ERROR_MESSAGE_IDS,
    ENGLISH_APPLICATION_ERROR_DEFINITION,
    APPLICATION_ERROR_CATALOG_DEFINITIONS,
    configuration,
    resolver,
  );
}

export const readEnglishApplicationErrorMessage: ApplicationErrorMessageReader = (id, variables = {}) =>
  renderCatalogMessage(ENGLISH_APPLICATION_ERROR_MESSAGES[id], variables, 'en-US');
