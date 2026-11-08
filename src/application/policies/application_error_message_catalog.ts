import { BRANCH_SYNC_PUBLICATION_LABEL_KEYS, ENGLISH_BRANCH_SYNC_PUBLICATION_LABELS, SPANISH_BRANCH_SYNC_PUBLICATION_LABELS, ENGLISH_BRANCH_SYNC_PUBLICATION_CONTENT, SPANISH_BRANCH_SYNC_PUBLICATION_CONTENT } from './branch_sync_publication_messages';
import { ASSIGNMENT_DIAGNOSTIC_LABEL_KEYS, ENGLISH_ASSIGNMENT_LABELS, SPANISH_ASSIGNMENT_LABELS, ENGLISH_ASSIGNMENT_CONTENT, SPANISH_ASSIGNMENT_CONTENT } from './issue_assignment_messages';
import { PROGRESS_CAPACITY_LABEL_KEYS, ENGLISH_PROGRESS_CAPACITY_LABELS, SPANISH_PROGRESS_CAPACITY_LABELS, ENGLISH_PROGRESS_CAPACITY_CONTENT, SPANISH_PROGRESS_CAPACITY_CONTENT } from './progress_capacity_messages';
import { BUGBOT_REVIEW_DIAGNOSTIC_LABEL_KEYS, ENGLISH_REVIEW_DIAGNOSTIC_LABELS, SPANISH_REVIEW_DIAGNOSTIC_LABELS } from './bugbot_review_diagnostic_labels';
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
  ...BUGBOT_REVIEW_DIAGNOSTIC_LABEL_KEYS,
  ...BRANCH_SYNC_PUBLICATION_LABEL_KEYS,
  ...ASSIGNMENT_DIAGNOSTIC_LABEL_KEYS,
  ...PROGRESS_CAPACITY_LABEL_KEYS,
  'impact', 'errorCode', 'action', 'retainedState', 'retryable', 'yes', 'no', 'reference', 'draftLengthUnavailable',
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
  ...ENGLISH_REVIEW_DIAGNOSTIC_LABELS,
  ...ENGLISH_BRANCH_SYNC_PUBLICATION_LABELS,
  ...ENGLISH_ASSIGNMENT_LABELS,
  ...ENGLISH_PROGRESS_CAPACITY_LABELS,
  impact: 'Impact',
  errorCode: 'Error code',
  action: 'Action',
  retainedState: 'Retained state',
  retryable: 'Retryable',
  yes: 'Yes',
  no: 'No',
  reference: 'Reference',
  draftLengthUnavailable: 'unavailable',
});

const SPANISH_LABELS: Readonly<Record<LabelKey, string>> = Object.freeze({
  ...SPANISH_REVIEW_DIAGNOSTIC_LABELS,
  ...SPANISH_BRANCH_SYNC_PUBLICATION_LABELS,
  ...SPANISH_ASSIGNMENT_LABELS,
  ...SPANISH_PROGRESS_CAPACITY_LABELS,
  impact: 'Impacto',
  errorCode: 'Código de error',
  action: 'Acción',
  retainedState: 'Estado conservado',
  retryable: 'Reintentable',
  yes: 'Sí',
  no: 'No',
  reference: 'Referencia',
  draftLengthUnavailable: 'no disponible',
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
    impact: 'No se evaluó el progreso porque no se pudieron verificar un patch necesario ni sus contenidos inmutables completos.',
    action: 'Inspecciona las rutas sin revisar y la base prevista de la pull request en la comparación entre los commits base y head exactos. Aporta evidencia completa y revisable antes de otra evaluación. Reintentar los mismos commits no recuperará la evidencia inmutable no disponible.',
    retainedState: 'Se conservaron las etiquetas de progreso y las evaluaciones publicadas; no se realizó ninguna evaluación del modelo.',
  }),
  'validation.evidence-too-large': Object.freeze({
    impact: 'No se pudo evaluar el progreso dentro de los límites fijos de evidencia.',
    action: 'Inspecciona la comparación completa y los datos de capacidad disponibles. La continuación por partes acotada pertenece a una sola ejecución; este fallo de capacidad detiene el intento. Reintentar evidencia idéntica que supera el límite no aumenta la capacidad. Conserva toda la aceptación y evidencia, y reporta las cargas no compatibles con el enlace de ejecución.',
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
  ...ENGLISH_ASSIGNMENT_CONTENT,
  ...ENGLISH_PROGRESS_CAPACITY_CONTENT,
  ...ENGLISH_COMMAND_VALIDATION_CONTENT,
  ...ENGLISH_BRANCH_SYNC_PUBLICATION_CONTENT,
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
  'progress-assessment-capacity-exceeded': Object.freeze({
    impact: 'The original requirement citations cannot fit a complete progress assessment; no evidence or assessment query was made after scope classification.',
    action: 'Inspect the original issue and the supported assessment protocol. The unchanged 8,000-code-point field limit must include every citation and a nonempty fact. Details: phase {phase}, reason {reason}, field {field}, requirement {requirementId}, original issue line {sourceLineId}. none means no verified identity is available. An identical retry cannot add capacity; preserve every requirement and verification gate when reviewing a supported protocol.',
    retainedState: 'Existing progress labels and published assessments were preserved. No partial result or passing verification is authorized.',
  }),
  'progress-sdd-seed-unverified': Object.freeze({
    impact: 'Commit could not verify the selected SDD draft for this issue and head.',
    action: 'Check the draft markers and confirm the current selection and verified SDD publication on the linked branch, then rerun Commit.',
    retainedState: 'Existing progress was retained.',
  }),
  'progress-batch-retained': Object.freeze({
    impact: 'Progress retained. Verified {verified} of {expected} batches. Complete evidence for the evaluated head is required.',
    action: 'Inspect the current run and requirement {requirementId}, batch {batch}, reason {reason}. Resolve missing or mismatched evidence and retry a complete assessment within the fixed budget.',
    retainedState: 'Existing progress labels and published assessments were preserved. No partial percentage was authorized.',
  }),
  'progress-scope-clause-limit': Object.freeze({
    impact: 'The complete human scope classification selected {observed} {clauseKind} lines; the supported limit is {limit}. Progress was not published.',
    action: 'Inspect the original human scope and classifier result at source {sourceLineId}, phase scope. A fresh valid classification may help; do not remove requirements, promote generated state or raise limits to pass. Genuine over-limit human scope requires a reviewed supported protocol.',
    retainedState: 'Existing progress labels and published assessments were preserved. No partial assessment or passing verification is authorized.',
  }),
  'progress-result-contract-invalid': Object.freeze({
    impact: 'The returned progress result violated its contract; progress was not published.',
    action: 'Inspect the original requirement and response schema. Details: phase {phase}, reason {reason}, field {field}, requirement {requirementId}, original issue line {sourceLineId}. none means no verified identity is available. A fresh attempt may help when the provider can satisfy the unchanged contract; do not relax acceptance or verification.',
    retainedState: 'Existing progress labels and published assessments were preserved. An optional check-publication warning is a separate result.',
  }),
  'progress-partition-bytes-invalid': Object.freeze({
    impact: 'A source-part fact still exceeds its JSON UTF-8 allocation after one replacement; progress was not published.',
    action: 'Inspect part {partitionId}, file {filePath}, unit {unitId}, field {field}: observed {observed} JSON UTF-8 bytes; maximum {maximum}, excluding enclosing quotes. Do not automatically repeat the unchanged comparison. Qualify a corrected build against the pinned sources before one fresh complete assessment.',
    retainedState: 'Prior progress labels and assessments were preserved. No partial percentage or passing verification was published; source freshness, review and coverage remain independent gates.',
  }),
  'progress-partition-length-invalid': Object.freeze({
    impact: 'A progress part still exceeds its response limit after one bounded replacement; progress was not published.',
    action: 'Inspect part {partitionId}, file {filePath}, unit {unitId}, field {field}: observed {observed} Unicode code points; maximum {maximum}. Do not automatically repeat the unchanged comparison. Qualify a corrected build against the pinned sources before one fresh complete assessment. Preserve every file, source unit and verification gate.',
    retainedState: 'Existing progress labels and assessments were preserved. No partial percentage or passing verification was published; execution and optional check-publication failures remain separate.',
  }),
  'bugbot-freshness-before-publication': Object.freeze({
    impact: 'Bugbot could not confirm the current PR before publication: operation {operation}, status {providerStatus}, reason {reason}, provider reference {providerReference}.',
    action: 'Inspect the named operation and error code; repair provider access or response before rechecking from the current head. Completed analysis alone is not a fresh review. Keep source identity and reconciliation checks enabled.',
    retainedState: 'This evaluation published no new finding mutations. Prior findings and resolutions were retained; no passing current review was authorized.',
  }),
  'bugbot-freshness-after-publication': Object.freeze({
    impact: 'Bugbot could not confirm the current PR after publication: operation {operation}, status {providerStatus}, reason {reason}, provider reference {providerReference}.',
    action: 'Inspect the named operation and error code; repair the provider cause and recheck the current head and persisted findings. Reconciliation must retain completed effects without duplicating them. Do not infer a clean review or roll back completed writes.',
    retainedState: 'Finding mutations may already have completed. Existing effects were retained; this evaluation did not authorize a passing current review or repeat publication.',
  }),
  'bugbot-partition-query-exhausted': Object.freeze({
    impact: 'A completed Bugbot partition response remained invalid after {attempts} attempts; the review was not published.',
    action: 'Inspect response reason {reason} and the current run. Qualify the provider output contract before a fresh complete review. This diagnostic describes completed response validation, not an execution infrastructure failure.',
    retainedState: 'Prior findings and resolutions were preserved. No partial review was published. Source freshness and complete-review gates remain required.',
  }),
  'progress-assessment-length-invalid': Object.freeze({
    impact: 'An acceptance field still exceeds its unchanged response limit after one complete replacement; progress was not published.',
    action: 'Inspect phase assessment, requirement {requirementId}, original source {sourceLineId}, field {field}: observed {observed} Unicode code points; maximum {maximum}. Do not automatically repeat the unchanged comparison. Validate a corrected Copilot build against the pinned source before starting one fresh complete assessment. Preserve every requirement and citation; do not truncate facts, raise limits or bypass verification.',
    retainedState: 'Existing progress labels and published assessments were preserved. No partial percentage was published. Verification, review, coverage and approval remain independent gates.',
  }),
  'progress-completion-recovery-exhausted': Object.freeze({
    impact: 'The final progress result still contradicted completion after one complete reassessment; progress was not published.',
    action: 'Inspect the complete pinned comparison and final facts: phase assessment, field $.progress, reported {reportedProgress}%, requirements {requirementCount}, supported {supportedCount}, missing {missingCount}, unknown {unknownCount}. Start a fresh complete assessment when the provider can satisfy the unchanged contract. These are model observations, not independent execution or approval evidence.',
    retainedState: 'Existing progress labels and published assessments were preserved. Verification, review, coverage and approval remain independent gates.',
  }),
  'bugbot-review-incomplete': Object.freeze({
    impact: 'Complete Bugbot review is blocked: {resource} {countKind} {observed} {unit}; supported limit {limit} ({profile}).',
    action: 'Inspect the exact resource and limit. Prepare missing immutable objects through the Action-managed workflow, correct the verified source, or review genuinely unrelated PR scope. Repeating identical unsupported input cannot complete the review. No partial review can authorize approval.',
    retainedState: 'Existing findings and resolution state were retained. This run published no partial findings or clean review; a fresh run must validate the complete current source.',
  }),
  'progress-inventory-incomplete': Object.freeze({
    impact: 'Complete progress evidence is unavailable ({profile}, {reason}); observed {countKind} {observedCount}, supported limit {supportedLimit}. Unreviewed path excerpt: {paths}.',
    action: 'Inspect the pinned comparison and named capacity or integrity boundary. An identical retry cannot repair unsupported evidence; repair its source or use a reviewed supported protocol. A zero limit denotes an integrity check, not a file allowance.',
    retainedState: 'Existing progress was retained. No partial assessment or progress publication was accepted. Build, review, coverage and approval remain independent gates.',
  }),
  'progress-binary-evidence-unavailable': Object.freeze({
    impact: 'Progress was not assessed because required binary or non-text contents cannot be reviewed. Unreviewed paths ({pathCount} total; {shownCount} shown; complete inventory in run details): {paths}.',
    action: 'Inspect the intended pull request base and the pinned paths. Changed binary contents need reviewable source and provenance; file metadata or a successful build does not establish binary correctness.',
    retainedState: 'Existing progress labels and assessments were preserved; no model assessment was made. Project verification remains a separate result.',
  }),
  'issue-workflow-admission-blocked': Object.freeze({
    impact: 'Issue workflow {kind} was not admitted ({reason}). Fields or labels needing attention: {fields}.',
    action: 'Correct the exact headings and populated values using the installed Issue Form, or remove conflicting workflow labels. If form and profile disagree, run copilot doctor and review issueWorkflows.fieldMappings. Rerun the workflow after repair.',
    retainedState: 'No branch or planner was started. Issue configuration is unchanged; this run only reports the admission diagnostic.',
  }),
  'change-size-reconciliation-failed': Object.freeze({
    impact: 'Size reconciliation stopped at {operation} for target #{targetNumber} (issue #{issueNumber}, configured Project position {projectIndex}; 0 means no Project). Provider: {providerStatus}; request: {providerReference}.',
    action: 'Correct the named authorization, resource or contract error before rerunning the same workflow. For transient failures, wait for provider recovery or rate-limit reset. Reread the target: the failed operation may have applied remotely.',
    retainedState: 'Completed effects were retained. Verified operations: {verifiedOperations}; PR Project sizes awaiting lifecycle linkage: {pendingProjectSizes}. The failed and later operations remain unverified; an optional Check Run warning is a separate publication stage.',
  }),
  'approval-evidence-read-failed': Object.freeze({
    impact: 'Approval evidence could not be verified: {operation} ({reason}).',
    action: 'Inspect {permission} access for the runtime credential and the named evidence response. Correct authorization, missing-resource or schema errors before rerunning; retry transient failures only after provider recovery or rate-limit reset.',
    retainedState: 'No approval is authorized by this failed read. Existing PRs, reviews and completed external effects were preserved.',

  }),
  'deployment-publication-context-missing': Object.freeze({
    impact: 'GitHub release creation stopped because its durable deployment operation was not available.',
    action: 'Verify single-action-issue selects the existing launcher issue and restore its verified operation context. Retry the supported workflow with the same single-action-operation-id and single-action-version only after that state is available.',
    retainedState: 'Existing persisted state and completed external effects were preserved; this attempt did not create a GitHub release.',
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
  'sdd-source-context-unavailable': Object.freeze({
    impact: 'SDD {phase} stopped because its selected immutable source view is unavailable. Source: {sourceCommit}. Reason: {reason}.',
    action: 'Inspect the source-context reason and the linked run. Verify local availability of the selected objects, Git support for --no-lazy-fetch, portable regular source paths and the fixed SDK limits. Correct the prerequisite and retry the same issue workflow; do not restore files into the default checkout or create a branch manually.',
    retainedState: 'The canonical checkout, existing answers, published SDDs and linked branch were retained; this attempt published no specification or branch.',
  }),
  'sdd-catalog-unsupported-profile': Object.freeze({
    impact: 'SDD preparation stopped before model analysis because the repository selected a catalog profile unsupported by the installed publication adapter.',
    action: 'Review catalog profile support in the SDD guide. Preserve the native schema, readiness, requirements, evidence and blockers; have a maintainer provide a reviewed compatible adapter, then retry this same issue.',
    retainedState: 'The repository catalog, answers and published SDDs remain unchanged; no specification or branch was published by this attempt.',
  }),
  'sdd-catalog-missing-trusted-source': Object.freeze({
    impact: 'SDD preparation stopped before model analysis because specs/catalog.json is missing from the trusted source revision.',
    action: 'Review and merge the catalog prerequisite through the enabled documentation workflow. Update the displayed trusted source through the normal managed-branch workflow, then retry this same issue after the source changes. An unchanged revision remains blocked.',
    retainedState: 'Existing answers, published specifications and any linked branch are retained; this attempt published no specification or branch.',
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
  'sdd-draft-response-too-short': Object.freeze({
    impact: 'The SDD drafting response was below its {minimum} Unicode code-point minimum (observed: {observed}; draft attempt: {attempts}).',
    action: 'Clarify in the issue description that a complete proposed Markdown document is required, preserving resolved requirements and ownership, then retry the same issue workflow. This failure does not start an automatic regeneration.',
    retainedState: 'Existing answers, selected ownership and published specifications were retained; this attempt published no specification or branch.',
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
  'branch-sync-catalog-incompatible': Object.freeze({
    impact: 'Branch synchronization stopped for catalog review: profile {profile}, phase {phase}, capability position {capabilityNumber}, field {field}. Position 0 identifies the document.',
    action: 'Review the catalog profile and preserve all evidence in a reviewed migration or supported adapter before retrying {syncCommand}. Do not invent verification dates or readiness. Recovery guide: {catalogGuide}.',
    retainedState: 'No synchronization commit or push was attempted; remote branches were preserved. Local abort: {abort}. completed means the abort call finished; unverified requires operator inspection. This result does not certify application readiness.',
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
  'branch-sync-sensitive-paths': Object.freeze({
    impact: 'Automatic branch synchronization stopped: {sensitiveCount} protected paths occur among {conflictCount} conflicts.',
    action: 'Review the conflicted paths in the workflow log and use the authorized maintainer recovery for protected files. After an approved source update, inspect {command} --dry-run. Repeating unchanged conflicts does not change this policy.',
    retainedState: 'No fixer, repository verifier or synchronization push was invoked; existing remote heads were preserved.',
  }),
  'branch-sync-conflict-limit': Object.freeze({
    impact: 'Automatic branch synchronization stopped: {conflictCount} conflicts exceed the limit of {limit}.',
    action: 'Reduce the conflicted set through reviewed source changes or authorized maintainer recovery, then inspect {command} --dry-run. Repeating the unchanged command cannot reduce this set.',
    retainedState: 'No fixer, repository verifier or synchronization push was invoked; existing remote heads were preserved.',
  }),
  'branch-sync-fixer-unavailable': Object.freeze({
    impact: 'Branch synchronization stopped because the merge has conflicts and no fixer agent is configured.',
    action: 'Configure a supported fixer and retry {command}; use --dry-run to inspect the merge without publishing it.',
    retainedState: 'No synchronization commit was pushed; remote branches were preserved.',
  }),
  'pull-request-link-restored': Object.freeze({
    impact: 'The pull request could not be linked to its issue.',
    action: 'Rerun the workflow; no temporary pull-request state needs manual recovery.',
    retainedState: 'The original pull-request base and owned temporary-reference cleanup were verified.',
  }),
  'pull-request-link-base-retained': Object.freeze({
    impact: 'The pull request could not be linked to its issue.',
    action: 'Rerun the current PR workflow to recover pending state; inspect ownership if recovery remains blocked.',
    retainedState: 'The temporary default base branch remains; the original description was restored.',
  }),
  'pull-request-link-reference-retained': Object.freeze({
    impact: 'The pull request could not be linked to its issue.',
    action: 'Rerun the current PR workflow to finish owned-reference cleanup; retain its recovery marker until the base and intended link are verified.',
    retainedState: 'The original base branch was restored; the temporary issue reference remains in the description.',
  }),
  'pull-request-link-base-and-reference-retained': Object.freeze({
    impact: 'The pull request could not be linked to its issue.',
    action: 'Rerun the current PR workflow to recover the original base and owned reference; inspect ownership if recovery remains blocked.',
    retainedState: 'The original base and temporary-reference cleanup could not be verified; pending recovery evidence was retained when observable.',
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
  ...SPANISH_ASSIGNMENT_CONTENT,
  ...SPANISH_PROGRESS_CAPACITY_CONTENT,
  ...SPANISH_COMMAND_VALIDATION_CONTENT,
  ...SPANISH_BRANCH_SYNC_PUBLICATION_CONTENT,
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
  'progress-assessment-capacity-exceeded': Object.freeze({
    impact: 'Las citas originales de los requisitos no caben en una evaluación de progreso completa; no se consultó evidencia ni evaluación después de clasificar el alcance.',
    action: 'Inspecciona la issue original y el protocolo de evaluación admitido. El límite fijo de 8,000 puntos de código por campo debe incluir cada cita y un dato no vacío. Detalles: fase {phase}, motivo {reason}, campo {field}, requisito {requirementId}, línea original de la issue {sourceLineId}. none indica que no hay una identidad verificada. Repetir el intento no añade capacidad; conserva todos los requisitos y controles de verificación al revisar un protocolo compatible.',
    retainedState: 'Se conservaron las etiquetas de progreso y las evaluaciones publicadas. No se autoriza un resultado parcial ni una verificación aprobada.',
  }),
  'progress-sdd-seed-unverified': Object.freeze({
    impact: 'Commit no pudo verificar el borrador de SDD seleccionado para esta issue y revisión.',
    action: 'Comprueba los marcadores del borrador y confirma la selección y la publicación verificada del SDD en la rama vinculada. Después, vuelve a ejecutar Commit.',
    retainedState: 'Se conservó el progreso anterior.',
  }),
  'progress-batch-retained': Object.freeze({
    impact: 'Progreso conservado. Se verificaron {verified} de {expected} lotes. Se exige evidencia completa de la revisión evaluada.',
    action: 'Inspecciona la ejecución y el requisito {requirementId}, lote {batch}, motivo {reason}. Resuelve la evidencia ausente o incompatible y repite la evaluación completa dentro del presupuesto fijo.',
    retainedState: 'Se conservaron las etiquetas y evaluaciones de progreso anteriores. No se autorizó un porcentaje parcial.',
  }),
  'progress-scope-clause-limit': Object.freeze({
    impact: 'La clasificación completa del alcance humano seleccionó {observed} líneas de tipo {clauseKind}; el límite admitido es {limit}. No se publicó el progreso.',
    action: 'Inspecciona el alcance humano original y la clasificación en la línea {sourceLineId}, fase scope. Una nueva clasificación válida puede ayudar; no elimines requisitos, conviertas estado generado en requisitos ni aumentes límites para aprobar. El alcance humano que excede el límite necesita un protocolo compatible revisado.',
    retainedState: 'Se conservaron las etiquetas de progreso y las evaluaciones publicadas. No se autoriza ninguna evaluación parcial ni verificación aprobada.',
  }),
  'progress-result-contract-invalid': Object.freeze({
    impact: 'El resultado de progreso devuelto incumplió su contrato; no se publicó el progreso.',
    action: 'Inspecciona el requisito original y el esquema de respuesta. Detalles: fase {phase}, motivo {reason}, campo {field}, requisito {requirementId}, línea original de la issue {sourceLineId}. none indica que no hay una identidad verificada. Un nuevo intento puede ayudar si el proveedor cumple el contrato sin cambiarlo; no relajes la aceptación ni la verificación.',
    retainedState: 'Se conservaron las etiquetas de progreso y las evaluaciones publicadas. Un aviso de publicación del check opcional corresponde a otro resultado.',
  }),
  'progress-partition-bytes-invalid': Object.freeze({
    impact: 'Un hecho de una parte sigue superando su asignación JSON UTF-8 tras una sustitución; no se publicó el progreso.',
    action: 'Inspecciona la parte {partitionId}, archivo {filePath}, unidad {unitId}, campo {field}: observado {observed} bytes JSON UTF-8; máximo {maximum}, sin las comillas exteriores. No repitas automáticamente la comparación sin cambios. Valida una compilación corregida con las fuentes fijadas antes de una evaluación nueva completa.',
    retainedState: 'Se conservaron las etiquetas y evaluaciones anteriores. No se publicó un porcentaje parcial ni una verificación aprobada; los controles de fuente vigente, revisión y cobertura siguen siendo independientes.',
  }),
  'progress-partition-length-invalid': Object.freeze({
    impact: 'Una parte del progreso sigue superando el límite de respuesta tras una sustitución acotada; no se publicó el progreso.',
    action: 'Inspecciona la parte {partitionId}, archivo {filePath}, unidad {unitId}, campo {field}: observado {observed} puntos de código Unicode; máximo {maximum}. No repitas automáticamente la comparación sin cambios. Valida una compilación corregida con las fuentes fijadas antes de una evaluación nueva completa. Conserva todos los archivos, hechos y controles de verificación.',
    retainedState: 'Se conservaron las etiquetas y evaluaciones de progreso. No se publicó ningún porcentaje parcial ni verificación aprobada; los fallos de ejecución y de publicación del check opcional siguen siendo independientes.',
  }),
  'bugbot-freshness-before-publication': Object.freeze({
    impact: 'Bugbot no pudo confirmar la PR actual antes de publicar: operación {operation}, estado {providerStatus}, motivo {reason}, referencia del proveedor {providerReference}.',
    action: 'Inspecciona la operación y el código de error; corrige el acceso o la respuesta del proveedor antes de revisar el head actual. Completar el análisis no confirma la vigencia de la revisión. Mantén los controles de identidad y reconciliación.',
    retainedState: 'Esta evaluación no publicó cambios nuevos en los findings. Se conservaron los hallazgos y resoluciones anteriores; no se autorizó una revisión actual aprobada.',
  }),
  'bugbot-freshness-after-publication': Object.freeze({
    impact: 'Bugbot no pudo confirmar la PR actual después de publicar: operación {operation}, estado {providerStatus}, motivo {reason}, referencia del proveedor {providerReference}.',
    action: 'Inspecciona la operación y el código de error; corrige la causa y vuelve a comprobar el head y los findings persistidos. La reconciliación debe conservar los efectos completados sin duplicarlos. No deduzcas una revisión limpia ni reviertas publicaciones completadas.',
    retainedState: 'Es posible que ya se hayan completado cambios en los findings. Se conservaron los efectos existentes; esta evaluación no autorizó una revisión actual aprobada ni la repetición de publicaciones.',
  }),
  'bugbot-partition-query-exhausted': Object.freeze({
    impact: 'La respuesta completada de una partición de Bugbot siguió siendo inválida tras {attempts} intentos; no se publicó la revisión.',
    action: 'Inspecciona el motivo de respuesta {reason} y la ejecución actual. Valida el contrato de salida del proveedor antes de una revisión completa nueva. Este diagnóstico describe la validación de una respuesta completada, no un fallo de infraestructura de ejecución.',
    retainedState: 'Se conservaron los hallazgos y resoluciones anteriores. No se publicó una revisión parcial. Siguen siendo obligatorios los controles de fuente vigente y revisión completa.',
  }),
  'progress-assessment-length-invalid': Object.freeze({
    impact: 'Un campo de aceptación sigue superando su límite de respuesta tras una sustitución completa; no se publicó el progreso.',
    action: 'Inspecciona la fase assessment, requisito {requirementId}, fuente original {sourceLineId}, campo {field}: observado {observed} puntos de código Unicode; máximo {maximum}. No repitas automáticamente la misma comparación. Valida una compilación corregida de Copilot con la fuente fijada antes de iniciar una evaluación completa nueva. Conserva todos los requisitos y citas; no recortes hechos, aumentes límites ni eludas la verificación.',
    retainedState: 'Se conservaron las etiquetas de progreso y las evaluaciones publicadas. No se publicó ningún porcentaje parcial. Verificación, revisión, cobertura y aprobación siguen siendo controles independientes.',
  }),
  'progress-completion-recovery-exhausted': Object.freeze({
    impact: 'El resultado final siguió contradiciendo la completitud después de una reevaluación completa; no se publicó el progreso.',
    action: 'Inspecciona la comparación completa fijada y los datos finales: fase assessment, campo $.progress, porcentaje {reportedProgress}%, requisitos {requirementCount}, respaldados {supportedCount}, pendientes {missingCount}, desconocidos {unknownCount}. Inicia una evaluación completa nueva cuando el proveedor pueda cumplir el contrato sin cambiarlo. Son observaciones del modelo, no evidencia independiente de ejecución ni aprobación.',
    retainedState: 'Se conservaron las etiquetas de progreso y las evaluaciones publicadas. Verificación, revisión, cobertura y aprobación siguen siendo controles independientes.',
  }),
  'bugbot-review-incomplete': Object.freeze({
    impact: 'La revisión completa de Bugbot está bloqueada: {resource} {countKind} {observed} {unit}; límite admitido {limit} ({profile}).',
    action: 'Inspecciona el recurso y su límite. Prepara los objetos inmutables ausentes mediante el flujo gestionado por la Action, corrige la fuente verificada o revisa el alcance ajeno de la PR. Repetir la misma entrada no admitida no completará la revisión. Una revisión parcial no autoriza aprobación.',
    retainedState: 'Se conservaron los findings y su estado de resolución. Este intento no publicó findings parciales ni una revisión limpia; un nuevo intento debe validar toda la fuente actual.',
  }),
  'progress-inventory-incomplete': Object.freeze({
    impact: 'La evidencia completa de progreso no está disponible ({profile}, {reason}); observado {countKind} {observedCount}, límite admitido {supportedLimit}. Extracto de rutas sin revisar: {paths}.',
    action: 'Inspecciona la comparación fijada y el límite de capacidad o integridad indicado. Repetir el intento no repara evidencia no admitida; corrige su origen o usa un protocolo revisado compatible. Un límite cero indica una comprobación de integridad, no un cupo de archivos.',
    retainedState: 'Se conservó el progreso existente. No se aceptó ninguna evaluación parcial ni publicación del progreso. Build, revisión, cobertura y aprobación siguen siendo controles independientes.',
  }),
  'progress-binary-evidence-unavailable': Object.freeze({
    impact: 'No se evaluó el progreso porque no se pueden revisar los contenidos binarios o no textuales necesarios. Rutas sin revisar ({pathCount} en total; {shownCount} mostradas; inventario completo en los detalles de ejecución): {paths}.',
    action: 'Inspecciona la base prevista de la pull request y las rutas fijadas. Los contenidos binarios cambiados necesitan fuentes revisables y procedencia; los metadatos o un build correcto no prueban la corrección del binario.',
    retainedState: 'Se conservaron las etiquetas de progreso y las evaluaciones; no se realizó ninguna evaluación del modelo. La verificación del proyecto sigue siendo un resultado independiente.',
  }),
  'issue-workflow-admission-blocked': Object.freeze({
    impact: 'La issue no fue admitida en el flujo {kind} ({reason}). Campos o etiquetas que requieren atención: {fields}.',
    action: 'Corrige los encabezados exactos y sus valores con el formulario instalado, o elimina las etiquetas de flujo incompatibles. Si formulario y perfil discrepan, ejecuta copilot doctor y revisa issueWorkflows.fieldMappings. Vuelve a ejecutar el workflow tras la corrección.',
    retainedState: 'No se inició ninguna rama ni planificador. La configuración de la issue permanece igual; esta ejecución solo informa del diagnóstico de admisión.',
  }),
  'change-size-reconciliation-failed': Object.freeze({
    impact: 'La reconciliación de tamaño se detuvo en {operation} para el destino #{targetNumber} (issue #{issueNumber}, posición del Project configurado {projectIndex}; 0 indica sin Project). Proveedor: {providerStatus}; petición: {providerReference}.',
    action: 'Corrige el error de autorización, recurso o contrato antes de reejecutar el mismo workflow. Ante fallos transitorios, espera a la recuperación del proveedor o del límite. Relee el destino: la operación fallida puede haberse aplicado remotamente.',
    retainedState: 'Se conservaron los efectos completados. Operaciones verificadas: {verifiedOperations}; tamaños de PR en Projects pendientes de vinculación: {pendingProjectSizes}. La operación fallida y las posteriores siguen sin verificar; un aviso del Check Run opcional corresponde a otra etapa de publicación.',
  }),
  'approval-evidence-read-failed': Object.freeze({
    impact: 'No se pudo verificar la evidencia de aprobación: {operation} ({reason}).',
    action: 'Comprueba el acceso {permission} de la credencial de ejecución y la respuesta indicada. Corrige los errores de autorización, recurso o esquema antes de reejecutar; reintenta los fallos transitorios solo tras recuperarse el proveedor o restablecerse el límite.',
    retainedState: 'Esta lectura fallida no autoriza ninguna aprobación. Se conservaron las PRs, revisiones y efectos externos completados.',

  }),
  'deployment-publication-context-missing': Object.freeze({
    impact: 'La creación de la release de GitHub se detuvo porque no estaba disponible su operación de despliegue persistida.',
    action: 'Comprueba que single-action-issue apunta a la issue existente y restaura el contexto verificado de su operación. Reintenta el workflow compatible con el mismo single-action-operation-id y single-action-version solo cuando ese estado esté disponible.',
    retainedState: 'Se conservaron el estado persistido y los efectos externos completados; este intento no creó una release de GitHub.',
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
  'sdd-source-context-unavailable': Object.freeze({
    impact: 'Se detuvo la fase {phase} del SDD porque no está disponible la vista del origen inmutable seleccionado. Origen: {sourceCommit}. Motivo: {reason}.',
    action: 'Revisa el motivo del contexto de origen y la ejecución enlazada. Verifica los objetos locales seleccionados, que Git admita --no-lazy-fetch, las rutas portables de archivos regulares y los límites fijos del SDK. Corrige el requisito y reintenta el workflow de la misma incidencia; no restaures archivos en el checkout predeterminado ni crees una rama manualmente.',
    retainedState: 'Se conservaron el checkout canónico, las respuestas, los SDD publicados y la rama enlazada; este intento no publicó ninguna especificación ni rama.',
  }),
  'sdd-catalog-unsupported-profile': Object.freeze({
    impact: 'La preparación del SDD se detuvo antes del análisis del modelo porque el repositorio seleccionó un perfil de catálogo que el adaptador de publicación instalado no admite.',
    action: 'Revisa los perfiles admitidos en la guía de SDD. Conserva el esquema nativo, los estados, requisitos, evidencias y bloqueos; pide a un mantenedor un adaptador compatible revisado y reintenta esta misma incidencia.',
    retainedState: 'El catálogo, las respuestas y los SDD publicados permanecen intactos; este intento no publicó ninguna especificación ni rama.',
  }),
  'sdd-catalog-missing-trusted-source': Object.freeze({
    impact: 'La preparación del SDD se detuvo antes del análisis del modelo porque falta specs/catalog.json en la revisión de origen confiable.',
    action: 'Revisa e integra el catálogo requerido mediante el workflow de documentación habilitado. Actualiza el origen confiable mostrado mediante el flujo normal de ramas gestionadas y reintenta esta misma incidencia cuando cambie esa revisión. La revisión sin cambios permanece bloqueada.',
    retainedState: 'Se conservan las respuestas, las especificaciones publicadas y cualquier rama enlazada; este intento no publicó ninguna especificación ni rama.',
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
  'sdd-draft-response-too-short': Object.freeze({
    impact: 'La respuesta de redacción del SDD no alcanzó el mínimo de {minimum} puntos de código Unicode (cantidad observada: {observed}; intento de borrador: {attempts}).',
    action: 'Aclara en la descripción de esta incidencia que se requiere una propuesta Markdown completa, conservando los requisitos resueltos y su propietario, y repite el mismo workflow. Este fallo no inicia una regeneración automática.',
    retainedState: 'Se conservaron las respuestas, la propiedad seleccionada y las especificaciones publicadas; este intento no publicó ninguna especificación ni rama.',
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
  'branch-sync-catalog-incompatible': Object.freeze({
    impact: 'La sincronización se detuvo para revisar el catálogo: perfil {profile}, fase {phase}, posición de capacidad {capabilityNumber}, campo {field}. La posición 0 identifica el documento.',
    action: 'Revisa el perfil y conserva todas las evidencias mediante una migración revisada o un adaptador compatible antes de reintentar {syncCommand}. No inventes fechas de verificación ni estados de preparación. Guía: {catalogGuide}.',
    retainedState: 'No se intentó crear ni subir un commit de sincronización; se conservaron las ramas remotas. Aborto local: {abort}. completed indica que terminó la llamada de aborto; unverified exige inspección del operador. Este resultado no certifica que la aplicación esté preparada.',
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
  'branch-sync-sensitive-paths': Object.freeze({
    impact: 'La sincronización automática se detuvo: hay {sensitiveCount} rutas protegidas entre {conflictCount} conflictos.',
    action: 'Revisa las rutas en el registro del workflow y utiliza la recuperación autorizada de mantenedores para archivos protegidos. Tras un cambio de origen aprobado, inspecciona {command} --dry-run. Repetir los mismos conflictos no cambia esta política.',
    retainedState: 'No se invocaron el agente corrector, los verificadores del repositorio ni la publicación de sincronización; se conservaron las referencias remotas.',
  }),
  'branch-sync-conflict-limit': Object.freeze({
    impact: 'La sincronización automática se detuvo: {conflictCount} conflictos superan el límite de {limit}.',
    action: 'Reduce los conflictos mediante cambios revisados o una recuperación autorizada de mantenedores; después inspecciona {command} --dry-run. Repetir el mismo comando no reduce este conjunto.',
    retainedState: 'No se invocaron el agente corrector, los verificadores del repositorio ni la publicación de sincronización; se conservaron las referencias remotas.',
  }),
  'branch-sync-fixer-unavailable': Object.freeze({
    impact: 'La sincronización se detuvo porque el merge tiene conflictos y no hay un fixer configurado.',
    action: 'Configura un fixer compatible y reintenta {command}; usa --dry-run para inspeccionar el merge sin publicarlo.',
    retainedState: 'No se publicó ningún commit de sincronización; se conservaron las ramas remotas.',
  }),
  'pull-request-link-restored': Object.freeze({
    impact: 'No se pudo vincular la pull request con su issue.',
    action: 'Vuelve a ejecutar el workflow; ningún estado temporal de la pull request requiere recuperación manual.',
    retainedState: 'Se verificaron la rama base original y la limpieza de la referencia temporal propia.',
  }),
  'pull-request-link-base-retained': Object.freeze({
    impact: 'No se pudo vincular la pull request con su issue.',
    action: 'Vuelve a ejecutar el workflow actual de la PR para recuperar el estado pendiente; revisa la propiedad si sigue bloqueado.',
    retainedState: 'La rama base predeterminada temporal permanece; se restauró la descripción original.',
  }),
  'pull-request-link-reference-retained': Object.freeze({
    impact: 'No se pudo vincular la pull request con su issue.',
    action: 'Vuelve a ejecutar el workflow actual de la PR para limpiar la referencia propia; conserva el marcador hasta verificar la base y el enlace previsto.',
    retainedState: 'Se restauró la rama base original; la referencia temporal a la issue permanece en la descripción.',
  }),
  'pull-request-link-base-and-reference-retained': Object.freeze({
    impact: 'No se pudo vincular la pull request con su issue.',
    action: 'Vuelve a ejecutar el workflow actual de la PR para recuperar la base original y la referencia propia; revisa la propiedad si sigue bloqueado.',
    retainedState: 'No se pudo verificar la base original ni la limpieza de la referencia temporal; se conservó la evidencia pendiente cuando pudo observarse.',
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
