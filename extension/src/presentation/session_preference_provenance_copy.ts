import type { SessionPreferenceProvenance } from '../domain/session_preference_provenance.ts';
import { deepFreeze } from '../domain/value.ts';

interface Copy { worker: string; document: string; documentRead: string; scope: string; scopes: Record<Exclude<SessionPreferenceProvenance['scope'], null>, string> }
const resources: Readonly<Record<string, Copy>> = deepFreeze({
    en: { worker: 'Temporary preference operation', document: 'Browser-session preferences', documentRead: 'Document read', scope: 'Temporary preference scope', scopes: {
        empty: 'No temporary preferences observed', active: 'Current verified native selection', retained: 'A retained pause remains until explicitly reviewed',
        inactive: 'These temporary preferences do not apply to this context', unverified: 'Scope not revalidated; preferences cannot enable access', unknown: 'Current native ownership could not be confirmed' } },
    es: { worker: 'Operación de preferencias temporales', document: 'Preferencias de la sesión del navegador', documentRead: 'Documento consultado', scope: 'Ámbito de las preferencias temporales', scopes: {
        empty: 'Sin preferencias temporales observadas', active: 'Selección nativa actual verificada', retained: 'Una pausa retenida se mantiene hasta revisarla expresamente',
        inactive: 'Estas preferencias temporales no se aplican a este contexto', unverified: 'Ámbito sin revalidar; las preferencias no pueden habilitar acceso', unknown: 'No se ha podido confirmar la titularidad nativa actual' } },
    fr: { worker: 'Opération de préférences temporaires', document: 'Préférences de la session du navigateur', documentRead: 'Document consulté', scope: 'Contexte des préférences temporaires', scopes: {
        empty: 'Aucune préférence temporaire observée', active: 'Sélection native actuelle vérifiée', retained: 'Une pause conservée reste active jusqu’à sa révision explicite',
        inactive: 'Ces préférences temporaires ne s’appliquent pas à ce contexte', unverified: 'Contexte non revérifié ; les préférences ne peuvent pas autoriser l’accès', unknown: 'La sélection native actuelle n’a pas pu être confirmée' } },
    pt: { worker: 'Operação de preferências temporárias', document: 'Preferências da sessão do navegador', documentRead: 'Documento consultado', scope: 'Contexto das preferências temporárias', scopes: {
        empty: 'Sem preferências temporárias observadas', active: 'Seleção nativa atual verificada', retained: 'Uma pausa retida mantém-se até ser revista explicitamente',
        inactive: 'Estas preferências temporárias não se aplicam a este contexto', unverified: 'Contexto não revalidado; as preferências não podem autorizar acesso', unknown: 'Não foi possível confirmar a seleção nativa atual' } },
});
export function sessionPreferenceProvenanceCopy(locale: string): Readonly<Copy> {
    const key = locale.toLowerCase().split(/[-_]/u)[0];
    return Object.hasOwn(resources, key) ? resources[key] : resources.en;
}
