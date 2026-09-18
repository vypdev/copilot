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

const ENGLISH_RECOVERY_CONTENT: RecoveryContent = Object.freeze({
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
});

const SPANISH_RECOVERY_CONTENT: RecoveryContent = Object.freeze({
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
