import type { SetupQuestion } from '../../domain/setup_questionnaire';

type Purpose = Readonly<{ en: string; es: string }>;

/** Field-specific meaning for choices whose label alone is easy to misinterpret. */
export const setupQuestionPurposes: Readonly<Record<string, Purpose>> = {
  'issueWorkflows.enabled': { en: 'Choose the issue workflows Copilot may run; each type has different branch, label and automation effects.', es: 'Elige los flujos de issues que podrá ejecutar Copilot; cada tipo tiene efectos distintos sobre ramas, etiquetas y automatización.' },
  'repositoryAgentGuidance.enabled': { en: 'Generate repository instructions that tell AI agents how to work safely in this project.', es: 'Genera instrucciones para que los agentes de IA trabajen con seguridad en este proyecto.' },
  'repositoryAgentGuidance.agentsPointer': { en: 'Choose whether the root AGENTS.md points to generated instructions, is created if missing, or stays untouched.', es: 'Elige si el AGENTS.md raíz apunta a las instrucciones generadas, se crea si falta o permanece intacto.' },
  'agents.configureIndependently': { en: 'Give planning, findings, review, fixing and testing separate provider and model settings instead of shared defaults.', es: 'Da a planificación, hallazgos, revisión, corrección y pruebas ajustes distintos de proveedor y modelo.' },
  'repository.mainBranch': { en: 'Name the production branch; release and hotfix automation use it as their production reference.', es: 'Indica la rama de producción; las automatizaciones de release y hotfix la usan como referencia.' },
  'repository.developmentBranch': { en: 'Name the normal integration branch; branch creation and reconciliation target it.', es: 'Indica la rama de integración habitual; la creación de ramas y la reconciliación la usan.' },
  'repository.issueManagedBranches': { en: 'Allow the Action to create a linked branch when an issue enters an in-progress state.', es: 'Permite a la Action crear una rama vinculada cuando un issue pasa a «en curso».' },
  'repository.preBranchSdd': { en: 'Require an approved design document before feature or contract-changing branches are created.', es: 'Exige un diseño aprobado antes de crear ramas de funcionalidad o cambios de contrato.' },
  'repository.reopenIssueOnPush': { en: 'Reopen a completed issue when someone pushes more work to its linked branch.', es: 'Reabre un issue completado si alguien añade cambios a su rama vinculada.' },
  'repository.desiredAssigneesCount': { en: 'Set how many people Copilot assigns to a new issue; zero disables automatic assignment.', es: 'Define cuántas personas asigna Copilot a un issue nuevo; cero desactiva la asignación automática.' },
  'repository.desiredReviewersCount': { en: 'Set how many reviewers Copilot requests for a pull request; zero disables automatic requests.', es: 'Define cuántos revisores solicita Copilot para un pull request; cero desactiva la solicitud automática.' },
  'repository.inactivityThresholdHours': { en: 'Set how long an issue waits without activity before the enabled inactivity workflow may close it.', es: 'Define cuánto tiempo espera sin actividad un issue antes de que el flujo habilitado pueda cerrarlo.' },
  'repository.repositoryLocale': { en: 'Choose the BCP-47 language tag for Copilot messages on GitHub; this does not change the setup page language.', es: 'Elige la etiqueta BCP-47 de los mensajes de Copilot en GitHub; no cambia el idioma de esta página.' },
  'repository.issueLocale': { en: 'Override the GitHub message language for issues; leave empty to inherit the repository language.', es: 'Cambia el idioma de los mensajes de issues; vacío hereda el idioma del repositorio.' },
  'repository.pullRequestLocale': { en: 'Override the GitHub message language for pull requests; leave empty to inherit the repository language.', es: 'Cambia el idioma de los mensajes de pull requests; vacío hereda el idioma del repositorio.' },
  'repository.commitPrefixTransforms': { en: 'Define commit-prefix rewrites used by commit automation; leave empty if your conventions need no mapping.', es: 'Define sustituciones de prefijos de commits; déjalo vacío si tus convenciones no necesitan cambios.' },
  'repository.releaseReconciliationStrategy': { en: 'Choose how completed release changes return to development without losing production lineage.', es: 'Elige cómo vuelven los cambios de una release a desarrollo sin perder su relación con producción.' },
  'repository.hotfixReconciliationStrategy': { en: 'Choose how an emergency production fix is carried back to ongoing branches.', es: 'Elige cómo se incorpora un arreglo urgente de producción a las demás ramas activas.' },
  'repository.reconciliationPullRequestMode': { en: 'Choose whether reconciliation PRs are created, merged automatically, queued, or left for a human.', es: 'Elige si los PR de reconciliación se crean, fusionan automáticamente, encolan o quedan para una persona.' },
  'repository.reconciliationBackmergeMode': { en: 'Choose whether the return merge is direct or goes through a synchronization branch.', es: 'Elige si la integración de vuelta es directa o pasa por una rama de sincronización.' },
  'repository.hotfixActiveReleasePolicy': { en: 'Choose where a hotfix propagates when a release branch is already active.', es: 'Elige a dónde se propaga un hotfix si ya hay una rama de release activa.' },
  'repository.reconciliationCleanup': { en: 'Choose which temporary branches are deleted after successful reconciliation.', es: 'Elige qué ramas temporales se eliminan tras una reconciliación correcta.' },
  'repository.reconciliationIssueCompletion': { en: 'Choose whether the issue that launched reconciliation closes or stays open for follow-up.', es: 'Elige si el issue que inició la reconciliación se cierra o sigue abierto.' },
  'repository.orchestrationPresentationMode': { en: 'Choose how much release progress and detail appears in the GitHub control-center view.', es: 'Elige cuánto progreso y detalle muestra el centro de control de releases en GitHub.' },
  'repository.orchestrationDiagrams': { en: 'Include accessible Mermaid diagrams in release status information.', es: 'Incluye diagramas Mermaid accesibles en la información de releases.' },
  'repository.orchestrationCommentMode': { en: 'Choose whether release lifecycle comments update in place or are posted at milestones.', es: 'Elige si los comentarios de la release se actualizan o se publican en cada hito.' },
  'ai.pullRequestDescriptionMode': { en: 'Choose whether AI replaces, appends to, preserves, or never edits pull-request descriptions.', es: 'Elige si la IA sustituye, amplía, conserva o nunca modifica las descripciones de pull requests.' },
  'ai.ignoreFiles': { en: 'List file patterns the AI review should skip; this does not hide those files on GitHub.', es: 'Indica patrones de archivos que la revisión con IA debe omitir; no los oculta en GitHub.' },
  'ai.membersOnly': { en: 'Allow AI processing only for requests from repository members, not arbitrary external contributors.', es: 'Permite el procesamiento con IA solo para miembros del repositorio, no para colaboradores externos.' },
  'ai.bugbotSeverity': { en: 'Set the lowest severity Bugbot publishes; lower-severity findings remain unpublished.', es: 'Define la gravedad mínima que publica Bugbot; los hallazgos menores no se publican.' },
  'ai.bugbotCommentLimit': { en: 'Cap the number of Bugbot review comments in one run to avoid overwhelming a pull request.', es: 'Limita los comentarios de Bugbot por ejecución para no saturar un pull request.' },
  'ai.bugbotFixVerifyCommands': { en: 'Specify commands that must pass before Bugbot considers an automatic fix verified.', es: 'Indica los comandos que deben pasar antes de considerar verificada una corrección de Bugbot.' },
  'ai.bugbotEffort': { en: 'Choose the depth of Bugbot reviews; higher effort can take longer and use more model capacity.', es: 'Elige la profundidad de las revisiones de Bugbot; más esfuerzo puede tardar y consumir más.' },
  'ai.bugbotReviewDrafts': { en: 'Decide whether Bugbot reviews draft pull requests before they are marked ready.', es: 'Decide si Bugbot revisa pull requests en borrador antes de que estén listos.' },
  'ai.bugbotTraceRules': { en: 'Include the source of each applied review rule in Bugbot summaries for auditability.', es: 'Incluye la procedencia de las reglas aplicadas en los resúmenes de Bugbot para facilitar auditorías.' },
  'ai.bugbotSuggestedChanges': { en: 'Allow Bugbot to attach safe inline code suggestions to published findings.', es: 'Permite a Bugbot adjuntar sugerencias de código seguras a los hallazgos publicados.' },
  'ai.bugbotTelemetry': { en: 'Record operational Bugbot metrics without recording repository content.', es: 'Registra métricas operativas de Bugbot sin guardar contenido del repositorio.' },
  'ai.bugbotFailOnUnresolved': { en: 'Make the Bugbot workflow check fail while actionable findings remain unresolved.', es: 'Hace fallar el check de Bugbot mientras queden hallazgos accionables sin resolver.' },
  'pullRequestApproval.mode': { en: 'Choose whether the bot recommends approval, may submit a guarded GitHub approval, or does neither.', es: 'Elige si el bot recomienda aprobar, puede publicar una aprobación protegida o no interviene.' },
  'pullRequestApproval.coverage.minDiffPercent': { en: 'Set the minimum percentage of changed lines that a trusted numeric reporter must prove are covered.', es: 'Define el porcentaje mínimo de líneas modificadas cubiertas que debe acreditar un reporter numérico fiable.' },
  'pullRequestApproval.coverage.artifactWorkflowName': { en: 'Name the exact trusted workflow that publishes the copilot-diff-coverage-v1 artifact.', es: 'Indica el workflow fiable exacto que publica el artefacto copilot-diff-coverage-v1.' },
  'pullRequestApproval.coverage.reporterAttested': { en: 'Confirm you inspected the numeric coverage reporter in that exact workflow, not just its green check.', es: 'Confirma que revisaste el reporter numérico en ese workflow exacto, no solo su check verde.' },
  'projects.enabled': { en: 'Decide whether Copilot should add issues and pull requests to existing GitHub Projects; the setup PAT is needed to list private organization Projects later.', es: 'Decide si Copilot debe añadir issues y pull requests a Projects existentes; el PAT de setup hará falta después para consultar Projects privados de la organización.' },
  'projects.ids': { en: 'Choose existing Projects by title after PAT verification, or enter the positive number in each Project URL; PVT_ node IDs are not used.', es: 'Elige Projects existentes por título tras verificar el PAT o introduce el número positivo de cada URL; no se usan IDs de nodo PVT_.' },
  'projects.statusVerified': { en: 'Confirm that all four chosen Status options actually exist in every selected Project when GitHub could not verify their fields.', es: 'Confirma que las cuatro opciones Status existen en todos los Projects elegidos cuando GitHub no pudo comprobar sus campos.' },
  manageRepositoryVariables: { en: 'Allow setup to create or update GitHub Actions Variables required by selected workflows.', es: 'Permite a setup crear o actualizar Variables de GitHub Actions necesarias para los workflows elegidos.' },
  manageRepositorySecrets: { en: 'Allow setup to validate and install required GitHub Actions Secrets, including the bot PAT when needed.', es: 'Permite a setup validar e instalar Secrets de GitHub Actions, incluido el PAT del bot cuando haga falta.' },
};

export function setupQuestionPurpose(question: SetupQuestion): Purpose | undefined {
  const exact = setupQuestionPurposes[question.id];
  if (exact) return exact;
  if (question.id.startsWith('features.')) return {
    en: `Enable or disable ${question.label.toLowerCase()}. Disabling it removes its automation and conditional permission needs from this setup.`,
    es: 'Activa o desactiva esta función. Si la desactivas, setup no instalará su automatización ni solicitará sus permisos condicionales.',
  };
  if (/^agents\.[^.]+\.provider$/u.test(question.id)) return {
    en: 'Choose the agent CLI for this task in GitHub Actions; the provider determines the runner command and credentials.',
    es: 'Elige el agente CLI de esta tarea en GitHub Actions; determina el comando y las credenciales del runner.',
  };
  const agentSetting = question.id.match(/^agents\.[^.]+\.(modelProvider|model|effort|executable)$/u)?.[1];
  if (agentSetting) {
    const shared = question.stateId === 'agent-model-defaults';
    const scope = shared ? { en: 'enabled agent tasks without a per-role override', es: 'las tareas activas del agente sin una excepción propia' }
      : { en: 'this agent task', es: 'esta tarea del agente' };
    const setting: Record<string, Purpose> = {
      modelProvider: { en: 'the service that supplies the model and its credentials', es: 'el servicio que proporciona el modelo y sus credenciales' },
      model: { en: 'the exact model name allowed by the selected provider', es: 'el nombre exacto del modelo permitido por el proveedor elegido' },
      effort: { en: 'the reasoning-effort level, or leave empty for the provider default', es: 'el nivel de razonamiento, o vacío para usar el valor del proveedor' },
      executable: { en: 'the executable available on the GitHub Actions runner, not this computer', es: 'el ejecutable disponible en el runner de GitHub Actions, no en este ordenador' },
    };
    return {
      en: `Set ${setting[agentSetting].en} for ${scope.en}.`,
      es: `Define ${setting[agentSetting].es} para ${scope.es}.`,
    };
  }
  if (/^repository\.(feature|bugfix|hotfix|release|docs|chore|reconciliation)Tree$/u.test(question.id)) return {
    en: 'Set the prefix of branches Copilot creates for this work type; it must match your naming policy.',
    es: 'Define el prefijo de las ramas que Copilot crea para este tipo de trabajo; debe seguir tus reglas de nombres.',
  };
  if (/^projects\.(issue|pullRequest)(Created|InProgress)Column$/u.test(question.id)) return {
    en: 'Choose the existing Status field option applied when this issue or pull request is created or enters progress; it is not a board-view column name.',
    es: 'Elige la opción existente del campo Status al crear este issue o pull request o pasarlo a «en curso»; no es el nombre de una columna visual.',
  };
  const storageSetting = question.id.match(/^storage\.(variables|secrets)\.(defaultScope|organizationVisibility|preserveExisting|overrides)$/u);
  if (storageSetting) {
    const resource = storageSetting[1] === 'variables' ? 'Variables' : 'Secrets';
    const setting: Record<string, Purpose> = {
      defaultScope: { en: `Choose whether new ${resource} live in the repository or organization; organization storage can need extra PAT grants.`, es: `Elige si los ${resource} nuevos se guardan en el repositorio o la organización; este último ámbito puede exigir más permisos del PAT.` },
      organizationVisibility: { en: `Choose which repositories can use organization ${resource}; selected is the narrowest visibility.`, es: `Elige qué repositorios pueden usar los ${resource} de la organización; «selected» es la visibilidad más restringida.` },
      preserveExisting: { en: `Keep effective existing ${resource} instead of overwriting them during setup.`, es: `Conserva los ${resource} existentes que ya se aplican, en lugar de sobrescribirlos durante setup.` },
      overrides: { en: `Select inherited organization ${resource} that should instead be set at repository scope.`, es: `Selecciona los ${resource} heredados de la organización que quieras definir en el repositorio.` },
    };
    const purpose = setting[storageSetting[2]];
    return storageSetting[1] === 'secrets' && storageSetting[2] === 'preserveExisting' ? {
      en: `${purpose.en} The bot Secret PAT is always supplied, validated and replaced at its selected scope.`,
      es: `${purpose.es} El Secret PAT del bot siempre se introduce, valida y sustituye en el ámbito elegido.`,
    } : purpose;
  }
  return undefined;
}
