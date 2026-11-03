export const ENGLISH_ASSIGNMENT_LABELS = {
    assignmentRead: 'reading current assignees', assignmentLookup: 'checking organization membership',
    assignmentSelect: 'selecting additional members', assignmentCreator: 'assigning the creator', assignmentMembers: 'assigning additional members',
    assignmentReadOperation: 'issue assignees', assignmentTeams: 'organization teams', assignmentTeamMembers: 'organization team members',
    assignmentAdd: 'add issue assignees', assignmentClient: 'provider client initialization', assignmentUnavailable: 'unavailable',
    assignmentReadVerified: 'verified', assignmentWriteNone: 'not attempted', assignmentWriteUnverified: 'outcome unverified; it may have applied',
    assignmentWriteVerified: 'confirmed', assignmentAccess: 'Check the configured credential, documented access and target resource before retrying. A 404 alone does not establish that a private resource is absent.',
} as const;
export const ASSIGNMENT_DIAGNOSTIC_LABEL_KEYS = Object.keys(ENGLISH_ASSIGNMENT_LABELS) as Array<keyof typeof ENGLISH_ASSIGNMENT_LABELS>;
export const SPANISH_ASSIGNMENT_LABELS: Record<keyof typeof ENGLISH_ASSIGNMENT_LABELS, string> = {
    assignmentRead: 'leer las personas asignadas', assignmentLookup: 'consultar los miembros de la organización',
    assignmentSelect: 'seleccionar miembros adicionales', assignmentCreator: 'asignar al autor', assignmentMembers: 'asignar miembros adicionales',
    assignmentReadOperation: 'personas asignadas a la issue', assignmentTeams: 'equipos de la organización', assignmentTeamMembers: 'miembros de los equipos',
    assignmentAdd: 'añadir personas asignadas', assignmentClient: 'inicialización del cliente', assignmentUnavailable: 'no disponible',
    assignmentReadVerified: 'verificada', assignmentWriteNone: 'no intentada', assignmentWriteUnverified: 'resultado sin verificar; pudo aplicarse',
    assignmentWriteVerified: 'confirmada', assignmentAccess: 'Comprueba la credencial configurada, el acceso documentado y el recurso antes de reintentar. Un 404 por sí solo no demuestra que un recurso privado no exista.',
};

export const ENGLISH_ASSIGNMENT_CONTENT = {
    'issue-assignment-failed': {
        impact: 'Automatic assignment for #{targetNumber} stopped during {stage}. Provider operation: {operation}; status: {providerStatus}.',
        action: '{guidance} Rerun the same issue workflow after addressing the cause; it rereads assignees before adding missing members.',
        retainedState: 'Verified new assignments: {confirmedAssignments}. Remaining target count: {remainingAssignments}. Current assignee read: {assigneeRead}. Assignment write: {mutation}. Independent completed lifecycle effects are retained in their own results.',
    },
};
export const SPANISH_ASSIGNMENT_CONTENT = {
    'issue-assignment-failed': {
        impact: 'La asignación automática de #{targetNumber} se detuvo al {stage}. Operación del proveedor: {operation}; estado: {providerStatus}.',
        action: '{guidance} Repite el mismo workflow tras resolver la causa; volverá a leer las personas asignadas antes de añadir las pendientes.',
        retainedState: 'Asignaciones nuevas verificadas: {confirmedAssignments}. Objetivo pendiente: {remainingAssignments}. Lectura de personas asignadas: {assigneeRead}. Escritura de asignaciones: {mutation}. Los efectos independientes completados se conservan en sus propios resultados.',
    },
};
