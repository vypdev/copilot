import { Result } from '../../data/model/result';
import { baseLanguage } from '../../domain/locale';

export const DEFAULT_COPILOT_BOT_USERNAME = 'vypbot';
export const COPILOT_WELCOME_MARKER = '<!-- copilot:welcome -->';

const SAFE_GITHUB_USERNAME = /^[A-Za-z0-9-]+$/u;

/** Keeps the bot identity safe when it is rendered into a GitHub comment. */
export function normalizeCopilotBotUsername(username: string | undefined): string {
    const candidate = username?.trim().replace(/^@/u, '');
    return candidate && SAFE_GITHUB_USERNAME.test(candidate)
        ? candidate
        : DEFAULT_COPILOT_BOT_USERNAME;
}

/** Renders the stable command reference used by /copilot help. */
export function buildCopilotHelpMessage(username?: string, locale = 'en-US'): string {
    const bot = normalizeCopilotBotUsername(username);
    if (baseLanguage(locale) === 'es') return `## Comandos de Copilot

Soy **@${bot}**, el asistente del repositorio. Usa estos comandos en una issue o pull request:

### Solo lectura

- \`/copilot help\` — muestra esta referencia.
- \`/copilot plan\` — propone un plan de implementación.
- \`/copilot clarify\` — identifica información pendiente y supuestos.
- \`/copilot estimate\` — estima el alcance y la complejidad.
- \`/copilot test-plan\` — propone una estrategia de pruebas.
- \`/copilot explain <ruta o símbolo>\` — explica código o comportamiento.
- \`/copilot diagnose\` — investiga un problema y sus posibles causas.
- \`/copilot analyze\` — analiza la issue, rama o pull request actual.
- \`/copilot review [effort=smart|low|default|high] [dry-run=true] [trace-rules=true] [suggested-changes=false]\` — ejecuta Bugbot con ajustes opcionales.
- \`/copilot findings\` — muestra los hallazgos potenciales.
- \`/copilot recheck\` — repite la revisión y reconcilia los hallazgos.
- \`/copilot description\` — actualiza la descripción del pull request.
- \`/copilot status\` — muestra el estado actual de la automatización.

### Cambios

- \`/copilot fix <finding-id>\` — corrige un hallazgo.
- \`/copilot fix all\` — corrige todos los hallazgos sin resolver.
- \`/copilot dismiss <finding-id>\` — descarta un hallazgo.
- \`/copilot remember <regla>\` — añade una regla de revisión autorizada y versionada.
- \`/copilot implement <petición>\` — aplica un cambio solicitado explícitamente.
- \`/copilot sync-branch [--dry-run] [--no-agent] [--from <rama>]\` — integra la rama padre de forma segura.

También puedes mencionar a **@${bot}** y escribir una pregunta. Los comandos que modifican archivos están limitados a mantenedores autorizados, ejecutan las comprobaciones configuradas e informan de los cambios resultantes.`;
    return `## Copilot commands

I’m **@${bot}**, the repository assistant. Use these commands on an issue or pull request:

### Read-only

- \`/copilot help\` — show this command reference.
- \`/copilot plan\` — propose an implementation plan.
- \`/copilot clarify\` — identify missing information and assumptions.
- \`/copilot estimate\` — estimate scope and complexity.
- \`/copilot test-plan\` — propose a focused testing strategy.
- \`/copilot explain <path or symbol>\` — explain code or behavior.
- \`/copilot diagnose\` — investigate a reported problem and suggest likely causes.
- \`/copilot analyze\` — review the current issue, branch, or pull request for potential problems.
- \`/copilot review [effort=smart|low|default|high] [dry-run=true] [trace-rules=true] [suggested-changes=false]\` — run Bugbot with optional per-run settings.
- \`/copilot findings\` — show potential findings from the current code.
- \`/copilot recheck\` — re-run the review and reconcile findings.
- \`/copilot description\` — refresh the pull-request description.
- \`/copilot status\` — show the current automation status.

### Changes

- \`/copilot fix <finding-id>\` — fix one reported finding.
- \`/copilot fix all\` — fix all unresolved findings.
- \`/copilot dismiss <finding-id>\` — dismiss a finding.
- \`/copilot remember <rule>\` — add an authorized, versioned repository review rule.
- \`/copilot implement <request>\` — apply an explicitly requested repository change.
- \`/copilot sync-branch [--dry-run] [--no-agent] [--from <branch>]\` — merge the issue/PR parent into its working branch; the fixer is used only for eligible conflicts.

You can also ask a question in natural language by mentioning **@${bot}**. For example: “@${bot} update the issue's branch”. File-changing commands are restricted to authorized maintainers, run the configured checks, and report the resulting changes.`;
}

/** Renders the one-time onboarding comment for a newly created issue. */
export function buildCopilotWelcomeMessage(username?: string, locale = 'en-US'): string {
    const bot = normalizeCopilotBotUsername(username);
    if (baseLanguage(locale) === 'es') return `${COPILOT_WELCOME_MARKER}

Hola, soy **@${bot}**, el asistente de Copilot de este repositorio.

Puedo responder preguntas, explicar el código, proponer planes de implementación y pruebas, revisar issues y pull requests y ayudar a los mantenedores autorizados a aplicar cambios.

Usa \`/copilot help\` para ver los comandos disponibles o menciona a **@${bot}** con tu pregunta.`;
    return `${COPILOT_WELCOME_MARKER}

Hi! I’m **@${bot}**, the Copilot assistant for this repository.

I can answer questions, explain the codebase, propose implementation and test plans, review issues and pull requests for potential bugs or security problems, and help authorized maintainers apply changes.

Try \`/copilot help\` to see the available commands, or mention **@${bot}** with your question.`;
}

/** Creates a publishable result for issues that have no agent-generated reply. */
export function buildCopilotWelcomeResult(username?: string): Result {
    return new Result({
        id: 'CopilotWelcomeUseCase',
        success: true,
        executed: true,
        stepFormat: 'markdown',
        steps: [buildCopilotWelcomeMessage(username)],
        payload: Object.freeze({ publication: Object.freeze({ kind: 'welcome', botLogin: normalizeCopilotBotUsername(username) }) }),
    });
}
