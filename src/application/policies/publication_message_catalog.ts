import { baseLanguage, canonicalizeLocaleTag, DEFAULT_REPOSITORY_LOCALE } from '../../domain/locale';

export interface PublicationMessageCatalog {
    readonly locale: string;
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
}

const ENGLISH: PublicationMessageCatalog = Object.freeze({
    locale: 'en-US',
    implementationPlan: 'Implementation plan',
    planReady: 'Ready to start. No action is required from maintainers before implementation.',
    planAcceptance: 'Acceptance',
    commandsHint: 'Need something else? Mention the bot with a question or use `/copilot help`.',
    progress: 'Progress',
    progressState: Object.freeze({ 'not-started': 'not started', 'in-progress': 'in progress', complete: 'complete' }),
    currentStatus: 'Current status',
    next: 'Next',
    noActionRequired: 'No action required.',
    supersededStatus: 'This status was superseded by the canonical card.',
    viewCurrentStatus: 'View current status',
    duplicateReply: 'This duplicate response was suppressed.',
    viewOriginalResponse: 'View the original response',
});

const SPANISH: PublicationMessageCatalog = Object.freeze({
    locale: 'es-ES',
    implementationPlan: 'Plan de implementación',
    planReady: 'Listo para comenzar. No se requiere ninguna acción de mantenimiento antes de la implementación.',
    planAcceptance: 'Aceptación',
    commandsHint: '¿Necesitas algo más? Menciona al bot con una pregunta o usa `/copilot help`.',
    progress: 'Progreso',
    progressState: Object.freeze({ 'not-started': 'sin iniciar', 'in-progress': 'en curso', complete: 'completado' }),
    currentStatus: 'Estado actual',
    next: 'Siguiente paso',
    noActionRequired: 'No se requiere ninguna acción.',
    supersededStatus: 'Este estado fue sustituido por la tarjeta canónica.',
    viewCurrentStatus: 'Ver estado actual',
    duplicateReply: 'Esta respuesta duplicada se ha omitido.',
    viewOriginalResponse: 'Ver la respuesta original',
});

export interface ResolvedPublicationCatalog {
    readonly requestedLocale: string;
    readonly catalog: PublicationMessageCatalog;
    readonly fallback: boolean;
}

export function resolveStaticPublicationCatalog(locale: string): ResolvedPublicationCatalog {
    const requestedLocale = canonicalizeLocaleTag(locale || DEFAULT_REPOSITORY_LOCALE);
    if (baseLanguage(requestedLocale) === 'es') {
        return Object.freeze({ requestedLocale, catalog: SPANISH, fallback: false });
    }
    if (baseLanguage(requestedLocale) === 'en') {
        return Object.freeze({ requestedLocale, catalog: ENGLISH, fallback: false });
    }
    return Object.freeze({ requestedLocale, catalog: ENGLISH, fallback: true });
}

export const ENGLISH_PUBLICATION_CATALOG = ENGLISH;
export const SPANISH_PUBLICATION_CATALOG = SPANISH;
