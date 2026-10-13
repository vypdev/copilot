import { MESSAGE_CATALOG_VERSION, type CatalogMessage, type MessageCatalogDefinition } from '../../domain/message_catalog';
import { resolveStaticMessageCatalogView, type ResolvedMessageCatalogView } from './resolved_message_catalog_policy';

export const SDD_DIFF_MESSAGE_IDS = Object.freeze([
  'sddDiff.heading', 'sddDiff.status', 'sddDiff.action', 'sddDiff.not-applicable', 'sddDiff.no-publication',
  'sddDiff.initial-only', 'sddDiff.stale', 'sddDiff.pending-revision', 'sddDiff.invalid', 'sddDiff.unavailable',
  'sddDiff.ambiguous', 'sddDiff.bounded', 'sddDiff.compared', 'sddDiff.none', 'sddDiff.publish', 'sddDiff.refresh',
  'sddDiff.answer', 'sddDiff.retry', 'sddDiff.choose', 'sddDiff.reduce', 'sddDiff.first', 'sddDiff.current',
  'sddDiff.historical', 'sddDiff.historicalCurrent', 'sddDiff.card', 'sddDiff.commit', 'sddDiff.compare', 'sddDiff.lines', 'sddDiff.sections', 'sddDiff.omitted', 'sddDiff.structural',
  'sddDiff.charactersLimit', 'sddDiff.bytesLimit', 'sddDiff.linesLimit', 'sddDiff.workLimit',
] as const);
export type SddDiffMessageId = typeof SDD_DIFF_MESSAGE_IDS[number];
export type SddDiffMessageCatalog = ResolvedMessageCatalogView<SddDiffMessageId>;
const EN: Readonly<Record<SddDiffMessageId, CatalogMessage>> = Object.freeze({
  'sddDiff.heading': 'SDD structural comparison', 'sddDiff.status': 'Current status', 'sddDiff.action': 'Next action',
  'sddDiff.not-applicable': 'An SDD comparison is not applicable to this target.',
  'sddDiff.no-publication': 'No verified SDD publication is available yet.',
  'sddDiff.initial-only': 'Only the first publication is verified; there is no revision pair to compare.',
  'sddDiff.stale': 'Current issue, SDD or branch evidence changed or disagrees. Historical evidence does not certify a current comparison.',
  'sddDiff.pending-revision': 'The requested SDD revision is pending. Current change counts are unavailable.',
  'sddDiff.invalid': 'The owning SDD evidence could not be verified.',
  'sddDiff.unavailable': 'The comparison could not be verified. No current change counts are available.',
  'sddDiff.ambiguous': 'More than one SDD-eligible issue is linked to this PR.',
  'sddDiff.bounded': 'The verified documents exceed a fixed comparison limit; exact counts are unavailable.',
  'sddDiff.compared': 'Compared verified published revisions.', 'sddDiff.none': 'No action is required.',
  'sddDiff.publish': 'Publish the SDD through the existing issue workflow, then retry this command.',
  'sddDiff.refresh': 'Retry this command with current evidence; if the issue changed, resume its existing SDD clarification workflow.',
  'sddDiff.answer': 'Answer the existing SDD questions or resume publication, then retry this command.',
  'sddDiff.retry': 'Inspect the existing SDD evidence and read access, then retry this command.',
  'sddDiff.choose': 'Run this command in the intended issue conversation.',
  'sddDiff.reduce': 'Keep the SDD within the documented fixed limits, then retry this command.',
  'sddDiff.first': 'First publication', 'sddDiff.current': 'Current publication', 'sddDiff.historical': 'Historical first publication', 'sddDiff.historicalCurrent': 'Historical published revision',
  'sddDiff.card': 'SDD clarification card', 'sddDiff.commit': 'Publication commit', 'sddDiff.compare': 'Compare publication commits',
  'sddDiff.lines': 'Added lines: {added}; removed lines: {removed}.', 'sddDiff.sections': 'Changed section titles',
  'sddDiff.omitted': 'Additional changed titles omitted: {count}.',
  'sddDiff.charactersLimit': 'Limit: 70,000 characters per document.', 'sddDiff.bytesLimit': 'Limit: 280,000 UTF-8 bytes per document.',
  'sddDiff.linesLimit': 'Limit: 2,000 content lines per document.', 'sddDiff.workLimit': 'Limit: 2,000,000 line-comparison steps.',
  'sddDiff.structural': 'This compares structure and content lines; it does not assess semantic requirements.',
});
const ES: Readonly<Record<SddDiffMessageId, CatalogMessage>> = Object.freeze({
  'sddDiff.heading': 'Comparación estructural del SDD', 'sddDiff.status': 'Estado actual', 'sddDiff.action': 'Siguiente acción',
  'sddDiff.not-applicable': 'La comparación de SDD no corresponde a este destino.',
  'sddDiff.no-publication': 'Todavía no hay una publicación de SDD verificada.',
  'sddDiff.initial-only': 'Sólo está verificada la primera publicación; no hay dos revisiones que comparar.',
  'sddDiff.stale': 'La evidencia de la issue, del SDD o de la rama cambió o no coincide. La evidencia histórica no certifica una comparación actual.',
  'sddDiff.pending-revision': 'La revisión solicitada del SDD está pendiente. No hay recuentos de cambios actuales.',
  'sddDiff.invalid': 'No se pudo verificar la evidencia del SDD propietario.',
  'sddDiff.unavailable': 'No se pudo verificar la comparación. No hay recuentos de cambios actuales.',
  'sddDiff.ambiguous': 'Esta PR enlaza más de una issue apta para comparar SDD.',
  'sddDiff.bounded': 'Los documentos verificados superan un límite fijo de comparación; no hay recuentos exactos.',
  'sddDiff.compared': 'Se compararon las revisiones publicadas y verificadas.', 'sddDiff.none': 'No se requiere ninguna acción.',
  'sddDiff.publish': 'Publica el SDD mediante el flujo existente de la issue y vuelve a ejecutar el comando.',
  'sddDiff.refresh': 'Vuelve a ejecutar el comando con evidencia actual; si cambió la issue, retoma su flujo existente de aclaraciones del SDD.',
  'sddDiff.answer': 'Responde las preguntas existentes del SDD o retoma su publicación y vuelve a ejecutar el comando.',
  'sddDiff.retry': 'Revisa la evidencia existente del SDD y los permisos de lectura y vuelve a ejecutar el comando.',
  'sddDiff.choose': 'Ejecuta el comando en la conversación de la issue deseada.',
  'sddDiff.reduce': 'Mantén el SDD dentro de los límites fijos documentados y vuelve a ejecutar el comando.',
  'sddDiff.first': 'Primera publicación', 'sddDiff.current': 'Publicación actual', 'sddDiff.historical': 'Primera publicación histórica', 'sddDiff.historicalCurrent': 'Revisión publicada histórica',
  'sddDiff.card': 'Tarjeta de aclaraciones del SDD', 'sddDiff.commit': 'Commit de publicación', 'sddDiff.compare': 'Comparar commits de publicación',
  'sddDiff.lines': 'Líneas añadidas: {added}; líneas eliminadas: {removed}.', 'sddDiff.sections': 'Títulos de secciones modificadas',
  'sddDiff.omitted': 'Títulos modificados adicionales omitidos: {count}.',
  'sddDiff.charactersLimit': 'Límite: 70.000 caracteres por documento.', 'sddDiff.bytesLimit': 'Límite: 280.000 bytes UTF-8 por documento.',
  'sddDiff.linesLimit': 'Límite: 2.000 líneas de contenido por documento.', 'sddDiff.workLimit': 'Límite: 2.000.000 pasos de comparación de líneas.',
  'sddDiff.structural': 'La comparación incluye estructura y líneas de contenido; no evalúa requisitos semánticos.',
});
export const ENGLISH_SDD_DIFF_DEFINITION: MessageCatalogDefinition<SddDiffMessageId> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION, locale: 'en-US', compatibleBaseLanguage: 'en', messages: EN,
});
export const SPANISH_SDD_DIFF_DEFINITION: MessageCatalogDefinition<SddDiffMessageId> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION, locale: 'es-ES', compatibleBaseLanguage: 'es', messages: ES,
});
export function resolveSddDiffCatalog(locale: string): SddDiffMessageCatalog {
  return resolveStaticMessageCatalogView(locale, ENGLISH_SDD_DIFF_DEFINITION, [ENGLISH_SDD_DIFF_DEFINITION, SPANISH_SDD_DIFF_DEFINITION]);
}


/** Locale admission belongs to the complete bundled catalog boundary. */
export function isSddDiffResolvedLocale(value: unknown): value is 'en-US' | 'es-ES' {
  return value === 'en-US' || value === 'es-ES';
}
