import type { CollectionFact, CollectionPreferenceFact, CollectionPolicyObservation } from './collection_fact.ts';
import { deepFreeze } from './value.ts';

interface CollectionCopy {
    description: string; result: string; pause: string; activation: string; notRequired: string; notApplicable: string; incomplete: string; attribution: string;
    actions: Readonly<Record<CollectionFact['action'], string>>;
    states: Readonly<Record<CollectionFact['state'], string>>;
    preferencePhases: Readonly<Record<CollectionPreferenceFact['phase'], string>>;
    policyPhases: Readonly<Record<CollectionPolicyObservation['phase'], string>>;
    waiting: string; cancelled: string; blocked: string;
}
const EN: CollectionCopy = {
    description: 'Preference, prerequisite pause and activation are independent observations. A returned result does not prove that every effect completed or describe collection now.',
    result: 'Collection service response', pause: 'Prerequisite durable pause', activation: 'Collection activation', notRequired: 'This reviewed plan did not require a preference write.',
    notApplicable: 'Stopping does not activate collection.', incomplete: 'Some phase observations are incomplete. Read current collection state before continuing.', attribution: 'Exact receipt belongs to this operation',
    actions: { start: 'Enable optional collection', stop: 'Stop optional collection' },
    states: { reviewed: 'Collection change reviewed; no write attempt observed.', running: 'The collection operation is in progress. Inspect each phase separately.', cancelled: 'The unsubmitted collection review was cancelled.', blocked: 'The collection review became unavailable before confirmation.', settled: 'The collection service returned a result. Inspect its independent effects.' },
    preferencePhases: { 'not-observed': 'No preference-write observation is available.', submitted: 'A preference write was attempted; its result is pending.', settled: 'The preference result was observed.', blocked: 'Preference publication was blocked before a write.' },
    policyPhases: { 'not-observed': 'No observation of this phase is available.', submitted: 'A native policy command was attempted; its result is pending.', observed: 'This phase was inspected; acknowledgement and state remain separate.' },
    waiting: 'Awaiting the service result', cancelled: 'Unsubmitted review cancelled', blocked: 'Review no longer available',
};
const ES: CollectionCopy = {
    description: 'La preferencia, la pausa previa y la activación son observaciones independientes. Un resultado no demuestra que todos los efectos se completaran ni describe la recopilación actual.',
    result: 'Respuesta del servicio de recopilación', pause: 'Pausa duradera previa', activation: 'Activación de la recopilación', notRequired: 'Este plan revisado no requería escribir una preferencia.',
    notApplicable: 'Detener no activa la recopilación.', incomplete: 'Algunas observaciones de los pasos están incompletas. Consulta el estado actual de la recopilación antes de continuar.', attribution: 'El recibo exacto pertenece a esta operación',
    actions: { start: 'Activar la recopilación opcional', stop: 'Detener la recopilación opcional' },
    states: { reviewed: 'Cambio de recopilación revisado; no se ha observado un intento de escritura.', running: 'La operación de recopilación está en curso. Consulta cada paso por separado.', cancelled: 'Se canceló la revisión de recopilación sin enviar.', blocked: 'La revisión de recopilación dejó de estar disponible antes de confirmar.', settled: 'El servicio de recopilación devolvió un resultado. Consulta sus efectos independientes.' },
    preferencePhases: { 'not-observed': 'No hay una observación de escritura de preferencias.', submitted: 'Se intentó escribir la preferencia; el resultado está pendiente.', settled: 'Se observó el resultado de la preferencia.', blocked: 'La publicación de preferencias se bloqueó antes de escribir.' },
    policyPhases: { 'not-observed': 'No hay una observación de este paso.', submitted: 'Se intentó un comando nativo de política; el resultado está pendiente.', observed: 'Se consultó este paso; la confirmación y el estado siguen separados.' },
    waiting: 'Esperando el resultado del servicio', cancelled: 'Revisión sin enviar cancelada', blocked: 'Revisión no disponible',
};
const FR: CollectionCopy = {
    description: 'La préférence, la pause préalable et l’activation sont des observations indépendantes. Un résultat ne prouve pas que chaque effet est terminé et ne décrit pas la collecte actuelle.',
    result: 'Réponse du service de collecte', pause: 'Pause durable préalable', activation: 'Activation de la collecte', notRequired: 'Ce plan vérifié ne nécessitait pas d’écriture de préférence.',
    notApplicable: 'L’arrêt n’active pas la collecte.', incomplete: 'Certaines observations des étapes sont incomplètes. Consultez l’état actuel de la collecte avant de continuer.', attribution: 'Le reçu exact appartient à cette opération',
    actions: { start: 'Activer la collecte facultative', stop: 'Arrêter la collecte facultative' },
    states: { reviewed: 'Changement de collecte vérifié ; aucune tentative d’écriture observée.', running: 'L’opération de collecte est en cours. Consultez chaque étape séparément.', cancelled: 'La confirmation de collecte non envoyée a été annulée.', blocked: 'La confirmation de collecte est devenue indisponible avant l’envoi.', settled: 'Le service de collecte a renvoyé un résultat. Consultez ses effets indépendants.' },
    preferencePhases: { 'not-observed': 'Aucune observation d’écriture de préférence disponible.', submitted: 'Une écriture de préférence a été tentée ; résultat en attente.', settled: 'Le résultat de la préférence a été observé.', blocked: 'La publication de préférence a été bloquée avant l’écriture.' },
    policyPhases: { 'not-observed': 'Aucune observation disponible pour cette étape.', submitted: 'Une commande native de politique a été tentée ; résultat en attente.', observed: 'Cette étape a été inspectée ; l’accusé et l’état restent distincts.' },
    waiting: 'En attente du résultat du service', cancelled: 'Confirmation non envoyée annulée', blocked: 'Confirmation indisponible',
};
const PT: CollectionCopy = {
    description: 'A preferência, a pausa prévia e a ativação são observações independentes. Um resultado não prova que todos os efeitos terminaram nem descreve a recolha atual.',
    result: 'Resposta do serviço de recolha', pause: 'Pausa duradoura prévia', activation: 'Ativação da recolha', notRequired: 'Este plano revisto não exigia uma escrita de preferência.',
    notApplicable: 'Parar não ativa a recolha.', incomplete: 'Algumas observações dos passos estão incompletas. Consulte o estado atual da recolha antes de continuar.', attribution: 'O recibo exato pertence a esta operação',
    actions: { start: 'Ativar a recolha opcional', stop: 'Parar a recolha opcional' },
    states: { reviewed: 'Alteração da recolha revista; nenhuma tentativa de escrita observada.', running: 'A operação de recolha está em curso. Consulte cada passo separadamente.', cancelled: 'A revisão de recolha não enviada foi cancelada.', blocked: 'A revisão de recolha ficou indisponível antes da confirmação.', settled: 'O serviço de recolha devolveu um resultado. Consulte os efeitos independentes.' },
    preferencePhases: { 'not-observed': 'Não há observação de escrita de preferência disponível.', submitted: 'Foi tentada uma escrita de preferência; o resultado está pendente.', settled: 'O resultado da preferência foi observado.', blocked: 'A publicação da preferência foi bloqueada antes da escrita.' },
    policyPhases: { 'not-observed': 'Não há observação disponível deste passo.', submitted: 'Foi tentado um comando nativo de política; o resultado está pendente.', observed: 'Este passo foi consultado; a confirmação e o estado permanecem separados.' },
    waiting: 'A aguardar o resultado do serviço', cancelled: 'Revisão não enviada cancelada', blocked: 'Revisão indisponível',
};
const COPIES: Readonly<Record<string, CollectionCopy>> = { en: EN, es: ES, fr: FR, pt: PT };
export function collectionCopy(locale: string): Readonly<CollectionCopy> { return deepFreeze(Object.hasOwn(COPIES, locale) ? COPIES[locale] : EN); }
