import { deepFreeze } from './value.ts';
import type { CenterLocale } from './center_copy_types.ts';
import type { ApiCacheFactState, ApiCacheOutcome } from './api_cache.ts';

export interface ApiCacheCopy {
    readonly title: string; readonly scope: string; readonly preserved: string; readonly question: string;
    readonly review: string; readonly confirm: string; readonly cancel: string; readonly inspect: string; readonly close: string;
    readonly pending: string; readonly keeping: string; readonly reviewing: string; readonly reading: string; readonly observer: string; readonly unknownHelp: string; readonly unretained: string;
    readonly states: Readonly<Record<ApiCacheFactState, string>>;
    readonly outcomes: Readonly<Record<ApiCacheOutcome['state'], string>>;
}
const copies: Readonly<Record<CenterLocale, ApiCacheCopy>> = deepFreeze({
    en: {
        title: 'Temporary API responses', scope: 'Only temporary API responses cached by Copilot in this browser profile, across its credential purposes. This does not clear browser history, browser caches or GitHub page content.',
        preserved: 'Saved preferences, credentials and existing activity are kept. Request budgets and cooldowns are unchanged.', question: 'Clear temporary API responses kept by Copilot?',
        review: 'Review clearing temporary API responses', confirm: 'Clear temporary responses', cancel: 'Keep cache', inspect: 'Read this operation’s result', close: 'Close review',
        pending: 'Clearing temporary API responses…', keeping: 'Cancelling this cache review…', reviewing: 'Preparing cache review…', reading: 'Checking this operation’s result…', observer: 'Cache actions require the current extension page’s editing session.',
        unretained: 'This view no longer has access to the earlier result. A new review is a separate operation and does not establish what happened before.',
        unknownHelp: 'Read this operation’s retained result in Privacy. Do not repeat clearing automatically; closing this view does not undo a clear that has already run.',
        states: { reviewed: 'Cache clearing reviewed; no attempt observed.', submitted: 'A native clear was submitted; inspect its outcome.', cleared: 'Temporary API responses were cleared. New explicit reads can cache responses again.',
            cancelled: 'This review was cancelled without clearing the cache.', blocked: 'This review became unavailable before confirmation.', 'not-applied': 'The native clear was not applied.', unknown: 'The clearing result could not be established.' },
        outcomes: { cleared: 'Temporary API responses were cleared. New explicit reads can cache responses again.', cancelled: 'This review was cancelled without clearing the cache.', unknown: 'The response does not establish whether clearing completed.',
            stale: 'The source or cache changed. This request cannot establish the earlier outcome; inspect the current context before a new review.', expired: 'This review or its retained result is no longer available. Its earlier outcome is not established here.',
            denied: 'The current editing session cannot authorize this cache review. Read current state.', unavailable: 'The cache review could not be checked. Retained preferences and credentials are unchanged by this check.',
            busy: 'Another cache review is pending or retained capacity is full. Read the previous result; cancel an unsubmitted review or wait for expiry.', invalid: 'This cache request is not supported. Reopen the current extension options.',
            'not-submitted': 'No clear was submitted for this review at this observation. Keeping the cache cancels that unsubmitted review.' },
    },
    es: {
        title: 'Respuestas temporales de la API', scope: 'Solo las respuestas temporales guardadas por Copilot en este perfil del navegador, para sus distintas finalidades de credencial. No borra el historial, las cachés del navegador ni el contenido de páginas de GitHub.',
        preserved: 'Se conservan las preferencias, las credenciales y la actividad existente. Los presupuestos y tiempos de espera de solicitudes no cambian.', question: '¿Borrar las respuestas temporales de la API guardadas por Copilot?',
        review: 'Revisar borrado de respuestas temporales de la API', confirm: 'Borrar respuestas temporales', cancel: 'Conservar caché', inspect: 'Leer el resultado de esta operación', close: 'Cerrar revisión',
        pending: 'Borrando respuestas temporales de la API…', keeping: 'Cancelando esta revisión de caché…', reviewing: 'Preparando revisión de la caché…', reading: 'Consultando el resultado de esta operación…', observer: 'Estas acciones necesitan la sesión de edición de la página actual de la extensión.',
        unretained: 'Esta vista ya no tiene acceso al resultado anterior. Una nueva revisión es otra operación y no confirma qué ocurrió antes.',
        unknownHelp: 'Consulta el resultado retenido de esta operación en Privacidad. No repitas el borrado automáticamente; cerrar esta vista no deshace un borrado ya realizado.',
        states: { reviewed: 'Borrado de caché revisado; no se ha observado un intento.', submitted: 'Se ha enviado un borrado nativo; consulta su resultado.', cleared: 'Se borraron las respuestas temporales de la API. Nuevas lecturas explícitas pueden volver a guardar respuestas.',
            cancelled: 'Se canceló esta revisión sin borrar la caché.', blocked: 'Esta revisión dejó de estar disponible antes de confirmar.', 'not-applied': 'El borrado nativo no se aplicó.', unknown: 'No se ha podido determinar el resultado del borrado.' },
        outcomes: { cleared: 'Se borraron las respuestas temporales de la API. Nuevas lecturas explícitas pueden volver a guardar respuestas.', cancelled: 'Se canceló esta revisión sin borrar la caché.', unknown: 'La respuesta no confirma si el borrado terminó.',
            stale: 'Cambió el contexto o la caché. Esta solicitud no confirma el resultado anterior; consulta el contexto actual antes de otra revisión.', expired: 'Esta revisión o su resultado retenido ya no están disponibles. Aquí no se puede determinar su resultado anterior.',
            denied: 'La sesión de edición actual no puede autorizar esta revisión. Consulta el estado actual.', unavailable: 'No se pudo consultar la revisión de la caché. Esta consulta no cambia las preferencias ni las credenciales retenidas.',
            busy: 'Hay otra revisión de caché pendiente o se alcanzó el límite de resultados retenidos. Lee el resultado anterior; cancela una revisión no enviada o espera a que caduque.', invalid: 'Esta solicitud de caché no es compatible. Vuelve a abrir las opciones actuales de la extensión.',
            'not-submitted': 'En esta observación no se había enviado un borrado para esta revisión. Conservar la caché cancela esa revisión no enviada.' },
    },
    fr: {
        title: 'Réponses API temporaires', scope: 'Uniquement les réponses API temporaires gardées par Copilot dans ce profil du navigateur, pour les différents usages de ses identifiants. Cela n’efface ni l’historique, ni les caches du navigateur, ni le contenu des pages GitHub.',
        preserved: 'Les préférences, les identifiants secrets et l’activité existante sont conservés. Les budgets de requêtes et délais d’attente restent inchangés.', question: 'Effacer les réponses API temporaires conservées par Copilot ?',
        review: 'Examiner l’effacement des réponses API temporaires', confirm: 'Effacer les réponses temporaires', cancel: 'Conserver le cache', inspect: 'Consulter le résultat de cette opération', close: 'Fermer la revue',
        pending: 'Effacement des réponses API temporaires…', keeping: 'Annulation de cette revue du cache…', reviewing: 'Préparation de la revue du cache…', reading: 'Consultation du résultat de cette opération…', observer: 'Ces actions nécessitent la session d’édition de la page actuelle de l’extension.',
        unretained: 'Cette vue n’a plus accès au résultat précédent. Une nouvelle revue est une opération distincte et ne confirme pas ce qui s’est passé auparavant.',
        unknownHelp: 'Consultez le résultat conservé de cette opération dans Confidentialité. Ne répétez pas automatiquement l’effacement ; fermer cette vue n’annule pas un effacement déjà effectué.',
        states: { reviewed: 'Effacement du cache examiné ; aucune tentative observée.', submitted: 'Une demande d’effacement native a été envoyée ; consultez son résultat.', cleared: 'Les réponses API temporaires ont été effacées. De nouvelles lectures explicites peuvent à nouveau conserver des réponses.',
            cancelled: 'Cette revue a été annulée sans effacer le cache.', blocked: 'Cette revue est devenue indisponible avant la confirmation.', 'not-applied': 'L’effacement natif n’a pas été appliqué.', unknown: 'Le résultat de l’effacement n’a pas pu être établi.' },
        outcomes: { cleared: 'Les réponses API temporaires ont été effacées. De nouvelles lectures explicites peuvent à nouveau conserver des réponses.', cancelled: 'Cette revue a été annulée sans effacer le cache.', unknown: 'La réponse ne confirme pas si l’effacement a abouti.',
            stale: 'Le contexte ou le cache a changé. Cette demande ne confirme pas le résultat antérieur ; consultez le contexte actuel avant une nouvelle revue.', expired: 'Cette revue ou son résultat conservé n’est plus disponible. Son résultat antérieur n’est pas établi ici.',
            denied: 'La session d’édition actuelle ne peut pas autoriser cette revue. Consultez l’état actuel.', unavailable: 'La revue du cache n’a pas pu être consultée. Cette consultation ne change ni les préférences ni les identifiants conservés.',
            busy: 'Une autre revue du cache est en attente ou la capacité de rétention est atteinte. Consultez le résultat précédent ; annulez une revue non envoyée ou attendez son expiration.', invalid: 'Cette demande de cache n’est pas prise en charge. Rouvrez les options actuelles de l’extension.',
            'not-submitted': 'Aucun effacement n’avait été envoyé pour cette revue lors de cette observation. Conserver le cache annule cette revue non envoyée.' },
    },
    pt: {
        title: 'Respostas temporárias da API', scope: 'Apenas as respostas temporárias guardadas pelo Copilot neste perfil do navegador, para as diferentes finalidades das credenciais. Não limpa o histórico, as caches do navegador nem o conteúdo das páginas do GitHub.',
        preserved: 'As preferências, credenciais e atividade existente são mantidas. Os orçamentos de pedidos e tempos de espera não mudam.', question: 'Limpar as respostas temporárias da API guardadas pelo Copilot?',
        review: 'Rever limpeza das respostas temporárias da API', confirm: 'Limpar respostas temporárias', cancel: 'Manter cache', inspect: 'Consultar o resultado desta operação', close: 'Fechar revisão',
        pending: 'A limpar respostas temporárias da API…', keeping: 'A cancelar esta revisão da cache…', reviewing: 'A preparar revisão da cache…', reading: 'A consultar o resultado desta operação…', observer: 'Estas ações precisam da sessão de edição da página atual da extensão.',
        unretained: 'Esta vista já não tem acesso ao resultado anterior. Uma nova revisão é uma operação separada e não confirma o que aconteceu antes.',
        unknownHelp: 'Consulte o resultado retido desta operação em Privacidade. Não repita a limpeza automaticamente; fechar esta vista não desfaz uma limpeza já realizada.',
        states: { reviewed: 'Limpeza da cache revista; nenhuma tentativa observada.', submitted: 'Foi enviado um pedido de limpeza nativo; consulte o resultado.', cleared: 'As respostas temporárias da API foram limpas. Novas leituras explícitas podem voltar a guardar respostas.',
            cancelled: 'Esta revisão foi cancelada sem limpar a cache.', blocked: 'Esta revisão ficou indisponível antes da confirmação.', 'not-applied': 'A limpeza nativa não foi aplicada.', unknown: 'Não foi possível determinar o resultado da limpeza.' },
        outcomes: { cleared: 'As respostas temporárias da API foram limpas. Novas leituras explícitas podem voltar a guardar respostas.', cancelled: 'Esta revisão foi cancelada sem limpar a cache.', unknown: 'A resposta não confirma se a limpeza terminou.',
            stale: 'O contexto ou a cache mudou. Este pedido não confirma o resultado anterior; consulte o contexto atual antes de outra revisão.', expired: 'Esta revisão ou o seu resultado retido já não está disponível. O resultado anterior não pode ser determinado aqui.',
            denied: 'A sessão de edição atual não pode autorizar esta revisão. Consulte o estado atual.', unavailable: 'Não foi possível consultar a revisão da cache. Esta consulta não altera as preferências nem as credenciais retidas.',
            busy: 'Existe outra revisão da cache pendente ou a capacidade de retenção foi atingida. Consulte o resultado anterior; cancele uma revisão não enviada ou aguarde a expiração.', invalid: 'Este pedido de cache não é compatível. Volte a abrir as opções atuais da extensão.',
            'not-submitted': 'Nesta observação não tinha sido enviada uma limpeza para esta revisão. Manter a cache cancela essa revisão não enviada.' },
    },
});
export function apiCacheCopy(locale: string): ApiCacheCopy {
    return copies[locale === 'es' || locale === 'fr' || locale === 'pt' ? locale : 'en'];
}
