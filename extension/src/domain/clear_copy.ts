import type { ClearFact } from './clear_fact.ts';
import type { JournalClearIssue } from './clear_operation.ts';
import { deepFreeze } from './value.ts';

interface ClearCopy {
    action: string; description: string; response: string; submission: string; submitted: string; notObserved: string; incomplete: string;
    states: Readonly<Record<ClearFact['state'], string>>;
    results: Readonly<Record<Exclude<ClearFact['result'], JournalClearIssue>, string>>;
    observations: Readonly<Record<ClearFact['observation'], string>>;
}
const EN: ClearCopy = {
    action: 'Clear local history', description: 'The attempt, acknowledgement and subsequent read are independent facts. An empty generation was observed only when the exact reviewed generation advanced and contained no entries; this does not describe history now.',
    response: 'Clear service response', submission: 'Native clear attempt', submitted: 'One native clear attempt was observed.', notObserved: 'No observation is available.', incomplete: 'Some observations are missing. An unobserved attempt is not proof that no change occurred.',
    states: { reviewed: 'Clear reviewed; no attempt observed.', running: 'Clear is in progress. Inspect the attempt, acknowledgement and subsequent read separately.', cancelled: 'The unsubmitted clear review was cancelled.', blocked: 'The clear review became unavailable before confirmation.', settled: 'The clear service returned a result. Inspect what was observed.' },
    results: { pending: 'Awaiting the service result', cancelled: 'Unsubmitted review cancelled', blocked: 'Review no longer available', 'observed-cleared': 'The exact next generation was observed empty', unknown: 'The reviewed clear could not be verified', 'not-applied': 'The native operation reported no applied write' },
    observations: { 'not-observed': 'No subsequent read has been observed.', cleared: 'The exact next generation was observed empty.', changed: 'The subsequent read did not match the reviewed clear.', unavailable: 'The subsequent state could not be verified.', 'not-applied': 'No subsequent read was required after the native no-write response.' },
};
const ES: ClearCopy = {
    action: 'Borrar el historial local', description: 'El intento, la confirmación y la lectura posterior son hechos independientes. Solo se observó una generación vacía cuando avanzó la generación exacta revisada y no contenía entradas; esto no describe el historial actual.',
    response: 'Respuesta del servicio de borrado', submission: 'Intento de borrado nativo', submitted: 'Se observó un intento de borrado nativo.', notObserved: 'No hay una observación disponible.', incomplete: 'Faltan algunas observaciones. No observar un intento no demuestra que no se produjera un cambio.',
    states: { reviewed: 'Borrado revisado; no se ha observado un intento.', running: 'El borrado está en curso. Consulta el intento, la confirmación y la lectura posterior por separado.', cancelled: 'Se canceló la revisión de borrado sin enviar.', blocked: 'La revisión de borrado dejó de estar disponible antes de confirmar.', settled: 'El servicio de borrado devolvió un resultado. Consulta lo que se observó.' },
    results: { pending: 'Esperando el resultado del servicio', cancelled: 'Revisión sin enviar cancelada', blocked: 'Revisión no disponible', 'observed-cleared': 'Se observó vacía la generación siguiente exacta', unknown: 'No se pudo verificar el borrado revisado', 'not-applied': 'La operación nativa indicó que no se aplicó una escritura' },
    observations: { 'not-observed': 'No se ha observado una lectura posterior.', cleared: 'Se observó vacía la generación siguiente exacta.', changed: 'La lectura posterior no coincidió con el borrado revisado.', unavailable: 'No se pudo verificar el estado posterior.', 'not-applied': 'No se necesitó una lectura posterior tras la respuesta nativa sin escritura.' },
};
const FR: ClearCopy = {
    action: 'Effacer l’historique local', description: 'La tentative, l’accusé et la lecture suivante sont des faits indépendants. Une génération vide n’a été observée que lorsque la génération exacte vérifiée a avancé sans entrées ; cela ne décrit pas l’historique actuel.',
    response: 'Réponse du service d’effacement', submission: 'Tentative d’effacement natif', submitted: 'Une tentative d’effacement natif a été observée.', notObserved: 'Aucune observation disponible.', incomplete: 'Certaines observations manquent. L’absence de tentative observée ne prouve pas l’absence de changement.',
    states: { reviewed: 'Effacement vérifié ; aucune tentative observée.', running: 'L’effacement est en cours. Consultez séparément la tentative, l’accusé et la lecture suivante.', cancelled: 'La confirmation d’effacement non envoyée a été annulée.', blocked: 'La confirmation d’effacement est devenue indisponible avant l’envoi.', settled: 'Le service d’effacement a renvoyé un résultat. Consultez les observations.' },
    results: { pending: 'En attente du résultat du service', cancelled: 'Confirmation non envoyée annulée', blocked: 'Confirmation indisponible', 'observed-cleared': 'La génération suivante exacte a été observée vide', unknown: 'L’effacement vérifié n’a pas pu être confirmé', 'not-applied': 'L’opération native a signalé aucune écriture appliquée' },
    observations: { 'not-observed': 'Aucune lecture suivante n’a été observée.', cleared: 'La génération suivante exacte a été observée vide.', changed: 'La lecture suivante ne correspondait pas à l’effacement vérifié.', unavailable: 'L’état suivant n’a pas pu être vérifié.', 'not-applied': 'Aucune lecture suivante n’était nécessaire après la réponse native sans écriture.' },
};
const PT: ClearCopy = {
    action: 'Apagar o histórico local', description: 'A tentativa, a confirmação e a leitura seguinte são factos independentes. Só foi observada uma geração vazia quando a geração exata revista avançou sem entradas; isto não descreve o histórico atual.',
    response: 'Resposta do serviço de eliminação', submission: 'Tentativa de eliminação nativa', submitted: 'Foi observada uma tentativa de eliminação nativa.', notObserved: 'Não há observação disponível.', incomplete: 'Faltam algumas observações. Uma tentativa não observada não prova que não ocorreu alteração.',
    states: { reviewed: 'Eliminação revista; nenhuma tentativa observada.', running: 'A eliminação está em curso. Consulte a tentativa, a confirmação e a leitura seguinte separadamente.', cancelled: 'A revisão de eliminação não enviada foi cancelada.', blocked: 'A revisão de eliminação ficou indisponível antes da confirmação.', settled: 'O serviço de eliminação devolveu um resultado. Consulte o que foi observado.' },
    results: { pending: 'A aguardar o resultado do serviço', cancelled: 'Revisão não enviada cancelada', blocked: 'Revisão indisponível', 'observed-cleared': 'A geração seguinte exata foi observada vazia', unknown: 'Não foi possível verificar a eliminação revista', 'not-applied': 'A operação nativa indicou que nenhuma escrita foi aplicada' },
    observations: { 'not-observed': 'Não foi observada uma leitura seguinte.', cleared: 'A geração seguinte exata foi observada vazia.', changed: 'A leitura seguinte não correspondeu à eliminação revista.', unavailable: 'Não foi possível verificar o estado seguinte.', 'not-applied': 'Não foi necessária uma leitura seguinte após a resposta nativa sem escrita.' },
};
const COPIES: Readonly<Record<string, ClearCopy>> = deepFreeze({ en: EN, es: ES, fr: FR, pt: PT });
export function clearCopy(locale: string): Readonly<ClearCopy> { return Object.hasOwn(COPIES, locale) ? COPIES[locale] : EN; }
