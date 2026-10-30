import type { PauseFact, PauseAction } from './pause_fact.ts';
import { deepFreeze } from './value.ts';
interface PauseObservationCopy {
    description: string; incomplete: string; submission: string; submitted: string; notObserved: string; adoption: string;
    actions: Readonly<Record<PauseAction, string>>; states: Readonly<Record<PauseFact['state'], string>>;
    results: Readonly<Record<PauseFact['result'], string>>; observations: Readonly<Record<PauseFact['observation'], string>>;
}
const EN: PauseObservationCopy = {
    description: 'Facts observed for this pause operation. They do not establish the current pauses or prove an earlier unknown operation.',
    incomplete: 'Some operation events were not observed. Proven acknowledgements and observations remain independent.',
    submission: 'Native pause write', submitted: 'One native write attempt was observed.', notObserved: 'Not observed', adoption: 'Adoption does not write the native pause record or certify an earlier operation.',
    actions: { 'pause-emergency': 'Pause all connected reads for this browser session', 'resume-emergency': 'Remove the emergency pause', 'pause-tab': 'Pause a GitHub tab', 'resume-tab': 'Remove a tab pause', 'adopt-pauses': 'Adopt the observed pauses' },
    states: { reviewed: 'Pause change reviewed; no write attempt observed.', running: 'Pause operation in progress.', cancelled: 'The pause review was cancelled.', settled: 'Pause operation ended; inspect its separate facts.' },
    results: { pending: 'Pending', cancelled: 'Cancelled', committed: 'The desired native pause record was observed.', reconciled: 'The reviewed state was adopted without a native write.', unknown: 'Operation response unconfirmed.', invalid: 'Invalid change', conflict: 'The reviewed state changed.', stale: 'The operation source is no longer current.', unavailable: 'Operation unavailable', future: 'Newer native pause format preserved.', corrupt: 'Malformed native pause data preserved.', busy: 'Another native operation is pending.', unchanged: 'No change was necessary.' },
    observations: { 'not-observed': 'Not observed', committed: 'Desired native pause record observed', different: 'A different native pause record was observed', unavailable: 'Canonical native observation unavailable', adopted: 'Reviewed current state adopted; no native write' },
};
const ES: PauseObservationCopy = {
    description: 'Hechos observados de esta operación de pausa. No establecen las pausas actuales ni demuestran una operación anterior sin confirmar.',
    incomplete: 'No se observaron algunos eventos de la operación. Los acuses y observaciones demostrados siguen siendo independientes.',
    submission: 'Escritura nativa de pausas', submitted: 'Se observó un intento de escritura nativa.', notObserved: 'No observado', adoption: 'La adopción no escribe el registro nativo de pausas ni certifica una operación anterior.',
    actions: { 'pause-emergency': 'Pausar todas las lecturas conectadas en esta sesión del navegador', 'resume-emergency': 'Quitar la pausa de emergencia', 'pause-tab': 'Pausar una pestaña de GitHub', 'resume-tab': 'Quitar una pausa de pestaña', 'adopt-pauses': 'Adoptar las pausas observadas' },
    states: { reviewed: 'Cambio de pausa revisado; no se ha observado un intento de escritura.', running: 'Operación de pausa en curso.', cancelled: 'Se canceló la revisión de pausa.', settled: 'La operación de pausa terminó; consulta sus hechos por separado.' },
    results: { pending: 'Pendiente', cancelled: 'Cancelada', committed: 'Se observó el registro nativo de pausas esperado.', reconciled: 'Se adoptó el estado revisado sin escritura nativa.', unknown: 'Respuesta de la operación sin confirmar.', invalid: 'Cambio no válido', conflict: 'Cambió el estado revisado.', stale: 'El origen de la operación ya no es actual.', unavailable: 'Operación no disponible', future: 'Se conserva el formato nativo de pausas más reciente.', corrupt: 'Se conservan los datos nativos de pausas dañados.', busy: 'Hay otra operación nativa pendiente.', unchanged: 'No era necesario cambiar nada.' },
    observations: { 'not-observed': 'No observado', committed: 'Se observó el registro nativo de pausas esperado', different: 'Se observó un registro nativo de pausas distinto', unavailable: 'Observación nativa canónica no disponible', adopted: 'Estado actual revisado y adoptado; sin escritura nativa' },
};
const FR: PauseObservationCopy = {
    description: 'Faits observés pour cette opération de pause. Ils ne prouvent ni les pauses actuelles ni une ancienne opération non confirmée.',
    incomplete: 'Certains événements n’ont pas été observés. Les accusés et observations établis restent indépendants.',
    submission: 'Écriture native des pauses', submitted: 'Une tentative d’écriture native a été observée.', notObserved: 'Non observé', adoption: 'L’adoption n’écrit pas le registre natif et ne certifie aucune opération antérieure.',
    actions: { 'pause-emergency': 'Suspendre toutes les lectures connectées pour cette session du navigateur', 'resume-emergency': 'Retirer la pause d’urgence', 'pause-tab': 'Suspendre un onglet GitHub', 'resume-tab': 'Retirer une pause d’onglet', 'adopt-pauses': 'Adopter les pauses observées' },
    states: { reviewed: 'Pause examinée ; aucune tentative d’écriture observée.', running: 'Opération de pause en cours.', cancelled: 'L’examen de la pause a été annulé.', settled: 'Opération terminée ; consulter ses faits séparément.' },
    results: { pending: 'En attente', cancelled: 'Annulée', committed: 'Le registre natif des pauses attendu a été observé.', reconciled: 'L’état examiné a été adopté sans écriture native.', unknown: 'Réponse de l’opération non confirmée.', invalid: 'Modification invalide', conflict: 'L’état examiné a changé.', stale: 'La source de l’opération n’est plus actuelle.', unavailable: 'Opération indisponible', future: 'Format natif des pauses plus récent conservé.', corrupt: 'Données natives des pauses malformées conservées.', busy: 'Une autre opération native est en attente.', unchanged: 'Aucune modification nécessaire.' },
    observations: { 'not-observed': 'Non observé', committed: 'Registre natif des pauses attendu observé', different: 'Un registre natif des pauses différent a été observé', unavailable: 'Observation native canonique indisponible', adopted: 'État actuel examiné et adopté ; sans écriture native' },
};
const PT: PauseObservationCopy = {
    description: 'Factos observados desta operação de pausa. Não estabelecem as pausas atuais nem comprovam uma operação anterior sem confirmação.',
    incomplete: 'Alguns eventos não foram observados. Os reconhecimentos e observações comprovados mantêm-se independentes.',
    submission: 'Escrita nativa das pausas', submitted: 'Foi observada uma tentativa de escrita nativa.', notObserved: 'Não observado', adoption: 'A adoção não escreve o registo nativo nem certifica uma operação anterior.',
    actions: { 'pause-emergency': 'Pausar todas as leituras ligadas nesta sessão do navegador', 'resume-emergency': 'Remover a pausa de emergência', 'pause-tab': 'Pausar um separador do GitHub', 'resume-tab': 'Remover uma pausa de separador', 'adopt-pauses': 'Adotar as pausas observadas' },
    states: { reviewed: 'Pausa revista; nenhuma tentativa de escrita observada.', running: 'Operação de pausa em curso.', cancelled: 'A revisão da pausa foi cancelada.', settled: 'Operação terminada; consulte os factos separadamente.' },
    results: { pending: 'Pendente', cancelled: 'Cancelada', committed: 'Foi observado o registo nativo das pausas esperado.', reconciled: 'O estado revisto foi adotado sem escrita nativa.', unknown: 'Resposta da operação sem confirmação.', invalid: 'Alteração inválida', conflict: 'O estado revisto mudou.', stale: 'A origem da operação já não é atual.', unavailable: 'Operação indisponível', future: 'Formato nativo de pausas mais recente preservado.', corrupt: 'Dados nativos de pausas danificados preservados.', busy: 'Outra operação nativa está pendente.', unchanged: 'Nenhuma alteração necessária.' },
    observations: { 'not-observed': 'Não observado', committed: 'Registo nativo das pausas esperado observado', different: 'Foi observado um registo nativo das pausas diferente', unavailable: 'Observação nativa canónica indisponível', adopted: 'Estado atual revisto e adotado; sem escrita nativa' },
};
const COPIES: Readonly<Record<string, PauseObservationCopy>> = { en: EN, es: ES, fr: FR, pt: PT };
export function pauseObservationCopy(locale: string): Readonly<PauseObservationCopy> { return deepFreeze(Object.hasOwn(COPIES, locale) ? COPIES[locale] : EN); }
