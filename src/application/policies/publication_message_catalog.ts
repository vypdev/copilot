import {
    MESSAGE_CATALOG_VERSION,
    renderCatalogMessage,
    selectBundledMessageCatalog,
    type MessageCatalogDefinition,
    type ResolvedMessageCatalog,
} from '../../domain/message_catalog';
import { canonicalizeLocaleTag, DEFAULT_REPOSITORY_LOCALE } from '../../domain/locale';
import type { AgentConfiguration } from '../../domain/agent';
import type { MessageCatalogResolutionPort } from '../ports/message_catalog_ports';

export const PUBLICATION_MESSAGE_IDS = Object.freeze([
    'publication.implementationPlan',
    'publication.planReady',
    'publication.planAcceptance',
    'publication.commandsHint',
    'publication.progress',
    'publication.progress.notStarted',
    'publication.progress.inProgress',
    'publication.progress.complete',
    'publication.currentStatus',
    'publication.next',
    'publication.noActionRequired',
    'publication.supersededStatus',
    'publication.viewCurrentStatus',
    'publication.duplicateReply',
    'publication.viewOriginalResponse',
    'publication.access.heading',
    'publication.access.explanation',
    'publication.access.recovery',
    'interaction.help.heading',
    'interaction.help.introduction',
    'interaction.help.readOnlyHeading',
    'interaction.help.changesHeading',
    'interaction.help.footer',
    'interaction.help.command.help',
    'interaction.help.command.plan',
    'interaction.help.command.clarify',
    'interaction.help.command.estimate',
    'interaction.help.command.testPlan',
    'interaction.help.command.explain',
    'interaction.help.command.diagnose',
    'interaction.help.command.analyze',
    'interaction.help.command.review',
    'interaction.help.command.findings',
    'interaction.help.command.recheck',
    'interaction.help.command.description',
    'interaction.help.command.status',
    'interaction.help.command.fixOne',
    'interaction.help.command.fixAll',
    'interaction.help.command.dismiss',
    'interaction.help.command.remember',
    'interaction.help.command.implement',
    'interaction.help.command.syncBranch',
    'interaction.welcome.greeting',
    'interaction.welcome.capabilities',
    'interaction.welcome.hint',
    'interaction.translation.summary',
    'interaction.translation.interpretedRequest',
    'interaction.translation.originalRequest',
    'interaction.status.heading',
    'interaction.status.repository',
    'interaction.status.target',
    'interaction.status.event',
    'interaction.status.branch',
    'interaction.status.lifecycle',
    'interaction.status.waitingFor',
    'interaction.status.descriptionPolicy',
    'interaction.status.issueLabels',
    'interaction.status.pullRequestLabels',
    'interaction.status.unknown',
    'interaction.status.notSet',
    'interaction.status.noPendingResponse',
    'interaction.status.none',
    'interaction.status.findings',
    'interaction.status.findingsInvalid',
    'interaction.status.findingCounts',
    'cli.answer',
    'cli.steps',
    'cli.errors',
    'cli.reminder',
] as const);

export type PublicationMessageId = typeof PUBLICATION_MESSAGE_IDS[number];

export interface PublicationMessageCatalog {
    readonly locale: string;
    readonly requestedLocale: string;
    readonly resolutionSource: ResolvedMessageCatalog<PublicationMessageId>['source'];
    readonly fallbackReason?: ResolvedMessageCatalog<PublicationMessageId>['fallbackReason'];
    readonly implementationPlan: string;
    readonly planReady: string;
    readonly planAcceptance: string;
    readonly commandsHint: string;
    readonly progress: string;
    readonly progressState: Readonly<Record<'not-started' | 'in-progress' | 'complete', string>>;
    readonly currentStatus: string;
    readonly next: string;
    readonly noActionRequired: string;
    readonly supersededStatus: string;
    readonly viewCurrentStatus: string;
    readonly duplicateReply: string;
    readonly viewOriginalResponse: string;
    readonly access: Readonly<{ heading: string; explanation: string; recovery: string }>;
    readonly translation: Readonly<{
        summary: (sourceLanguage: string) => string;
        interpretedRequest: string;
        originalRequest: string;
    }>;
    readonly cli: Readonly<{
        answer: string;
        steps: string;
        errors: string;
        reminder: string;
    }>;
    readonly render: (id: PublicationMessageId, variables?: Readonly<Record<string, string | number>>) => string;
}

const ENGLISH_MESSAGES: Readonly<Record<PublicationMessageId, string>> = Object.freeze({
    'publication.implementationPlan': 'Implementation plan',
    'publication.planReady': 'Ready to start. No action is required from maintainers before implementation.',
    'publication.planAcceptance': 'Acceptance',
    'publication.commandsHint': 'Need something else? Mention the bot with a question or use {helpCommand}.',
    'publication.progress': 'Progress',
    'publication.progress.notStarted': 'not started',
    'publication.progress.inProgress': 'in progress',
    'publication.progress.complete': 'complete',
    'publication.currentStatus': 'Current status',
    'publication.next': 'Next',
    'publication.noActionRequired': 'No action required.',
    'publication.supersededStatus': 'This status was superseded by the canonical card.',
    'publication.viewCurrentStatus': 'View current status',
    'publication.duplicateReply': 'This duplicate response was suppressed.',
    'publication.viewOriginalResponse': 'View the original response',
    'publication.access.heading': 'Issue closed: contributor access required',
    'publication.access.explanation': 'This repository accepts automated issue processing only from eligible contributors.',
    'publication.access.recovery': 'If you believe this is incorrect, contact a maintainer or follow the repository contribution policy.',
    'interaction.help.heading': 'Copilot commands',
    'interaction.help.introduction': 'I’m {bot}, the repository assistant. Use these commands on an issue or pull request:',
    'interaction.help.readOnlyHeading': 'Read-only',
    'interaction.help.changesHeading': 'Changes',
    'interaction.help.footer': 'You can also ask a question in natural language by mentioning {bot}. File-changing commands are restricted to authorized maintainers, run the configured checks, and report the resulting changes.',
    'interaction.help.command.help': 'show this command reference.',
    'interaction.help.command.plan': 'propose an implementation plan.',
    'interaction.help.command.clarify': 'identify missing information and assumptions.',
    'interaction.help.command.estimate': 'estimate scope and complexity.',
    'interaction.help.command.testPlan': 'propose a focused testing strategy.',
    'interaction.help.command.explain': 'explain code or behavior.',
    'interaction.help.command.diagnose': 'investigate a reported problem and suggest likely causes.',
    'interaction.help.command.analyze': 'review the current issue, branch, or pull request for potential problems.',
    'interaction.help.command.review': 'run Bugbot with optional per-run settings.',
    'interaction.help.command.findings': 'show potential findings from the current code.',
    'interaction.help.command.recheck': 're-run the review and reconcile findings.',
    'interaction.help.command.description': 'refresh the pull-request description.',
    'interaction.help.command.status': 'show the current automation status.',
    'interaction.help.command.fixOne': 'fix one reported finding.',
    'interaction.help.command.fixAll': 'fix all unresolved findings.',
    'interaction.help.command.dismiss': 'dismiss a finding.',
    'interaction.help.command.remember': 'add an authorized, versioned repository review rule.',
    'interaction.help.command.implement': 'apply an explicitly requested repository change.',
    'interaction.help.command.syncBranch': 'merge the issue or pull-request parent into its working branch; the fixer is used only for eligible conflicts.',
    'interaction.welcome.greeting': 'Hi! I’m {bot}, the Copilot assistant for this repository.',
    'interaction.welcome.capabilities': 'I can answer questions, explain the codebase, propose implementation and test plans, review issues and pull requests for potential bugs or security problems, and help authorized maintainers apply changes.',
    'interaction.welcome.hint': 'Try {helpCommand} to see the available commands, or mention {bot} with your question.',
    'interaction.translation.summary': 'Request interpreted from {sourceLanguage}',
    'interaction.translation.interpretedRequest': 'Interpreted request',
    'interaction.translation.originalRequest': 'Original request',
    'interaction.status.heading': 'Copilot status',
    'interaction.status.repository': 'Repository',
    'interaction.status.target': 'Target',
    'interaction.status.event': 'Event',
    'interaction.status.branch': 'Branch',
    'interaction.status.lifecycle': 'Lifecycle',
    'interaction.status.waitingFor': 'Waiting for',
    'interaction.status.descriptionPolicy': 'PR description policy',
    'interaction.status.issueLabels': 'Issue labels',
    'interaction.status.pullRequestLabels': 'PR labels',
    'interaction.status.unknown': 'unknown',
    'interaction.status.notSet': 'not set',
    'interaction.status.noPendingResponse': 'no pending human response',
    'interaction.status.none': 'none',
    'interaction.status.findings': 'Bugbot findings',
    'interaction.status.findingsInvalid': 'invalid evidence; inspect the workflow result.',
    'interaction.status.findingCounts': '{open} open, {reopened} reopened, {verificationRequired} verification required, {unknown} unknown, {resolved} resolved',
    'cli.answer': 'Answer',
    'cli.steps': 'Steps',
    'cli.errors': 'Errors',
    'cli.reminder': 'Reminder',
});

const SPANISH_MESSAGES: Readonly<Record<PublicationMessageId, string>> = Object.freeze({
    'publication.implementationPlan': 'Plan de implementación',
    'publication.planReady': 'Listo para comenzar. No se requiere ninguna acción de mantenimiento antes de la implementación.',
    'publication.planAcceptance': 'Aceptación',
    'publication.commandsHint': '¿Necesitas algo más? Menciona al bot con una pregunta o usa {helpCommand}.',
    'publication.progress': 'Progreso',
    'publication.progress.notStarted': 'sin iniciar',
    'publication.progress.inProgress': 'en curso',
    'publication.progress.complete': 'completado',
    'publication.currentStatus': 'Estado actual',
    'publication.next': 'Siguiente paso',
    'publication.noActionRequired': 'No se requiere ninguna acción.',
    'publication.supersededStatus': 'Este estado fue sustituido por la tarjeta canónica.',
    'publication.viewCurrentStatus': 'Ver estado actual',
    'publication.duplicateReply': 'Esta respuesta duplicada se ha omitido.',
    'publication.viewOriginalResponse': 'Ver la respuesta original',
    'publication.access.heading': 'Issue cerrada: se requiere acceso de colaborador',
    'publication.access.explanation': 'Este repositorio solo permite el procesamiento automatizado de issues creadas por colaboradores autorizados.',
    'publication.access.recovery': 'Si crees que se trata de un error, contacta con un mantenedor o consulta la política de contribución del repositorio.',
    'interaction.help.heading': 'Comandos de Copilot',
    'interaction.help.introduction': 'Soy {bot}, el asistente del repositorio. Usa estos comandos en una issue o pull request:',
    'interaction.help.readOnlyHeading': 'Solo lectura',
    'interaction.help.changesHeading': 'Cambios',
    'interaction.help.footer': 'También puedes mencionar a {bot} y escribir una pregunta. Los comandos que modifican archivos están limitados a mantenedores autorizados, ejecutan las comprobaciones configuradas e informan de los cambios resultantes.',
    'interaction.help.command.help': 'muestra esta referencia.',
    'interaction.help.command.plan': 'propone un plan de implementación.',
    'interaction.help.command.clarify': 'identifica información pendiente y supuestos.',
    'interaction.help.command.estimate': 'estima el alcance y la complejidad.',
    'interaction.help.command.testPlan': 'propone una estrategia de pruebas.',
    'interaction.help.command.explain': 'explica código o comportamiento.',
    'interaction.help.command.diagnose': 'investiga un problema y sus posibles causas.',
    'interaction.help.command.analyze': 'analiza la issue, rama o pull request actual.',
    'interaction.help.command.review': 'ejecuta Bugbot con ajustes opcionales.',
    'interaction.help.command.findings': 'muestra los hallazgos potenciales.',
    'interaction.help.command.recheck': 'repite la revisión y reconcilia los hallazgos.',
    'interaction.help.command.description': 'actualiza la descripción del pull request.',
    'interaction.help.command.status': 'muestra el estado actual de la automatización.',
    'interaction.help.command.fixOne': 'corrige un hallazgo.',
    'interaction.help.command.fixAll': 'corrige todos los hallazgos sin resolver.',
    'interaction.help.command.dismiss': 'descarta un hallazgo.',
    'interaction.help.command.remember': 'añade una regla de revisión autorizada y versionada.',
    'interaction.help.command.implement': 'aplica un cambio solicitado explícitamente.',
    'interaction.help.command.syncBranch': 'integra la rama padre de la issue o pull request en su rama de trabajo; el agente de corrección solo se usa para conflictos aptos.',
    'interaction.welcome.greeting': 'Hola, soy {bot}, el asistente de Copilot de este repositorio.',
    'interaction.welcome.capabilities': 'Puedo responder preguntas, explicar el código, proponer planes de implementación y pruebas, revisar issues y pull requests y ayudar a los mantenedores autorizados a aplicar cambios.',
    'interaction.welcome.hint': 'Usa {helpCommand} para ver los comandos disponibles o menciona a {bot} con tu pregunta.',
    'interaction.translation.summary': 'Solicitud interpretada desde {sourceLanguage}',
    'interaction.translation.interpretedRequest': 'Solicitud interpretada',
    'interaction.translation.originalRequest': 'Solicitud original',
    'interaction.status.heading': 'Estado de Copilot',
    'interaction.status.repository': 'Repositorio',
    'interaction.status.target': 'Destino',
    'interaction.status.event': 'Evento',
    'interaction.status.branch': 'Rama',
    'interaction.status.lifecycle': 'Ciclo de vida',
    'interaction.status.waitingFor': 'Esperando a',
    'interaction.status.descriptionPolicy': 'Política de descripción de PR',
    'interaction.status.issueLabels': 'Etiquetas de issue',
    'interaction.status.pullRequestLabels': 'Etiquetas de PR',
    'interaction.status.unknown': 'desconocida',
    'interaction.status.notSet': 'sin definir',
    'interaction.status.noPendingResponse': 'sin respuesta humana pendiente',
    'interaction.status.none': 'ninguna',
    'interaction.status.findings': 'Hallazgos de Bugbot',
    'interaction.status.findingsInvalid': 'evidencia no válida; revisa el resultado del workflow.',
    'interaction.status.findingCounts': '{open} abiertos, {reopened} reabiertos, {verificationRequired} requieren verificación, {unknown} desconocidos, {resolved} resueltos',
    'cli.answer': 'Respuesta',
    'cli.steps': 'Pasos',
    'cli.errors': 'Errores',
    'cli.reminder': 'Recordatorio',
});

export const ENGLISH_PUBLICATION_DEFINITION: MessageCatalogDefinition<PublicationMessageId> = Object.freeze({
    version: MESSAGE_CATALOG_VERSION,
    locale: 'en-US',
    compatibleBaseLanguage: 'en',
    messages: ENGLISH_MESSAGES,
});

export const SPANISH_PUBLICATION_DEFINITION: MessageCatalogDefinition<PublicationMessageId> = Object.freeze({
    version: MESSAGE_CATALOG_VERSION,
    locale: 'es-ES',
    compatibleBaseLanguage: 'es',
    messages: SPANISH_MESSAGES,
});

export const PUBLICATION_CATALOG_DEFINITIONS = Object.freeze([
    ENGLISH_PUBLICATION_DEFINITION,
    SPANISH_PUBLICATION_DEFINITION,
]);

export function publicationLocaleNeedsDynamicCatalog(locale: string): boolean {
    return selectBundledMessageCatalog(locale || DEFAULT_REPOSITORY_LOCALE, PUBLICATION_CATALOG_DEFINITIONS) === undefined;
}

export function resolveStaticPublicationCatalog(locale: string): {
    readonly requestedLocale: string;
    readonly catalog: PublicationMessageCatalog;
    readonly fallback: boolean;
} {
    const requestedLocale = canonicalizeLocaleTag(locale || DEFAULT_REPOSITORY_LOCALE);
    const resolved = selectBundledMessageCatalog(requestedLocale, PUBLICATION_CATALOG_DEFINITIONS)
        ?? Object.freeze({
            requestedLocale,
            resolvedLocale: ENGLISH_PUBLICATION_DEFINITION.locale,
            source: 'fallback' as const,
            messages: ENGLISH_PUBLICATION_DEFINITION.messages,
            fallbackReason: 'dynamic-provider-unavailable' as const,
        });
    return Object.freeze({
        requestedLocale,
        catalog: toPublicationCatalog(resolved),
        fallback: resolved.source === 'fallback',
    });
}

export async function resolvePublicationCatalog(
    locale: string,
    configuration: Readonly<AgentConfiguration> | undefined,
    resolver: MessageCatalogResolutionPort | undefined,
): Promise<PublicationMessageCatalog> {
    if (!resolver) return resolveStaticPublicationCatalog(locale).catalog;
    const resolved = await resolver.resolve({
        targetLocale: locale || DEFAULT_REPOSITORY_LOCALE,
        ids: PUBLICATION_MESSAGE_IDS,
        sourceCatalog: ENGLISH_PUBLICATION_DEFINITION,
        bundledCatalogs: PUBLICATION_CATALOG_DEFINITIONS,
        configuration,
    });
    return toPublicationCatalog(resolved);
}

export function toPublicationCatalog(
    resolved: ResolvedMessageCatalog<PublicationMessageId>,
): PublicationMessageCatalog {
    const message = (id: PublicationMessageId, variables: Readonly<Record<string, string | number>> = {}) =>
        renderCatalogMessage(resolved.messages[id], variables, resolved.requestedLocale);
    return Object.freeze({
        locale: resolved.resolvedLocale,
        requestedLocale: resolved.requestedLocale,
        resolutionSource: resolved.source,
        ...(resolved.fallbackReason ? { fallbackReason: resolved.fallbackReason } : {}),
        implementationPlan: message('publication.implementationPlan'),
        planReady: message('publication.planReady'),
        planAcceptance: message('publication.planAcceptance'),
        commandsHint: message('publication.commandsHint', { helpCommand: '`/copilot help`' }),
        progress: message('publication.progress'),
        progressState: Object.freeze({
            'not-started': message('publication.progress.notStarted'),
            'in-progress': message('publication.progress.inProgress'),
            complete: message('publication.progress.complete'),
        }),
        currentStatus: message('publication.currentStatus'),
        next: message('publication.next'),
        noActionRequired: message('publication.noActionRequired'),
        supersededStatus: message('publication.supersededStatus'),
        viewCurrentStatus: message('publication.viewCurrentStatus'),
        duplicateReply: message('publication.duplicateReply'),
        viewOriginalResponse: message('publication.viewOriginalResponse'),
        access: Object.freeze({
            heading: message('publication.access.heading'),
            explanation: message('publication.access.explanation'),
            recovery: message('publication.access.recovery'),
        }),
        translation: Object.freeze({
            summary: (sourceLanguage: string) => message('interaction.translation.summary', { sourceLanguage }),
            interpretedRequest: message('interaction.translation.interpretedRequest'),
            originalRequest: message('interaction.translation.originalRequest'),
        }),
        cli: Object.freeze({
            answer: message('cli.answer'),
            steps: message('cli.steps'),
            errors: message('cli.errors'),
            reminder: message('cli.reminder'),
        }),
        render: message,
    });
}

export const ENGLISH_PUBLICATION_CATALOG = toPublicationCatalog(Object.freeze({
    requestedLocale: 'en-US', resolvedLocale: 'en-US', source: 'exact', messages: ENGLISH_MESSAGES,
}));
export const SPANISH_PUBLICATION_CATALOG = toPublicationCatalog(Object.freeze({
    requestedLocale: 'es-ES', resolvedLocale: 'es-ES', source: 'exact', messages: SPANISH_MESSAGES,
}));
