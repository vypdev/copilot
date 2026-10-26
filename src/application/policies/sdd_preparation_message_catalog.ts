import type { AgentConfiguration } from '../../domain/agent';
import { SDD_VALIDATION_DETAILS, type SddValidationDetail } from '../../domain/sdd_validation_diagnostic';
import { MESSAGE_CATALOG_VERSION, type MessageCatalogDefinition } from '../../domain/message_catalog';
import type { MessageCatalogResolutionPort } from '../ports/message_catalog_ports';
import { resolveMessageCatalogView, resolveStaticMessageCatalogView } from './resolved_message_catalog_policy';

const UI = Object.freeze({
  fallbackSize: ['Diagnostic copy fell back to English because the localized card exceeded its fixed size bound.', 'El texto del diagnóstico pasó a inglés porque la tarjeta localizada superó su límite fijo.'] as const,
  fallbackSlices: ['Diagnostic copy fell back to English because its required catalog slices did not resolve to one language.', 'El texto del diagnóstico pasó a inglés porque sus catálogos obligatorios no se resolvieron en un mismo idioma.'] as const,
  "heading": ["Specification preparation is blocked", "La preparación de la especificación está bloqueada"] as const,
  "publicationHeading": ["Specification publication needs recovery", "La publicación de la especificación necesita recuperación"] as const,
  "noPublication": ["No new specification or branch was published by this preparation attempt.", "Este intento de preparación no publicó ninguna especificación ni rama nueva."] as const,
  "publicationRetained": ["An existing linked branch or commit may already exist. Publication is not confirmed; inspect the workflow before retrying on the same branch.", "Puede existir una rama enlazada o un commit. La publicación no está confirmada; revisa el workflow antes de reintentar en la misma rama."] as const,
  "action": ["Review the safe validation diagnostics below. Clarify requirements or decisions in this issue if needed, then retry this same issue workflow.", "Revisa los diagnósticos seguros de validación que aparecen debajo. Aclara los requisitos o las decisiones en esta incidencia si es necesario y reintenta su mismo workflow."] as const,
  "retained": ["Existing answers and published specifications are retained. Publication validation does not establish implementation acceptance.", "Se conservan las respuestas y las especificaciones publicadas. La validación de publicación no demuestra la aceptación de la implementación."] as const,
  "diagnostics": ["Validation diagnostics", "Diagnósticos de validación"] as const,
  "noEvidence": ["Specific table facts are unavailable for this failure. Inspect the sanitized workflow result; no candidate content is retained in this card.", "Este fallo no dispone de datos concretos de tablas. Revisa el resultado saneado del workflow; esta tarjeta no conserva contenido del candidato."] as const,
  "privacy": ["Only closed checks and bounded section, row and count facts are shown. Candidate text, identifiers, paths, source and credentials are withheld. No downloadable candidate is retained; rerunning creates a new bounded attempt.", "Solo se muestran comprobaciones cerradas y datos acotados de secciones, filas y cantidades. Se omiten texto, identificadores, rutas, código y credenciales del candidato. No se conserva un candidato descargable; reintentar inicia un nuevo intento acotado."] as const,
  "impact": ["Impact", "Impacto"] as const,
  "actionLabel": ["Action", "Acción"] as const,
  "retainedLabel": ["Retained state", "Estado conservado"] as const,
  "workflow": ["Workflow run", "Ejecución del workflow"] as const,
  "runUnavailable": ["The workflow run link is unavailable in this runtime.", "Este entorno no dispone de enlace a la ejecución del workflow."] as const,
  "reference": ["Reference", "Referencia"] as const,
  "code": ["Error code", "Código de error"] as const,
  "reason": ["Reason", "Motivo"] as const,
  "phase": ["Phase", "Fase"] as const,
  "attempts": ["Draft attempts", "Intentos de borrador"] as const,
  "section": ["Section", "Sección"] as const,
  "row": ["Data row", "Fila de datos"] as const,
  "expected": ["Expected count", "Cantidad esperada"] as const,
  "observed": ["Observed count", "Cantidad observada"] as const,
  "recoveredHeading": ["SDD preparation status", "Estado de preparación del SDD"] as const,
  "published": ["The specification publication was verified on the linked branch. Branch readiness remains subject to its separate checks.", "Se verificó la publicación de la especificación en la rama enlazada. La preparación de la rama sigue sujeta a comprobaciones independientes."] as const,
  "waiting": ["Waiting for the numbered answers in the specification question card. No new specification was published.", "Se esperan las respuestas numeradas de la tarjeta de preguntas. No se publicó ninguna especificación nueva."] as const,
} satisfies Record<string, readonly [string, string]>);

const FACTS = Object.freeze({
  "validation-contract": ["A content contract was rejected; this validator supplied no more specific table facts.", "Se rechazó un contrato de contenido; este validador no proporcionó datos más concretos de tablas."] as const,
  "size-limit": ["The candidate exceeded the complete draft size limit.", "El candidato superó el límite de tamaño del borrador completo."] as const,
  "response-shape": ["The drafting response did not contain the required Markdown string.", "La respuesta de redacción no contenía la cadena Markdown obligatoria."] as const,
  "required-heading": ["A canonical heading is missing; the row identifies its position in the required-heading list.", "Falta una sección canónica; la fila indica su posición en la lista de secciones obligatorias."] as const,
  "numeric-budget": ["No valid numeric test budget was found.", "No se encontró un presupuesto numérico de pruebas válido."] as const,
  "section-count": ["The required section is missing or repeated.", "La sección obligatoria falta o está repetida."] as const,
  "table-count": ["Exactly one canonical table is required in this section.", "Esta sección requiere exactamente una tabla canónica."] as const,
  "table-separator": ["The table header separator has invalid columns or formatting.", "El separador de la cabecera tiene columnas o formato no válidos."] as const,
  "table-columns": ["A data row has the wrong number of columns.", "Una fila de datos tiene un número incorrecto de columnas."] as const,
  "table-empty-cell": ["A required table cell is empty.", "Una celda obligatoria de la tabla está vacía."] as const,
  "table-empty": ["The canonical table has no data rows.", "La tabla canónica no tiene filas de datos."] as const,
  "identifier-list": ["An identifier list has invalid syntax or repeated entries.", "Una lista de identificadores tiene sintaxis no válida o entradas repetidas."] as const,
  "requirement-identity": ["Requirement identifiers must be valid and distinct.", "Los identificadores de requisitos deben ser válidos y distintos."] as const,
  "case-identity": ["Case identifiers must be fully qualified and distinct; shorthand references cannot establish identity.", "Los identificadores de casos deben ser completos y distintos; las referencias abreviadas no establecen identidad."] as const,
  "case-reserved": ["A proposed case reuses an identity reserved by an immutable owning specification.", "Un caso propuesto reutiliza una identidad reservada por una especificación propietaria inmutable."] as const,
  "case-reference": ["A case reference is absent from both the candidate and retained owner inventories.", "Una referencia de caso no existe ni en el inventario del candidato ni en el del propietario conservado."] as const,
  "budget-area": ["A case uses the reserved total label as its budget area.", "Un caso usa la etiqueta reservada del total como área de presupuesto."] as const,
  "budget-integer": ["A budget allocation is not a positive safe integer.", "Una asignación de presupuesto no es un entero positivo seguro."] as const,
  "budget-order": ["A budget area is repeated or an allocation appears after the total.", "Un área de presupuesto está repetida o aparece una asignación después del total."] as const,
  "budget-total": ["Budget totals or area membership disagree with the distinct case inventory.", "Los totales o las áreas de presupuesto no coinciden con el inventario de casos distintos."] as const,
  "budget-distribution": ["An area allocation disagrees with its enumerated cases.", "La asignación de un área no coincide con sus casos enumerados."] as const,
  "requirement-reference": ["A case refers to a requirement not defined in the requirement table.", "Un caso se refiere a un requisito que no está definido en la tabla de requisitos."] as const,
  "requirement-coverage": ["The requirement inventory and covered requirement set are incomplete.", "El inventario de requisitos y el conjunto de requisitos cubiertos están incompletos."] as const,
  "traceability-links": ["A reverse requirement row has missing, extra, duplicate or inconsistent case links.", "Una fila de trazabilidad inversa tiene vínculos de casos ausentes, adicionales, repetidos o incoherentes."] as const,
  "owner-path": ["The selected owning specification is missing from the path table or uses the wrong operation.", "La especificación propietaria seleccionada falta en la tabla de rutas o usa una operación incorrecta."] as const,
  "path-identity": ["A path is invalid, repeated or blocked by the immutable repository inventory.", "Una ruta no es válida, está repetida o está bloqueada por el inventario inmutable del repositorio."] as const,
  "create-existing-path": ["A proposed new file already exists as a file or directory.", "Un archivo propuesto como nuevo ya existe como archivo o directorio."] as const,
  "create-path-overlap": ["Two proposed file paths overlap.", "Dos rutas de archivos propuestos se solapan."] as const,
  "create-path-parent": ["A proposed path has a blocked or file-valued parent.", "Una ruta propuesta tiene un padre bloqueado o que es un archivo."] as const,
  "path-operation": ["The path operation is unsupported or targets a missing existing file.", "La operación de ruta no es compatible o apunta a un archivo existente que falta."] as const,
  "path-reference": ["A repository reference cannot be verified as an existing or explicitly proposed path.", "No se puede verificar una referencia como ruta existente o explícitamente propuesta."] as const,
  "path-link": ["A relative file link is invalid or escapes its repository boundary.", "Un enlace relativo no es válido o sale de los límites del repositorio."] as const,
} satisfies Record<SddValidationDetail, readonly [string, string]>);

type UiKey = keyof typeof UI;
export type SddPreparationMessageId = `sddPreparation.${UiKey}` | `sddPreparation.fact.${SddValidationDetail}`;
export const SDD_PREPARATION_MESSAGE_IDS: readonly SddPreparationMessageId[] = Object.freeze([
  ...(Object.keys(UI) as UiKey[]).map(key => `sddPreparation.${key}` as const),
  ...SDD_VALIDATION_DETAILS.map(key => `sddPreparation.fact.${key}` as const),
]);
function definition(locale: 'en-US' | 'es-ES', column: 0 | 1): MessageCatalogDefinition<SddPreparationMessageId> {
  return Object.freeze({ version: MESSAGE_CATALOG_VERSION, locale, compatibleBaseLanguage: locale.slice(0, 2),
    messages: Object.freeze(Object.fromEntries([
      ...Object.entries(UI).map(([key, values]) => [`sddPreparation.${key}`, values[column]]),
      ...Object.entries(FACTS).map(([key, values]) => [`sddPreparation.fact.${key}`, values[column]]),
    ])) as Readonly<Record<SddPreparationMessageId, string>> });
}
export const ENGLISH_SDD_PREPARATION_CATALOG = definition('en-US', 0);
export const SPANISH_SDD_PREPARATION_CATALOG = definition('es-ES', 1);
export const SDD_PREPARATION_CATALOGS = Object.freeze([ENGLISH_SDD_PREPARATION_CATALOG, SPANISH_SDD_PREPARATION_CATALOG]);
export function resolveStaticSddPreparationCatalog(locale: string) {
  return resolveStaticMessageCatalogView(locale, ENGLISH_SDD_PREPARATION_CATALOG, SDD_PREPARATION_CATALOGS);
}
export function resolveSddPreparationCatalog(locale: string, configuration?: Readonly<AgentConfiguration>, resolver?: MessageCatalogResolutionPort) {
  return resolveMessageCatalogView(locale, SDD_PREPARATION_MESSAGE_IDS, ENGLISH_SDD_PREPARATION_CATALOG,
    SDD_PREPARATION_CATALOGS, configuration, resolver);
}
