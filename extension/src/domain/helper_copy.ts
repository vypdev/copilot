import type { HelperId, HelperReason } from './helper_sample.ts';
import type { HelperSampleView } from './helper_sample_view.ts';
import { deepFreeze } from './value.ts';

interface HelperCopy {
    historyBoundary: string; title: string; read: string; boundary: string; captured: string; blocked: string; noneBlocked: string; reasons: string; noneReasons: string; retention: string; empty: string; unavailable: string; guide: string;
    phases: Readonly<Record<HelperSampleView['phase'], string>>;
    helpers: Readonly<Record<HelperId, string>>;
    codes: Readonly<Record<HelperReason['code'], string>>;
    scopes: Readonly<Record<HelperReason['scope'], string>>;
}
const EN: HelperCopy = {
    historyBoundary: 'These retained reasons may come from a later page sample. The row time identifies the retained observation, not the original failure time or live helper health.',
    title: 'Source-page helper sample', read: 'Read source sample', boundary: 'This is an earlier page observation captured before opening the center. It does not describe live helper health. Reasons retain their original observation scope, without an original timestamp.',
    captured: 'Sample captured', blocked: 'Helpers held at capture', noneBlocked: 'No helpers were held in this sample.', reasons: 'Earlier closed reasons, latest first', noneReasons: 'No reasons were present in this captured sample.', retention: 'Optional diagnostic retention', empty: 'No source-page observation is available in this window. Open the center from the page to capture one.', unavailable: 'The source could not certify a current sample. Return to an admitted visible page before a new explicit open.', guide: 'Page runtime troubleshooting',
    phases: { idle: 'The source sample has not been inspected.', reading: 'Reading the source-page sample…', ready: 'Source-sample metadata was inspected.', unavailable: 'The earlier sample could not be inspected. Current helper health is unknown.' },
    helpers: { 'runtime-health': 'Runtime panel', 'center-shortcuts': 'Page shortcuts' },
    codes: { 'mount-failed': 'The helper could not start.', 'refresh-failed': 'The helper could not refresh.', 'cleanup-failed': 'The helper could not complete resource cleanup.' },
    scopes: { 'active-at-observation': 'Its source was active when this reason was observed.', 'retired-at-observation': 'Its source was already retired when this reason was observed.' },
};
const ES: HelperCopy = {
    historyBoundary: 'Estos motivos conservados pueden proceder de una muestra posterior de la página. La hora de la fila identifica la observación conservada, no cuándo ocurrió el fallo ni el estado actual de la ayuda.',
    title: 'Muestra de ayudas de la página de origen', read: 'Leer muestra de origen', boundary: 'Es una observación anterior de la página, capturada antes de abrir el centro. No describe el estado actual de las ayudas. Los motivos conservan su contexto de observación, sin una fecha original.',
    captured: 'Muestra capturada', blocked: 'Ayudas detenidas al capturar', noneBlocked: 'No había ayudas detenidas en esta muestra.', reasons: 'Motivos anteriores, del más reciente al más antiguo', noneReasons: 'No había motivos en esta muestra capturada.', retention: 'Retención opcional en diagnósticos', empty: 'No hay una observación de origen disponible en esta ventana. Abre el centro desde la página para capturar una.', unavailable: 'El origen no pudo acreditar una muestra actual. Vuelve a una página visible y admitida antes de abrir el centro de nuevo.', guide: 'Solucionar problemas del runtime de la página',
    phases: { idle: 'No se ha consultado la muestra de origen.', reading: 'Leyendo la muestra de la página de origen…', ready: 'Se consultaron los metadatos de la muestra de origen.', unavailable: 'No se pudo consultar la muestra anterior. Se desconoce el estado actual de las ayudas.' },
    helpers: { 'runtime-health': 'Panel del runtime', 'center-shortcuts': 'Atajos de la página' },
    codes: { 'mount-failed': 'La ayuda no pudo iniciarse.', 'refresh-failed': 'La ayuda no pudo actualizarse.', 'cleanup-failed': 'La ayuda no pudo completar la limpieza de recursos.' },
    scopes: { 'active-at-observation': 'Su origen estaba activo al observar este motivo.', 'retired-at-observation': 'Su origen ya estaba retirado al observar este motivo.' },
};
const FR: HelperCopy = {
    historyBoundary: 'Ces motifs conservés peuvent provenir d’un échantillon ultérieur de la page. L’heure de la ligne désigne l’observation conservée, ni l’heure de l’échec initial ni l’état actuel de l’aide.',
    title: 'Échantillon des aides de la page source', read: 'Lire l’échantillon source', boundary: 'Cette observation antérieure de la page a été capturée avant l’ouverture du centre. Elle ne décrit pas l’état actuel des aides. Les motifs conservent leur contexte d’observation, sans horodatage original.',
    captured: 'Échantillon capturé', blocked: 'Aides suspendues à la capture', noneBlocked: 'Aucune aide n’était suspendue dans cet échantillon.', reasons: 'Motifs antérieurs, du plus récent au plus ancien', noneReasons: 'Aucun motif n’était présent dans cet échantillon capturé.', retention: 'Conservation facultative dans les diagnostics', empty: 'Aucune observation source disponible dans cette fenêtre. Ouvrez le centre depuis la page pour en capturer une.', unavailable: 'La source n’a pas pu certifier un échantillon actuel. Revenez à une page visible et admise avant une nouvelle ouverture.', guide: 'Résoudre les problèmes du runtime de la page',
    phases: { idle: 'L’échantillon source n’a pas été inspecté.', reading: 'Lecture de l’échantillon de la page source…', ready: 'Les métadonnées de l’échantillon source ont été inspectées.', unavailable: 'L’échantillon antérieur n’a pas pu être inspecté. L’état actuel des aides est inconnu.' },
    helpers: { 'runtime-health': 'Panneau du runtime', 'center-shortcuts': 'Raccourcis de la page' },
    codes: { 'mount-failed': 'L’aide n’a pas pu démarrer.', 'refresh-failed': 'L’aide n’a pas pu s’actualiser.', 'cleanup-failed': 'L’aide n’a pas pu terminer la libération des ressources.' },
    scopes: { 'active-at-observation': 'Sa source était active lorsque ce motif a été observé.', 'retired-at-observation': 'Sa source était déjà retirée lorsque ce motif a été observé.' },
};
const PT: HelperCopy = {
    historyBoundary: 'Estes motivos guardados podem vir de uma amostra posterior da página. A hora da linha identifica a observação guardada, não a hora da falha original nem o estado atual do auxiliar.',
    title: 'Amostra de auxiliares da página de origem', read: 'Ler amostra de origem', boundary: 'Esta é uma observação anterior da página, capturada antes de abrir o centro. Não descreve o estado atual dos auxiliares. Os motivos mantêm o contexto de observação, sem uma data original.',
    captured: 'Amostra capturada', blocked: 'Auxiliares suspensos na captura', noneBlocked: 'Não havia auxiliares suspensos nesta amostra.', reasons: 'Motivos anteriores, do mais recente ao mais antigo', noneReasons: 'Não havia motivos nesta amostra capturada.', retention: 'Retenção opcional em diagnósticos', empty: 'Não há observação de origem disponível nesta janela. Abra o centro a partir da página para capturar uma.', unavailable: 'A origem não conseguiu certificar uma amostra atual. Volte a uma página visível e admitida antes de abrir o centro novamente.', guide: 'Resolver problemas do runtime da página',
    phases: { idle: 'A amostra de origem não foi consultada.', reading: 'A ler a amostra da página de origem…', ready: 'Os metadados da amostra de origem foram consultados.', unavailable: 'Não foi possível consultar a amostra anterior. O estado atual dos auxiliares é desconhecido.' },
    helpers: { 'runtime-health': 'Painel do runtime', 'center-shortcuts': 'Atalhos da página' },
    codes: { 'mount-failed': 'O auxiliar não conseguiu iniciar.', 'refresh-failed': 'O auxiliar não conseguiu atualizar.', 'cleanup-failed': 'O auxiliar não conseguiu concluir a limpeza de recursos.' },
    scopes: { 'active-at-observation': 'A origem estava ativa quando este motivo foi observado.', 'retired-at-observation': 'A origem já estava retirada quando este motivo foi observado.' },
};
const COPIES: Readonly<Record<string, HelperCopy>> = deepFreeze({ en: EN, es: ES, fr: FR, pt: PT });
export function helperCopy(locale: string): Readonly<HelperCopy> { return Object.hasOwn(COPIES, locale) ? COPIES[locale] : EN; }
