import type { SddOwnershipFailureReason } from '../../domain/pre_branch_sdd';

export function sddAnalysisStatusMarker(issueNumber: number): string {
  return `<!-- copilot:sdd-analysis-status:v1 issue="${issueNumber}" -->`;
}

const reasons: Record<SddOwnershipFailureReason, readonly [string, string]> = {
  'update-owner-mismatch': ['The update path does not belong to the selected catalog owner.', 'La ruta de actualización no pertenece al propietario seleccionado del catálogo.'],
  'companion-owner-unknown': ['The companion owner is absent from the catalog.', 'El propietario del SDD complementario no existe en el catálogo.'],
  'companion-path-registered': ['The companion path is already registered in the catalog.', 'La ruta del SDD complementario ya está registrada en el catálogo.'],
  'new-owner-registered': ['The proposed new capability already exists in the catalog.', 'La capacidad propuesta como nueva ya existe en el catálogo.'],
  'new-path-registered': ['The proposed new SDD path is already registered in the catalog.', 'La ruta propuesta como nueva ya está registrada en el catálogo.'],
};

/** Stateless diagnostic, deliberately separate from the validated readiness record. */
export function renderSddAnalysisStatus(issueNumber: number, locale: string | undefined, reason?: SddOwnershipFailureReason): string {
  const spanish = /^es(?:-|$)/i.test(locale ?? '');
  const marker = sddAnalysisStatusMarker(issueNumber);
  if (!reason) return spanish
    ? `## Estado del análisis del SDD\n\nEl análisis posterior ha validado la propiedad. La publicación y la preparación de la rama siguen pendientes de sus comprobaciones.\n\n${marker}`
    : `## SDD analysis status\n\nA subsequent analysis validated ownership. Publication and branch readiness remain subject to their checks.\n\n${marker}`;
  return spanish
    ? `## Estado del SDD: análisis bloqueado\n\nNo se ha preparado ningún borrador ni publicación nueva. ${reasons[reason][1]}\n\n**Acción de mantenimiento:** Aclara en la misma issue el ID de capacidad del catálogo y la ruta: una actualización usa una ruta de ese propietario; un complemento usa un propietario existente y una ruta nueva; una capacidad nueva necesita ID y ruta sin registrar. Después vuelve a ejecutar el workflow original. Cada ejecución hace un solo análisis; no hay reparación ni reintento automático. Se conservan las respuestas, los SDD y las publicaciones anteriores.\n\n**Diagnóstico:** \`${reason}\`. La decisión rechazada no autoriza una rama ni la etiqueta de preparación.\n\n${marker}`
    : `## SDD work status: analysis blocked\n\nNo draft or new publication was prepared. ${reasons[reason][0]}\n\n**Maintainer action:** Clarify the catalog capability ID and path in this same issue: an update uses a path owned by that capability; a companion uses an existing owner and a new path; a new capability needs an unregistered ID and path. Then rerun the original workflow. Each invocation performs one analysis; there is no automatic repair or retry. Existing answers, SDDs and publications are retained.\n\n**Diagnostic:** \`${reason}\`. The rejected decision authorizes no branch or readiness label.\n\n${marker}`;
}
