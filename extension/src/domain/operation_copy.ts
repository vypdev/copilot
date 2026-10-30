import type { OperationStage, CurrentOperationView } from './current_operation.ts';
import type { JournalRetention } from './history_state.ts';
import { deepFreeze } from './value.ts';
interface OperationCopy {
    title: string; read: string; scope: string; empty: string; historical: string; target: string; unavailableTarget: string; open: string;
    retention: string; proved: string; uncertain: string;
    status: Readonly<Record<CurrentOperationView['phase'], string>>; stages: Readonly<Record<OperationStage, string>>; retained: Readonly<Record<JournalRetention, string>>;
}
const EN: OperationCopy = {
    title: 'Last observed operation', read: 'Read last operation', scope: 'This window, in memory for five minutes from first observation. Reading never confirms or repeats a write.',
    empty: 'No current observed operation is available in this window. History cannot restore its private target.', historical: 'These facts were observed earlier. The private target is not currently verified.',
    target: 'Target captured for this operation', unavailableTarget: 'Exact target unavailable; it is never reconstructed from history.', open: 'Open target section', retention: 'Independent history retention', proved: 'Last proved persistence facts',
    uncertain: 'An unobserved submission does not prove that nothing was written. Inspect current settings using:',
    status: { idle: 'Read to inspect this window’s last observed operation.', reading: 'Checking the last operation…', ready: 'Last operation inspected.', unavailable: 'The operation could not be checked. Earlier proved facts remain separate from current availability.' },
    stages: { reviewed: 'Change reviewed; no write attempt observed.', confirming: 'Confirmation is pending; no write attempt observed yet.', submitted: 'A write was attempted. Saving has not yet been verified.', cancelled: 'The reviewed change was cancelled.', blocked: 'The change was blocked before writing.', settled: 'The saved preferences were verified.', unknown: 'The result remains unconfirmed.' },
    retained: { pending: 'Retention pending', stored: 'Retained at the last inspection', 'not-retained': 'Not retained', unknown: 'Retention unconfirmed', untracked: 'No history row is currently tracked for this operation' },
};
const ES: OperationCopy = {
    title: 'Última operación observada', read: 'Consultar última operación', scope: 'Esta ventana, en memoria durante cinco minutos desde la primera observación. Consultar nunca confirma ni repite una escritura.',
    empty: 'No hay una operación actual observada en esta ventana. El historial no puede restaurar su destino privado.', historical: 'Estos hechos se observaron antes. El destino privado no está verificado actualmente.',
    target: 'Destino capturado para esta operación', unavailableTarget: 'Destino exacto no disponible; nunca se reconstruye desde el historial.', open: 'Abrir la sección del destino', retention: 'Retención independiente del historial', proved: 'Últimos hechos de persistencia demostrados',
    uncertain: 'No haber observado el envío no demuestra que no se haya escrito nada. Consulta las preferencias actuales con:',
    status: { idle: 'Consulta la última operación observada de esta ventana.', reading: 'Consultando la última operación…', ready: 'Última operación consultada.', unavailable: 'No se pudo comprobar la operación. Los hechos demostrados antes se mantienen separados de la disponibilidad actual.' },
    stages: { reviewed: 'Cambio revisado; no se ha observado un intento de escritura.', confirming: 'Confirmación pendiente; aún no se ha observado un intento de escritura.', submitted: 'Se intentó escribir. Aún no se ha verificado el guardado.', cancelled: 'El cambio revisado se canceló.', blocked: 'El cambio se bloqueó antes de escribir.', settled: 'Se han verificado las preferencias guardadas.', unknown: 'El resultado sigue sin confirmar.' },
    retained: { pending: 'Retención pendiente', stored: 'Retenido en la última consulta', 'not-retained': 'No retenido', unknown: 'Retención sin confirmar', untracked: 'No se sigue actualmente una entrada del historial para esta operación' },
};
const FR: OperationCopy = {
    title: 'Dernière opération observée', read: 'Consulter la dernière opération', scope: 'Cette fenêtre, en mémoire pendant cinq minutes depuis la première observation. Consulter ne confirme ni ne répète une écriture.',
    empty: 'Aucune opération actuelle observée dans cette fenêtre. L’historique ne peut pas restaurer sa cible privée.', historical: 'Ces faits ont été observés auparavant. La cible privée n’est pas vérifiée actuellement.',
    target: 'Cible capturée pour cette opération', unavailableTarget: 'Cible exacte indisponible ; elle n’est jamais reconstruite depuis l’historique.', open: 'Ouvrir la section cible', retention: 'Conservation indépendante de l’historique', proved: 'Derniers faits de persistance établis',
    uncertain: 'Une soumission non observée ne prouve pas l’absence d’écriture. Consultez les préférences actuelles avec :',
    status: { idle: 'Consultez la dernière opération observée de cette fenêtre.', reading: 'Vérification de la dernière opération…', ready: 'Dernière opération consultée.', unavailable: 'Impossible de vérifier l’opération. Les faits établis restent distincts de la disponibilité actuelle.' },
    stages: { reviewed: 'Modification examinée ; aucune tentative d’écriture observée.', confirming: 'Confirmation en attente ; aucune tentative d’écriture observée pour le moment.', submitted: 'Une écriture a été tentée. L’enregistrement n’est pas encore vérifié.', cancelled: 'La modification examinée a été annulée.', blocked: 'La modification a été bloquée avant l’écriture.', settled: 'Les préférences enregistrées ont été vérifiées.', unknown: 'Le résultat reste non confirmé.' },
    retained: { pending: 'Conservation en attente', stored: 'Conservé lors de la dernière consultation', 'not-retained': 'Non conservé', unknown: 'Conservation non confirmée', untracked: 'Aucune entrée d’historique suivie actuellement pour cette opération' },
};
const PT: OperationCopy = {
    title: 'Última operação observada', read: 'Consultar a última operação', scope: 'Esta janela, em memória durante cinco minutos desde a primeira observação. Consultar nunca confirma nem repete uma escrita.',
    empty: 'Não há uma operação atual observada nesta janela. O histórico não pode restaurar o destino privado.', historical: 'Estes factos foram observados anteriormente. O destino privado não está verificado atualmente.',
    target: 'Destino capturado para esta operação', unavailableTarget: 'Destino exato indisponível; nunca é reconstruído a partir do histórico.', open: 'Abrir a secção do destino', retention: 'Retenção independente do histórico', proved: 'Últimos factos de persistência comprovados',
    uncertain: 'Uma submissão não observada não prova que nada foi escrito. Consulte as preferências atuais com:',
    status: { idle: 'Consulte a última operação observada desta janela.', reading: 'A verificar a última operação…', ready: 'Última operação consultada.', unavailable: 'Não foi possível verificar a operação. Os factos comprovados mantêm-se separados da disponibilidade atual.' },
    stages: { reviewed: 'Alteração revista; nenhuma tentativa de escrita observada.', confirming: 'Confirmação pendente; ainda não foi observada uma tentativa de escrita.', submitted: 'Foi tentada uma escrita. A gravação ainda não foi verificada.', cancelled: 'A alteração revista foi cancelada.', blocked: 'A alteração foi bloqueada antes da escrita.', settled: 'As preferências guardadas foram verificadas.', unknown: 'O resultado continua por confirmar.' },
    retained: { pending: 'Retenção pendente', stored: 'Retido na última consulta', 'not-retained': 'Não retido', unknown: 'Retenção por confirmar', untracked: 'Nenhuma entrada do histórico é acompanhada atualmente para esta operação' },
};
const COPIES: Readonly<Record<string, OperationCopy>> = { en: EN, es: ES, fr: FR, pt: PT };
export function operationCopy(locale: string): Readonly<OperationCopy> { return deepFreeze(Object.hasOwn(COPIES, locale) ? COPIES[locale] : EN); }
