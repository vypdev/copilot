import type { PermissionName, PermissionTerm } from '../permissionTerms';
export const namesEs: Readonly<Record<PermissionName, string>> = {
  Metadata: 'Metadatos', Contents: 'Contenido', Secrets: 'Secretos', Variables: 'Variables', Issues: 'Incidencias', Actions: 'Acciones', Checks: 'Comprobaciones', Administration: 'Administración', Workflows: 'Flujos de trabajo', 'Issue Types': 'Tipos de incidencia', Projects: 'Proyectos', 'Pull requests': 'Solicitudes de cambio', Members: 'Miembros',
};
export const termsEs: Readonly<Record<PermissionTerm, string>> = {
  repository: 'repositorio', organization: 'organización', read: 'Lectura', write: 'Escritura', required: 'Obligatorio', conditional: 'Condicional', verified: 'Verificado', available: 'Lectura disponible', missing: 'Faltante', unverifiable: 'No verificable',
};
