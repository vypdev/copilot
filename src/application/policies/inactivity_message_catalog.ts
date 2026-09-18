import type { AgentConfiguration } from '../../domain/agent';
import {
  MESSAGE_CATALOG_VERSION,
  type CatalogMessage,
  type MessageCatalogDefinition,
} from '../../domain/message_catalog';
import type { MessageCatalogResolutionPort } from '../ports/message_catalog_ports';
import {
  resolveMessageCatalogView,
  resolveStaticMessageCatalogView,
  type ResolvedMessageCatalogView,
} from './resolved_message_catalog_policy';

export const INACTIVITY_MESSAGE_IDS = Object.freeze([
  'inactivity.closure.heading',
  'inactivity.closure.reason',
  'inactivity.closure.reopen',
  'inactivity.summary.scanned',
  'inactivity.summary.closed',
  'inactivity.summary.skipped',
  'inactivity.summary.none',
  'inactivity.error.scan',
  'inactivity.error.revalidate',
  'inactivity.error.close',
  'inactivity.error.comment',
] as const);

export type InactivityMessageId = typeof INACTIVITY_MESSAGE_IDS[number];
export type InactivityMessageCatalog = ResolvedMessageCatalogView<InactivityMessageId>;

const ENGLISH_MESSAGES: Readonly<Record<InactivityMessageId, CatalogMessage>> = Object.freeze({
  'inactivity.closure.heading': 'Issue closed after inactivity',
  'inactivity.closure.reason': Object.freeze({
    one: 'No activity was detected for at least {count} hour while this issue was waiting for a response.',
    other: 'No activity was detected for at least {count} hours while this issue was waiting for a response.',
  }),
  'inactivity.closure.reopen': 'If it still needs attention, reopen it and add a comment with the current context.',
  'inactivity.summary.scanned': Object.freeze({
    one: 'Scanned {count} open issue waiting for a response.',
    other: 'Scanned {count} open issues waiting for a response.',
  }),
  'inactivity.summary.closed': Object.freeze({
    one: 'Closed {count} issue after the inactivity threshold.',
    other: 'Closed {count} issues after the inactivity threshold.',
  }),
  'inactivity.summary.skipped': Object.freeze({
    one: 'Skipped {count} candidate because it was no longer eligible.',
    other: 'Skipped {count} candidates because they were no longer eligible.',
  }),
  'inactivity.summary.none': 'No issue was closed for inactivity.',
  'inactivity.error.scan': 'Unable to scan issues for inactivity closure.',
  'inactivity.error.revalidate': 'Unable to recheck issue #{issueNumber} before inactivity closure.',
  'inactivity.error.close': 'Unable to close issue #{issueNumber} after inactivity.',
  'inactivity.error.comment': 'Issue #{issueNumber} was closed, but its inactivity explanation could not be published.',
});

const SPANISH_MESSAGES: Readonly<Record<InactivityMessageId, CatalogMessage>> = Object.freeze({
  'inactivity.closure.heading': 'Issue cerrada por inactividad',
  'inactivity.closure.reason': Object.freeze({
    one: 'No se detectó actividad durante al menos {count} hora mientras esta issue esperaba una respuesta.',
    many: 'No se detectó actividad durante al menos {count} horas mientras esta issue esperaba una respuesta.',
    other: 'No se detectó actividad durante al menos {count} horas mientras esta issue esperaba una respuesta.',
  }),
  'inactivity.closure.reopen': 'Si todavía necesita atención, vuelve a abrirla y añade un comentario con el contexto actualizado.',
  'inactivity.summary.scanned': Object.freeze({
    one: 'Se revisó {count} issue abierta que esperaba una respuesta.',
    many: 'Se revisaron {count} issues abiertas que esperaban una respuesta.',
    other: 'Se revisaron {count} issues abiertas que esperaban una respuesta.',
  }),
  'inactivity.summary.closed': Object.freeze({
    one: 'Se cerró {count} issue tras superar el límite de inactividad.',
    many: 'Se cerraron {count} issues tras superar el límite de inactividad.',
    other: 'Se cerraron {count} issues tras superar el límite de inactividad.',
  }),
  'inactivity.summary.skipped': Object.freeze({
    one: 'Se omitió {count} candidata porque ya no cumplía los requisitos.',
    many: 'Se omitieron {count} candidatas porque ya no cumplían los requisitos.',
    other: 'Se omitieron {count} candidatas porque ya no cumplían los requisitos.',
  }),
  'inactivity.summary.none': 'No se cerró ninguna issue por inactividad.',
  'inactivity.error.scan': 'No se pudieron revisar las issues para aplicar el cierre por inactividad.',
  'inactivity.error.revalidate': 'No se pudo volver a comprobar la issue #{issueNumber} antes de cerrarla por inactividad.',
  'inactivity.error.close': 'No se pudo cerrar la issue #{issueNumber} por inactividad.',
  'inactivity.error.comment': 'La issue #{issueNumber} se cerró, pero no se pudo publicar la explicación sobre su inactividad.',
});

export const ENGLISH_INACTIVITY_DEFINITION: MessageCatalogDefinition<InactivityMessageId> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION,
  locale: 'en-US',
  compatibleBaseLanguage: 'en',
  messages: ENGLISH_MESSAGES,
});

export const SPANISH_INACTIVITY_DEFINITION: MessageCatalogDefinition<InactivityMessageId> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION,
  locale: 'es-ES',
  compatibleBaseLanguage: 'es',
  messages: SPANISH_MESSAGES,
});

export const INACTIVITY_CATALOG_DEFINITIONS = Object.freeze([
  ENGLISH_INACTIVITY_DEFINITION,
  SPANISH_INACTIVITY_DEFINITION,
]);

export function resolveStaticInactivityCatalog(locale: string): InactivityMessageCatalog {
  return resolveStaticMessageCatalogView(
    locale,
    ENGLISH_INACTIVITY_DEFINITION,
    INACTIVITY_CATALOG_DEFINITIONS,
  );
}

export async function resolveInactivityCatalog(
  locale: string,
  configuration: Readonly<AgentConfiguration> | undefined,
  resolver: MessageCatalogResolutionPort | undefined,
): Promise<InactivityMessageCatalog> {
  return resolveMessageCatalogView(
    locale,
    INACTIVITY_MESSAGE_IDS,
    ENGLISH_INACTIVITY_DEFINITION,
    INACTIVITY_CATALOG_DEFINITIONS,
    configuration,
    resolver,
  );
}
