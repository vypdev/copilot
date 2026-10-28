import { natural } from '../domain/value.ts';

const en = {
    title: 'Copilot runtime', wait: 'Reads are paused. Wait before trying again.', retry: 'Reads are paused. Try again at {time}.', standalone: 'Standalone · optional connection is disconnected.',
    current: 'Connected; read-only activity refreshed.', pending: 'Checking this page. No action required.',
    unavailable: 'Activity is unavailable. Check access or reconnect; your settings remain.',
    stale: 'This page changed. Read again for the current page; your settings remain.',
    paused: 'Activity is paused. Resume in extension settings; native GitHub remains available.',
    read: 'Read current activity', settings: 'Runtime settings', disconnect: 'Disconnect this session',
    repository: 'Selected repository (owner/name)', credential: 'Session read credential',
    connect: 'Connect read access for this session', connected: 'Connected for this browser session.',
    privacy: 'The credential stays in protected browser session storage. It is never included in settings or diagnostics.',
    scope: 'Engineering runtime only. The complete product is still under development.',
    grant: 'API permission was denied. Standalone mode and settings remain available.',
    details: 'Technical details', noSession: 'Disconnected. Connect explicitly to read selected-repository activity.',
};
export type RuntimeCopy = typeof en;
const es: RuntimeCopy = {
    title: 'Runtime de Copilot', wait: 'Lecturas pausadas. Espera antes de reintentar.', retry: 'Lecturas pausadas. Reintenta a las {time}.', standalone: 'Modo local · conexión opcional desconectada.',
    current: 'Conectado; actividad de solo lectura actualizada.', pending: 'Comprobando la página. No se requiere ninguna acción.',
    unavailable: 'Actividad no disponible. Revisa el acceso o reconecta; se conserva la configuración.',
    stale: 'La página ha cambiado. Lee de nuevo la página actual; se conserva la configuración.',
    paused: 'Actividad pausada. Reanúdala en los ajustes; GitHub sigue disponible.',
    read: 'Leer actividad actual', settings: 'Ajustes del runtime', disconnect: 'Desconectar esta sesión',
    repository: 'Repositorio seleccionado (propietario/nombre)', credential: 'Credencial de lectura de sesión',
    connect: 'Conectar lectura para esta sesión', connected: 'Conectado durante esta sesión del navegador.',
    privacy: 'La credencial permanece en el almacenamiento protegido de sesión. No aparece en ajustes ni diagnósticos.',
    scope: 'Solo runtime de ingeniería. El producto completo sigue en desarrollo.',
    grant: 'Permiso de API denegado. Se conservan el modo local y los ajustes.',
    details: 'Detalles técnicos', noSession: 'Desconectado. Conecta explícitamente para leer el repositorio seleccionado.',
};
const fr: RuntimeCopy = {
    title: 'Runtime Copilot', wait: 'Lectures en pause. Patientez avant de réessayer.', retry: 'Lectures en pause. Réessayez à {time}.', standalone: 'Mode local · connexion facultative déconnectée.',
    current: 'Connecté ; activité en lecture seule actualisée.', pending: 'Vérification de la page. Aucune action requise.',
    unavailable: 'Activité indisponible. Vérifiez l’accès ou reconnectez-vous ; les réglages sont conservés.',
    stale: 'La page a changé. Relisez la page actuelle ; les réglages sont conservés.',
    paused: 'Activité en pause. Reprenez dans les réglages ; GitHub reste disponible.',
    read: 'Lire l’activité actuelle', settings: 'Réglages du runtime', disconnect: 'Déconnecter cette session',
    repository: 'Dépôt sélectionné (propriétaire/nom)', credential: 'Identifiant de lecture de session',
    connect: 'Connecter la lecture pour cette session', connected: 'Connecté pour cette session du navigateur.',
    privacy: 'L’identifiant reste dans le stockage protégé de session. Il est exclu des réglages et diagnostics.',
    scope: 'Runtime d’ingénierie uniquement. Le produit complet reste en développement.',
    grant: 'Autorisation API refusée. Le mode local et les réglages restent disponibles.',
    details: 'Détails techniques', noSession: 'Déconnecté. Connectez-vous explicitement pour lire le dépôt sélectionné.',
};
const pt: RuntimeCopy = {
    title: 'Runtime do Copilot', wait: 'Leituras em pausa. Aguarde antes de tentar novamente.', retry: 'Leituras em pausa. Tente novamente às {time}.', standalone: 'Modo local · ligação opcional desligada.',
    current: 'Ligado; atividade só de leitura atualizada.', pending: 'A verificar a página. Nenhuma ação necessária.',
    unavailable: 'Atividade indisponível. Verifique o acesso ou volte a ligar; as definições mantêm-se.',
    stale: 'A página mudou. Leia novamente a página atual; as definições mantêm-se.',
    paused: 'Atividade em pausa. Retome nas definições; o GitHub continua disponível.',
    read: 'Ler atividade atual', settings: 'Definições do runtime', disconnect: 'Desligar esta sessão',
    repository: 'Repositório selecionado (proprietário/nome)', credential: 'Credencial de leitura da sessão',
    connect: 'Ligar leitura nesta sessão', connected: 'Ligado durante esta sessão do navegador.',
    privacy: 'A credencial fica no armazenamento protegido da sessão. Não aparece nas definições nem nos diagnósticos.',
    scope: 'Apenas runtime de engenharia. O produto completo continua em desenvolvimento.',
    grant: 'Permissão de API recusada. O modo local e as definições mantêm-se.',
    details: 'Detalhes técnicos', noSession: 'Desligado. Ligue explicitamente para ler o repositório selecionado.',
};
export function runtimeCopy(locale: string): RuntimeCopy {
    const language = locale.toLowerCase().split('-')[0];
    return ({ en, es, fr, pt } as Record<string, RuntimeCopy>)[language] ?? en;
}
export function statusText(state: string, copy: RuntimeCopy, retryAt?: unknown, now = Date.now()): string {
    if (['cooldown', 'budget', 'limited'].includes(state)) {
        return natural(retryAt) && retryAt > now && retryAt <= 8640000000000000
            ? copy.retry.replace('{time}', new Date(retryAt).toLocaleString()) : copy.wait;
    }
    if (state === 'current' || state === 'connected') return copy.current;
    if (state === 'disconnected') return copy.noSession;
    if (state === 'paused' || state === 'inactive') return copy.paused;
    if (state === 'stale' || state === 'aborted') return copy.stale;
    if (state === 'pending' || state === 'revalidating') return copy.pending;
    return copy.unavailable;
}
