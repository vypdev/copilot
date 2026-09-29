import type { SetupQuestion } from '../../domain/setup_questionnaire';
import type { SetupQuestionExplanation, SetupQuestionPresentation } from '../contracts/web_setup_view';
import { spanishQuestionLabel } from './setup_question_translations';
import { setupQuestionDocumentation } from './setup_question_documentation_policy';
import { setupQuestionPurpose } from './setup_question_purpose_policy';
import { frenchQuestionExplanation } from './setup_question_guidance_fr';
import { portugueseQuestionExplanation } from './setup_question_guidance_pt';

type Copy = Pick<SetupQuestionExplanation, 'summary' | 'when' | 'example' | 'effect' | 'verify'>;

const location: Readonly<Record<SetupQuestion['stateId'], { en: string; es: string }>> = {
  capabilities: { en: 'Setup writes the selected workflow files into this repository and requests only the GitHub permissions those workflows need.', es: 'Setup escribe los workflows seleccionados en este repositorio y solicita solo los permisos de GitHub necesarios.' },
  'agent-runtime': { en: 'The generated GitHub Actions workflows invoke this agent on their runner; this does not install an agent on your computer.', es: 'Los workflows de GitHub Actions invocan este agente en su runner; no se instala en tu ordenador.' },
  'agent-model-defaults': { en: 'The shared model and command defaults are stored in the repository configuration consumed by the generated workflows.', es: 'Los valores comunes de modelo y comando se guardan en la configuración del repositorio que usan los workflows.' },
  'agent-role-overrides': { en: 'This task-specific override is stored in the repository configuration and read only when that task runs.', es: 'Esta excepción por tarea se guarda en la configuración del repositorio y se lee cuando se ejecuta esa tarea.' },
  repository: { en: 'The repository profile and generated workflows use this value for future branch, issue and pull-request events.', es: 'El perfil del repositorio y los workflows generados usan este valor en futuros eventos de ramas, issues y pull requests.' },
  deployment: { en: 'The repository profile controls later release and hotfix workflows; nothing is released by answering this question.', es: 'El perfil del repositorio controla los futuros workflows de release y hotfix; responder no publica ninguna versión.' },
  bugbot: { en: 'The generated workflow reads this setting from repository configuration or selected GitHub Actions Variables when Bugbot runs.', es: 'El workflow lee este ajuste de la configuración o las Variables de GitHub Actions seleccionadas al ejecutar Bugbot.' },
  'pull-request-approval': { en: 'The guarded-approval configuration uses exact CI producer identities and evidence from GitHub pull-request runs.', es: 'La aprobación protegida usa identidades exactas de los productores de CI y pruebas de las ejecuciones de PR en GitHub.' },
  projects: { en: 'Future issue and pull-request automation uses the selected GitHub Projects and their Status field values.', es: 'La automatización futura de issues y pull requests usa los GitHub Projects y los valores de su campo Status.' },
  provisioning: { en: 'After the final Apply confirmation, setup may create or update the selected files and GitHub Actions resources.', es: 'Tras confirmar Aplicar, setup podrá crear o actualizar los archivos y recursos de GitHub Actions elegidos.' },
  storage: { en: 'GitHub Actions stores these resources at repository or organization scope; the scope changes visibility and required PAT grants.', es: 'GitHub Actions guarda estos recursos en el repositorio o la organización; el ámbito cambia la visibilidad y los permisos del PAT.' },
};

const special: Readonly<Record<string, { en: Copy; es: Copy }>> = {
  'agents.findings.executable': {
    en: { summary: 'Choose the agent command used on the GitHub Actions runner, not on this computer.', when: 'Only change this for a runner with a deliberately installed custom agent binary.', example: 'Leave empty for codex, opencode, or agent according to the provider.', effect: 'A custom path is shared unless a task has its own override; it is never installed automatically.', verify: 'Check the runner has this exact executable before enabling the workflow.' },
    es: { summary: 'Elige el comando del agente en el runner de GitHub Actions, no en este ordenador.', when: 'Cámbialo solo si el runner tiene instalado expresamente otro binario.', example: 'Déjalo vacío para usar codex, opencode o agent según el proveedor.', effect: 'La ruta personalizada se comparte salvo que una tarea tenga su propia excepción; nunca se instala automáticamente.', verify: 'Comprueba que el runner tiene exactamente ese ejecutable.' },
  },
  'ai.includeReasoning': {
    en: { summary: 'Ask for additional provider reasoning when the agent response exposes it.', when: 'Advanced diagnostics only; the current string-only CLI path does not provide separate reasoning parts.', example: 'Keep this off for normal setup.', effect: 'May add provider-produced explanation text, not guaranteed concise metadata.', verify: 'Inspect a controlled structured response; do not assume this toggle produced extra text.' },
    es: { summary: 'Solicita razonamiento adicional si la respuesta del proveedor lo ofrece.', when: 'Solo para diagnósticos avanzados; el CLI actual devuelve texto sin partes de razonamiento separadas.', example: 'Déjalo desactivado en una configuración normal.', effect: 'Podría añadir texto del proveedor; no garantiza metadatos breves.', verify: 'Comprueba una respuesta estructurada controlada; no presupongas que la opción tuvo efecto.' },
  },
  'ai.bugbotDryRun': {
    en: { summary: 'Keep Bugbot in analysis-only mode for future runs.', when: 'Useful during evaluation; incompatible with PR approval evidence.', example: 'Choose No to publish normal reviews.', effect: 'Bugbot analyzes but does not publish findings or make SCM changes. This is not setup --dry-run.', verify: 'Inspect the Bugbot workflow result; no published review or Check should appear from dry-run.' },
    es: { summary: 'Mantiene Bugbot en modo solo análisis para las futuras ejecuciones.', when: 'Útil durante una evaluación; incompatible con la evidencia de aprobación de PR.', example: 'Elige No para publicar revisiones normalmente.', effect: 'Bugbot analiza pero no publica hallazgos ni modifica el repositorio. No es setup --dry-run.', verify: 'Revisa el resultado de Bugbot; el modo ensayo no publica revisión ni Check.' },
  },
  'ai.bugbotOrganizationRules': {
    en: { summary: 'Set broad Bugbot review instructions, one rule per line.', when: 'Use when your team needs review criteria shared across its configured repository.', example: 'Flag changes that bypass tenant isolation.', effect: 'These rules run before repository rules; the selected Variable scope determines storage, not the title.', verify: 'Inspect the configured Variable and enable rule-source tracing for a review.' },
    es: { summary: 'Define criterios generales de revisión para Bugbot, una regla por línea.', when: 'Úsalo si el equipo necesita criterios comunes en el repositorio configurado.', example: 'Señala cambios que omitan el aislamiento entre clientes.', effect: 'Se aplican antes que las reglas del repositorio; el ámbito de la Variable determina dónde se guardan.', verify: 'Revisa la Variable configurada y activa el rastreo de fuentes de reglas.' },
  },
  'ai.provisioningMode': {
    en: { summary: 'Decide how the Action finds or installs the selected agent CLI.', when: 'Applies on the runner when an enabled AI task starts.', example: 'Auto reuses an installed CLI or installs pinned Codex/OpenCode when missing.', effect: 'Always reinstalls reviewed defaults; Disabled requires a preinstalled CLI. Cursor must be preinstalled.', verify: 'Inspect the runner provisioning step and its reported binary version.' },
    es: { summary: 'Decide cómo encuentra o instala la Action el agente CLI.', when: 'Se aplica en el runner cuando empieza una tarea de IA.', example: 'Auto reutiliza el CLI existente o instala una versión fijada de Codex/OpenCode si falta.', effect: 'Always reinstala versiones fijadas; Disabled exige instalación previa. Cursor siempre se instala aparte.', verify: 'Revisa el paso de preparación y la versión del binario en el runner.' },
  },
  'pullRequestApproval.testChecks': {
    en: { summary: 'Choose CI jobs the approval bot may trust as independent test evidence.', when: 'Required for recommend or guarded approval.', example: 'Select the exact Tests job, its GitHub App ID, and parent workflow from a recent run.', effect: 'Only the listed exact producer identities can satisfy the approval gate.', verify: 'Open the linked workflow run and confirm the job, App, and current-head result.' },
    es: { summary: 'Selecciona los jobs de CI que el bot puede considerar pruebas fiables.', when: 'Obligatorio para las aprobaciones recomendadas o protegidas.', example: 'Elige el job Tests, su ID de GitHub App y el workflow de una ejecución reciente.', effect: 'Solo esas identidades exactas podrán satisfacer la condición de aprobación.', verify: 'Abre la ejecución vinculada y comprueba job, App y resultado para el commit actual.' },
  },
  'pullRequestApproval.producerAttested': {
    en: { summary: 'Confirm that you inspected the exact CI producer and its coverage-enforcing step.', when: 'Required before guarded mode can ever submit an approval.', example: 'Verify the selected Tests job fails when the coverage budget fails.', effect: 'Your assertion is recorded; Copilot does not infer it from a green check.', verify: 'Inspect the workflow file and an actual CI run before selecting Yes.' },
    es: { summary: 'Confirma que comprobaste el productor exacto de CI y su paso obligatorio de cobertura.', when: 'Necesario antes de que el modo protegido pueda aprobar.', example: 'Comprueba que el job Tests falla cuando no se alcanza la cobertura mínima.', effect: 'Se registra tu confirmación; Copilot no la deduce de un check verde.', verify: 'Revisa el workflow y una ejecución real antes de elegir Sí.' },
  },
  'pullRequestApproval.coverage.mode': {
    en: { summary: 'Choose how approval proves the changed-code coverage requirement.', when: 'Applies when PR approval is enabled.', example: 'Check: CI enforces the budget. Numeric: a trusted workflow publishes bounded counts.', effect: 'Check mode trusts a selected CI gate; numeric mode reads copilot-diff-coverage-v1 and compares a threshold.', verify: 'Inspect the CI failure condition or the reporter artifact, respectively.' },
    es: { summary: 'Elige cómo se demuestra la cobertura del código modificado.', when: 'Se aplica si habilitas la aprobación de PR.', example: 'Check: CI exige el mínimo. Numeric: un workflow fiable publica recuentos de líneas.', effect: 'Check confía en una condición de CI; numeric lee copilot-diff-coverage-v1 y compara un umbral.', verify: 'Comprueba la condición de fallo del CI o el artefacto del reporter.' },
  },
  'pullRequestApproval.coverage.checkName': {
    en: { summary: 'Select the trusted check that fails when coverage is below budget.', when: 'Required for both coverage evidence modes.', example: 'Use the same exact Tests check selected in the previous step.', effect: 'A success from another check or App cannot substitute for this gate.', verify: 'Inspect the selected job and confirm its coverage step is mandatory, not advisory.' },
    es: { summary: 'Selecciona el check fiable que falla si no se alcanza la cobertura mínima.', when: 'Obligatorio en ambos modos de evidencia.', example: 'Usa el mismo check Tests elegido en el paso anterior.', effect: 'Un éxito de otro check o App no sustituye esta condición.', verify: 'Comprueba que el paso de cobertura es obligatorio, no solo informativo.' },
  },
  'projects.enabled': {
    en: { summary: 'Decide whether future issue and PR automation should use existing GitHub Projects.', when: 'Ask now, before creating the setup PAT, so its Project read permission can be scoped correctly.', example: 'Choose Yes if your team already tracks work in an organization Project; choose No to skip it.', effect: 'Yes includes organization Projects: read in the setup PAT when applicable. No Project is changed now.', verify: 'Review the PAT permission table; exact Projects are selected after GitHub authorizes the PAT.' },
    es: { summary: 'Decide si la automatización futura de issues y PR usará Projects existentes.', when: 'Se pregunta antes de crear el PAT de configuración para ajustar el permiso de lectura de Projects.', example: 'Elige Sí si tu equipo usa un Project de la organización; No para omitirlo.', effect: 'Sí incluye Projects: read de la organización en el PAT cuando aplica. Ahora no se modifica ningún Project.', verify: 'Revisa los permisos del PAT; elegirás los Projects concretos tras autorizarlo en GitHub.' },
  },
  'projects.ids': {
    en: { summary: 'Choose the existing Projects that Copilot may update in future issue and PR workflows.', when: 'After the setup PAT is checked, GitHub may list accessible organization Projects. Personal Projects or unavailable lists need manual entry.', example: 'For https://github.com/orgs/acme/projects/5, select the project card or enter 5; never enter PVT_…', effect: 'Setup stores Project numbers in repository configuration; it does not create or edit Project items now.', verify: 'Open each linked Project and check its owner and URL number before approving the plan.' },
    es: { summary: 'Elige los Projects existentes que Copilot podrá actualizar en futuros flujos de issues y PR.', when: 'Después de comprobar el PAT, GitHub puede listar Projects accesibles de la organización. Para Projects personales o fallos de consulta, introdúcelos manualmente.', example: 'Para https://github.com/orgs/acme/projects/5, marca la tarjeta o escribe 5; nunca PVT_…', effect: 'Setup guarda números de Project en la configuración; ahora no crea ni edita elementos.', verify: 'Abre cada Project enlazado y comprueba el dueño y número de la URL antes de aprobar el plan.' },
  },
};

const section: Readonly<Record<SetupQuestion['stateId'], { en: Copy; es: Copy }>> = {
  capabilities: { en: { summary: 'Choose which automation Copilot will install.', when: 'This affects workflows, GitHub permissions, and later questions.', example: 'Disable a feature you do not plan to use.', effect: 'Only selected capabilities are planned.', verify: 'Review the generated setup plan before Apply.' }, es: { summary: 'Elige qué automatizaciones instalará Copilot.', when: 'Afecta a workflows, permisos de GitHub y preguntas posteriores.', example: 'Desactiva una función que no vayas a usar.', effect: 'Solo se planifican las funciones seleccionadas.', verify: 'Revisa el plan antes de aplicar cambios.' } },
  'agent-runtime': { en: { summary: 'Choose the agent CLI for this task.', when: 'Applies when the selected feature runs in GitHub Actions.', example: 'Codex runs through the codex CLI.', effect: 'The Action invokes the selected provider, never an implicit fallback.', verify: 'Check the runner has the selected CLI and credentials.' }, es: { summary: 'Elige el agente CLI para esta tarea.', when: 'Se aplica al ejecutar la función elegida en GitHub Actions.', example: 'Codex usa el CLI codex.', effect: 'La Action usa ese proveedor, sin sustitución implícita.', verify: 'Comprueba el CLI y las credenciales del runner.' } },
  'agent-model-defaults': { en: { summary: 'Set the model defaults shared by agent tasks.', when: 'Used unless you configure each task separately.', example: 'Keep the reviewed model by accepting the suggested value.', effect: 'The Action passes these values to the selected CLI.', verify: 'Check the plan and runner model allowlist.' }, es: { summary: 'Define el modelo común para las tareas del agente.', when: 'Se usa salvo que configures cada tarea por separado.', example: 'Acepta el modelo revisado que aparece como sugerencia.', effect: 'La Action pasa estos valores al CLI elegido.', verify: 'Revisa el plan y la lista de modelos permitidos.' } },
  'agent-role-overrides': { en: { summary: 'Override this one agent task.', when: 'Only when independent task configuration is enabled.', example: 'Use a different model for review than for planning.', effect: 'Only this task uses the override.', verify: 'Inspect the per-task plan values.' }, es: { summary: 'Personaliza esta tarea del agente.', when: 'Solo si activaste la configuración independiente por tarea.', example: 'Usa un modelo distinto para revisión y planificación.', effect: 'Solo esta tarea usa el valor personalizado.', verify: 'Revisa los valores de cada tarea en el plan.' } },
  repository: { en: { summary: 'Set how Copilot treats your repository.', when: 'Applies to generated workflows and future issue/PR events.', example: 'Use your actual development branch name.', effect: 'Future automation follows the chosen branch and workflow rules.', verify: 'Review the planned files and repository profile.' }, es: { summary: 'Define cómo Copilot tratará tu repositorio.', when: 'Se aplica a los workflows y futuros eventos de issues/PR.', example: 'Indica el nombre real de tu rama de desarrollo.', effect: 'La automatización seguirá las ramas y reglas elegidas.', verify: 'Revisa los archivos del plan y el perfil del repositorio.' } },
  deployment: { en: { summary: 'Choose release and hotfix behavior.', when: 'Only matters when those workflows are enabled.', example: 'Keep the default strategy unless your branching policy differs.', effect: 'Changes how release branches and reconciliation PRs are managed.', verify: 'Inspect the release/hotfix section of the plan.' }, es: { summary: 'Define el comportamiento de releases y hotfixes.', when: 'Importa si activaste esos workflows.', example: 'Conserva la estrategia predeterminada salvo que tus ramas funcionen distinto.', effect: 'Cambia la gestión de ramas y PR de reconciliación.', verify: 'Revisa la sección de releases y hotfixes del plan.' } },
  bugbot: { en: { summary: 'Choose how Bugbot analyzes and reports code changes.', when: 'Used when AI review features run.', example: 'The default publishes eligible findings without blocking all PRs.', effect: 'Changes future review publication and diagnostics.', verify: 'Inspect the Bugbot Variables in the plan and later review results.' }, es: { summary: 'Define cómo Bugbot analiza y comunica cambios de código.', when: 'Se usa cuando se ejecutan funciones de revisión con IA.', example: 'Por defecto publica hallazgos aptos sin bloquear todos los PR.', effect: 'Cambia futuras revisiones y diagnósticos.', verify: 'Revisa las Variables de Bugbot en el plan y sus resultados.' } },
  'pull-request-approval': { en: { summary: 'Choose evidence required before the bot recommends or submits PR approval.', when: 'Only applies if PR automation is enabled.', example: 'Recommend informs a human; guarded may submit a native approval.', effect: 'No PR is approved solely because this page shows green checks.', verify: 'Inspect the trusted CI, Bugbot, and branch-rule evidence.' }, es: { summary: 'Elige las pruebas necesarias para recomendar o aprobar un PR.', when: 'Solo se aplica si activaste la automatización de PR.', example: 'Recommend informa a una persona; guarded puede publicar una aprobación.', effect: 'Ningún PR se aprueba solo porque esta pantalla muestre checks verdes.', verify: 'Revisa CI, Bugbot y las reglas de rama.' } },
  projects: { en: { summary: 'Choose an existing Project Status value for an issue or PR transition.', when: 'Only when Projects integration is selected.', example: 'Todo when an issue is created; In Progress when work starts.', effect: 'Future automation updates the Status field, not a visual board column.', verify: 'Open each selected Project and inspect its Status field options.' }, es: { summary: 'Elige un valor Status existente para una transición de issue o PR.', when: 'Solo si elegiste integrar Projects.', example: 'Todo al crear un issue; In Progress al empezar el trabajo.', effect: 'La automatización futura actualiza el campo Status, no una columna visual.', verify: 'Abre cada Project y revisa las opciones de su campo Status.' } },
  provisioning: { en: { summary: 'Choose which GitHub Actions resources setup manages.', when: 'Affects PAT grants and setup writes.', example: 'Keep Secrets enabled if the bot PAT must be installed.', effect: 'Selected resources may be created or updated after approval.', verify: 'Inspect exact resource names in the plan.' }, es: { summary: 'Elige qué recursos de GitHub Actions gestionará setup.', when: 'Afecta a permisos del PAT y cambios de configuración.', example: 'Mantén Secrets si hay que instalar el PAT del bot.', effect: 'Los recursos seleccionados podrán crearse o actualizarse tras aprobar.', verify: 'Revisa los nombres exactos en el plan.' } },
  storage: { en: { summary: 'Choose where GitHub Actions Variables and Secrets live.', when: 'Applies when provisioning is enabled.', example: 'Repository scope is the simplest default.', effect: 'Affects visibility, permission grants, and precedence.', verify: 'Check the selected scope and shadow warnings in the plan.' }, es: { summary: 'Elige dónde se guardan Variables y Secrets de GitHub Actions.', when: 'Se aplica si activaste su configuración.', example: 'El ámbito de repositorio es el predeterminado más sencillo.', effect: 'Afecta a visibilidad, permisos y precedencia.', verify: 'Revisa el ámbito y los avisos de superposición en el plan.' } },
};

export function setupQuestionPresentation(question: SetupQuestion): SetupQuestionPresentation {
  const copy = special[question.id] ?? section[question.stateId];
  const purpose = setupQuestionPurpose(question);
  const documentation = setupQuestionDocumentation(question);
  const genericHow = question.kind === 'boolean'
    ? { en: 'Choose Yes to enable this behavior or No to leave it off; the suggested answer appears below.', es: 'Elige Sí para activarlo o No para dejarlo desactivado; abajo verás la respuesta sugerida.' }
    : question.kind === 'producer-select'
      ? { en: 'Inspect each candidate run on GitHub, then select its exact job, source App ID and workflow. A listed run is observed, not proof of a required coverage gate; use manual entry for a missing producer.', es: 'Abre cada ejecución candidata en GitHub y comprueba el job, la App y el workflow exactos. Una ejecución listada es observada, no prueba que exija cobertura; usa la entrada manual si falta un productor.' }
      : question.kind === 'project-select'
        ? { en: 'Select Projects by title and URL. If one is missing, enter its positive URL number or exact GitHub URL; PVT_ IDs are not valid.', es: 'Marca Projects por título y URL. Si falta uno, introduce su número positivo o URL exacta de GitHub; los IDs PVT_ no valen.' }
      : question.kind === 'scope-overrides'
        ? { en: 'Select only inherited names you deliberately want to replace at repository scope. Leave empty to keep organization values.', es: 'Selecciona solo los nombres heredados que quieras sustituir en el repositorio. Vacío conserva los valores de la organización.' }
        : question.kind === 'multi-select'
          ? { en: 'Toggle the listed workflows you intend to use. You can select more than one; review their GitHub permissions before creating a PAT.', es: 'Marca los workflows que usarás. Puedes elegir varios; revisa sus permisos de GitHub antes de crear el PAT.' }
      : question.kind === 'choice'
        ? { en: 'Select one of the listed values after reading its consequence; the stored value is not translated.', es: 'Elige una de las opciones tras revisar sus consecuencias; el valor guardado no se traduce.' }
        : question.kind === 'number'
          ? { en: 'Enter a whole number within the range described in the question; accept the suggested value when unsure.', es: 'Introduce un número entero dentro del intervalo indicado; acepta el sugerido si tienes dudas.' }
          : { en: 'Enter the exact value used by your repository or runner; leave it empty only when the question says empty is allowed.', es: 'Introduce el valor exacto de tu repositorio o runner; déjalo vacío solo si la pregunta lo permite.' };
  const howById: Readonly<Record<string, { en: string; es: string }>> = {
    'pullRequestApproval.coverage.checkName': {
      en: 'Select one of the trusted checks above. Open its linked run and workflow file; the coverage step must fail this job when the budget fails. A green result alone is not proof.',
      es: 'Elige uno de los checks fiables anteriores. Abre su ejecución y workflow; el paso de cobertura debe hacer fallar el job si no se alcanza el mínimo. Un resultado verde no basta.',
    },
    'pullRequestApproval.producerAttested': {
      en: 'Answer Yes only after inspecting every selected name, App ID and workflow, plus the coverage-enforcing step of the check you just chose. Otherwise answer No and stay in recommendation mode.',
      es: 'Responde Sí solo tras comprobar cada nombre, ID de App y workflow, además del paso obligatorio de cobertura del check elegido. Si no, responde No y mantén el modo recomendación.',
    },
    'pullRequestApproval.coverage.artifactWorkflowName': {
      en: 'Enter the exact name of a trusted selected workflow that publishes copilot-diff-coverage-v1 for this PR/head/base. Do not enter an artifact filename or a guessed workflow name.',
      es: 'Escribe el nombre exacto de un workflow fiable seleccionado que publique copilot-diff-coverage-v1 para este PR/head/base. No pongas un archivo ni un nombre supuesto.',
    },
    'projects.statusVerified': {
      en: 'Open every selected Project in GitHub, inspect its Status field, and compare the exact four values shown above. Choose Yes only when all four exist in every Project; No returns to Project selection.',
      es: 'Abre cada Project elegido en GitHub, revisa su campo Status y compara los cuatro valores exactos anteriores. Elige Sí solo si todos existen en cada Project; No vuelve a la selección de Projects.',
    },
  };
  const statusHow = /^projects\.(issue|pullRequest)(Created|InProgress)Column$/u.test(question.id)
    ? { en: 'Choose an option shown in every selected Project’s Status field. If options cannot be read, open each Project in GitHub and enter the same exact existing option; different names per Project are not supported.',
      es: 'Elige una opción del campo Status de todos los Projects seleccionados. Si no se pueden consultar, abre cada Project y escribe el mismo valor existente; no se admiten nombres distintos por Project.' }
    : undefined;
  const how = howById[question.id] ?? statusHow ?? genericHow;
  const where = location[question.stateId];
  return {
    en: { label: question.label.replace(' (Space toggles, Enter confirms)', ''), ...copy.en,
      summary: special[question.id] ? copy.en.summary : (purpose?.en ?? copy.en.summary),
      where: where.en, how: how.en, why: `This choice is requested now so the plan, token permissions and future automation agree. ${copy.en.when}`, documentation },
    es: { label: spanishQuestionLabel(question), ...copy.es,
      summary: special[question.id] ? copy.es.summary : (purpose?.es ?? copy.es.summary),
      where: where.es, how: how.es, why: `Esta elección permite ajustar el plan, los permisos del PAT y la automatización futura antes de aplicar cambios. ${copy.es.when}`, documentation },
    fr: frenchQuestionExplanation(question, documentation),
    pt: portugueseQuestionExplanation(question, documentation),
  };
}
