import type { SetupQuestion } from '../../domain/setup_questionnaire';

export const spanishQuestionLabels: Readonly<Record<string, string>> = {
  'features.issues': 'Automatizar issues: ramas, etiquetas, proyectos y ciclo de vida',
  'features.pullRequests': 'Automatizar pull requests: revisión, descripción y ciclo de vida',
  'features.commits': 'Automatizar commits: progreso, tamaño y análisis de Bugbot',
  'features.issueComments': 'Responder a comentarios de issues y permitir correcciones de Bugbot',
  'features.pullRequestComments': 'Responder a comentarios de pull requests y permitir correcciones de Bugbot',
  'features.agentProvisioning': 'Comprobar la instalación de agentes CLI en GitHub Actions',
  'features.credentialHealth': 'Comprobar el estado de las credenciales remotas',
  'features.inactiveIssueClosure': 'Cerrar issues sin actividad tras el plazo configurado',
  'features.issueTemplates': 'Instalar plantillas de issues',
  'features.pullRequestTemplate': 'Instalar plantilla de pull request',
  'issueWorkflows.enabled': 'Tipos de flujo de issues que quieres activar',
  'repositoryAgentGuidance.enabled': '¿Generar instrucciones para agentes en el repositorio?',
  'repositoryAgentGuidance.agentsPointer': 'Cómo descubrir las instrucciones desde AGENTS.md',
  'agents.findings.modelProvider': 'Proveedor de modelo compartido (salvo configuración propia de una tarea)',
  'agents.findings.model': 'Modelo compartido (salvo configuración propia de una tarea)',
  'agents.findings.effort': 'Esfuerzo de razonamiento compartido (los ajustes por tarea se conservan)',
  'agents.findings.executable': 'Ejecutable compartido validado (los ajustes por tarea se conservan)',
  'agents.configureIndependently': '¿Configurar modelo y comando por tarea?',
  'repository.mainBranch': 'Rama de producción',
  'repository.developmentBranch': 'Rama de desarrollo',
  'repository.featureTree': 'Prefijo de ramas de funcionalidad',
  'repository.bugfixTree': 'Prefijo de ramas de corrección',
  'repository.hotfixTree': 'Prefijo de ramas de hotfix',
  'repository.releaseTree': 'Prefijo de ramas de release',
  'repository.docsTree': 'Prefijo de ramas de documentación',
  'repository.choreTree': 'Prefijo de ramas de mantenimiento',
  'repository.issueManagedBranches': '¿Puede la Action crear ramas vinculadas a issues?',
  'repository.preBranchSdd': '¿Exigir un SDD antes de crear ciertas ramas?',
  'repository.reopenIssueOnPush': '¿Reabrir issues cerrados al actualizar su rama?',
  'repository.desiredAssigneesCount': 'Número deseado de personas asignadas a issues',
  'repository.desiredReviewersCount': 'Número deseado de revisores de pull requests',
  'repository.inactivityThresholdHours': 'Horas sin actividad antes de cerrar un issue en espera',
  'repository.repositoryLocale': 'Idioma de los mensajes del repositorio',
  'repository.issueLocale': 'Idioma de los issues (vacío: heredar)',
  'repository.pullRequestLocale': 'Idioma de los pull requests (vacío: heredar)',
  'repository.commitPrefixTransforms': 'Transformación de prefijos de commits',
  'repository.releaseReconciliationStrategy': 'Estrategia para reconciliar releases',
  'repository.hotfixReconciliationStrategy': 'Estrategia para reconciliar hotfixes',
  'repository.reconciliationPullRequestMode': 'Modo de pull requests de reconciliación',
  'repository.reconciliationBackmergeMode': 'Modo de integración de vuelta',
  'repository.hotfixActiveReleasePolicy': 'Destino del hotfix durante una release activa',
  'repository.reconciliationTree': 'Prefijo de ramas de reconciliación',
  'repository.reconciliationCleanup': 'Limpieza de ramas tras reconciliar',
  'repository.reconciliationIssueCompletion': 'Qué hacer con el issue al terminar',
  'repository.orchestrationPresentationMode': 'Nivel de detalle del centro de control de releases',
  'repository.orchestrationDiagrams': '¿Mostrar diagramas accesibles de releases?',
  'repository.orchestrationCommentMode': 'Cómo publicar comentarios del ciclo de release',
  'ai.pullRequestDescriptionMode': 'Cómo actualizar la descripción de los pull requests',
  'ai.ignoreFiles': 'Archivos que la IA debe ignorar',
  'ai.membersOnly': '¿Limitar el procesamiento de IA a miembros del repositorio?',
  'ai.includeReasoning': '¿Incluir el razonamiento adicional del proveedor?',
  'ai.bugbotSeverity': 'Gravedad mínima para publicar hallazgos de Bugbot',
  'ai.bugbotCommentLimit': 'Máximo de comentarios de Bugbot por ejecución',
  'ai.bugbotFixVerifyCommands': 'Comandos para verificar correcciones de Bugbot',
  'ai.bugbotDryRun': '¿Analizar sin publicar cambios de Bugbot?',
  'ai.bugbotEffort': 'Profundidad del análisis de Bugbot',
  'ai.bugbotReviewDrafts': '¿Revisar pull requests en borrador?',
  'ai.bugbotTraceRules': '¿Indicar qué fuentes de reglas se aplicaron?',
  'ai.bugbotSuggestedChanges': '¿Publicar sugerencias de cambio seguras?',
  'ai.bugbotTelemetry': '¿Registrar métricas de Bugbot sin contenido?',
  'ai.bugbotFailOnUnresolved': '¿Bloquear el check si quedan hallazgos sin resolver?',
  'ai.bugbotOrganizationRules': 'Reglas generales de Bugbot, una por línea',
  'pullRequestApproval.mode': '¿Qué puede hacer el bot con las aprobaciones de PR?',
  'pullRequestApproval.testChecks': '¿Qué checks de CI son fiables para aprobar PRs?',
  'pullRequestApproval.producerAttested': '¿Has comprobado el job, la App y el paso obligatorio de cobertura?',
  'pullRequestApproval.coverage.mode': 'Cómo demostrar que se cumple la cobertura',
  'pullRequestApproval.coverage.checkName': 'Check fiable que exige la cobertura',
  'pullRequestApproval.coverage.minDiffPercent': 'Cobertura mínima de líneas modificadas (0–100)',
  'pullRequestApproval.coverage.artifactWorkflowName': 'Workflow que publica copilot-diff-coverage-v1',
  'pullRequestApproval.coverage.reporterAttested': '¿Has comprobado que el reporter numérico está instalado?',
  'projects.enabled': '¿Quieres integrar Projects de GitHub?',
  'projects.ids': 'Selecciona Projects existentes o indica los números de sus URL',
  'projects.statusVerified': '¿Has comprobado en GitHub los cuatro valores Status exactos de cada Project elegido?',
  'projects.issueCreatedColumn': 'Estado Status de nuevos issues',
  'projects.pullRequestCreatedColumn': 'Estado Status de nuevos pull requests',
  'projects.issueInProgressColumn': 'Estado Status de issues en curso',
  'projects.pullRequestInProgressColumn': 'Estado Status de pull requests en curso',
  createInitialTag: '¿Crear v1.0.0 si todavía no existe ningún tag?',
  manageRepositoryVariables: '¿Crear o actualizar Variables de GitHub Actions?',
  manageRepositorySecrets: '¿Validar y configurar Secrets de GitHub Actions?',
};

const roleNames: Readonly<Record<string, string>> = {
  planner: 'Planificación', findings: 'Hallazgos', reviewer: 'Revisión', fixer: 'Corrección', tester: 'Pruebas',
};

export function spanishQuestionLabel(question: SetupQuestion): string {
  if (spanishQuestionLabels[question.id]) return spanishQuestionLabels[question.id];
  const agent = question.id.match(/^agents\.(planner|findings|reviewer|fixer|tester)\.(provider|modelProvider|model|effort|executable)$/u);
  if (agent) {
    const field: Record<string, string> = { provider: 'agente CLI', modelProvider: 'proveedor del modelo', model: 'modelo', effort: 'esfuerzo', executable: 'comando ejecutable' };
    return `${roleNames[agent[1]]}: ${field[agent[2]]}`;
  }
  const storage = question.id.match(/^storage\.(variables|secrets)\.(defaultScope|organizationVisibility|preserveExisting|overrides)$/u);
  if (storage) {
    const resource = storage[1] === 'variables' ? 'Variables' : 'Secrets';
    const field: Record<string, string> = { defaultScope: 'ámbito predeterminado', organizationVisibility: 'visibilidad en la organización', preserveExisting: 'conservar los existentes', overrides: 'excepciones de ámbito' };
    return `${resource}: ${field[storage[2]]}`;
  }
  return question.label;
}
