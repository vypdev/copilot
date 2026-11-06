import type { SessionFact, SessionEffectFact, SessionAction, SessionEffect } from './session_fact.ts';
import { deepFreeze } from './value.ts';
interface SessionCopy {
    description: string; result: string; empty: string; incomplete: string; acknowledgement: string; observation: string;
    actions: Readonly<Record<SessionAction, string>>; effects: Readonly<Record<SessionEffect, string>>;
    operationStates: Readonly<Record<SessionFact['state'], string>>; results: Readonly<Record<SessionFact['result'], string>>;
    effectStates: Readonly<Record<SessionEffectFact['state'], string>>;
    acknowledgements: Readonly<Record<SessionEffectFact['acknowledgement'], string>>;
    observations: Readonly<Record<SessionEffectFact['observation'], string>>;
}
const EN: SessionCopy = {
    description: 'Each storage attempt is shown separately. These observations do not replace a fresh read of current sessions.',
    result: 'Session service response', empty: 'No storage attempt was observed for this operation.', incomplete: 'Some storage effects were not fully observed. Inspect current sessions before continuing.', acknowledgement: 'Native acknowledgement', observation: 'State at inspection',
    actions: { connect: 'Connect a named read session', select: 'Verify and select a session', disconnect: 'Disconnect the selected read session', remove: 'Remove a named session', 'revoke-all': 'Forget all protected sessions', 'connect-role': 'Add an optional-purpose session', 'disable-role': 'Disable an optional purpose' },
    effects: { 'retire-active': 'Remove the previous active credential', 'save-active': 'Save the verified active connection', 'cleanup-active': 'Remove the candidate after an incomplete operation', 'save-repository-preference': 'Save the repository read preference', 'save-vault': 'Save local named sessions', 'remove-vault': 'Remove the local session vault' },
    operationStates: { running: 'The session operation is in progress.', settled: 'The session service returned a result. Inspect each storage effect separately.' },
    results: { pending: 'Waiting for the service', ready: 'An updated session view was returned', invalid: 'Invalid request', capacity: 'Session capacity reached', conflict: 'Sessions changed', stale: 'The source context changed', unavailable: 'The service result is unavailable', denied: 'The current editor is required', unknown: 'The result remains unconfirmed', limited: 'GitHub limited the request', cooldown: 'Waiting for the existing cooldown', budget: 'The read budget is exhausted' },
    effectStates: { submitted: 'An attempt was observed; its result is pending.', settled: 'The attempted effect was inspected.' },
    acknowledgements: { accepted: 'Acknowledged', unknown: 'Acknowledgement unknown' },
    observations: { 'not-observed': 'Not inspected yet', committed: 'Desired state verified', different: 'A different state was observed', unavailable: 'The state could not be verified' },
};
const ES: SessionCopy = {
    description: 'Cada intento de almacenamiento se muestra por separado. Estas observaciones no sustituyen una consulta actual de las sesiones.',
    result: 'Respuesta del servicio de sesiones', empty: 'No se observó un intento de almacenamiento para esta operación.', incomplete: 'Algunos efectos de almacenamiento no se observaron por completo. Consulta las sesiones actuales antes de continuar.', acknowledgement: 'Confirmación nativa', observation: 'Estado en la consulta',
    actions: { connect: 'Conectar una sesión de lectura con nombre', select: 'Verificar y seleccionar una sesión', disconnect: 'Desconectar la sesión de lectura seleccionada', remove: 'Eliminar una sesión con nombre', 'revoke-all': 'Olvidar todas las sesiones protegidas', 'connect-role': 'Añadir una sesión para un propósito opcional', 'disable-role': 'Desactivar un propósito opcional' },
    effects: { 'retire-active': 'Eliminar la credencial activa anterior', 'save-active': 'Guardar la conexión activa verificada', 'cleanup-active': 'Eliminar la candidata tras una operación incompleta', 'save-repository-preference': 'Guardar la preferencia de lectura del repositorio', 'save-vault': 'Guardar las sesiones locales con nombre', 'remove-vault': 'Eliminar el almacén local de sesiones' },
    operationStates: { running: 'La operación de sesión está en curso.', settled: 'El servicio de sesiones devolvió un resultado. Consulta cada efecto de almacenamiento por separado.' },
    results: { pending: 'Esperando al servicio', ready: 'Se devolvió una vista actualizada de las sesiones', invalid: 'Solicitud no válida', capacity: 'Se alcanzó el límite de sesiones', conflict: 'Las sesiones cambiaron', stale: 'El contexto de origen cambió', unavailable: 'El resultado del servicio no está disponible', denied: 'Se requiere la ventana editora actual', unknown: 'El resultado sigue sin confirmar', limited: 'GitHub limitó la solicitud', cooldown: 'Esperando la pausa existente', budget: 'Se agotó el presupuesto de lecturas' },
    effectStates: { submitted: 'Se observó un intento; su resultado está pendiente.', settled: 'Se consultó el efecto intentado.' },
    acknowledgements: { accepted: 'Confirmada', unknown: 'Confirmación desconocida' },
    observations: { 'not-observed': 'Aún no consultado', committed: 'Estado deseado verificado', different: 'Se observó otro estado', unavailable: 'No se pudo verificar el estado' },
};
const FR: SessionCopy = {
    description: 'Chaque tentative de stockage est présentée séparément. Ces observations ne remplacent pas une nouvelle lecture des sessions actuelles.',
    result: 'Réponse du service de sessions', empty: 'Aucune tentative de stockage observée pour cette opération.', incomplete: 'Certains effets de stockage n’ont pas été entièrement observés. Consultez les sessions actuelles avant de continuer.', acknowledgement: 'Accusé natif', observation: 'État lors de la consultation',
    actions: { connect: 'Connecter une session de lecture nommée', select: 'Vérifier et sélectionner une session', disconnect: 'Déconnecter la session de lecture sélectionnée', remove: 'Supprimer une session nommée', 'revoke-all': 'Oublier toutes les sessions protégées', 'connect-role': 'Ajouter une session à usage facultatif', 'disable-role': 'Désactiver un usage facultatif' },
    effects: { 'retire-active': 'Supprimer l’ancien identifiant actif', 'save-active': 'Enregistrer la connexion active vérifiée', 'cleanup-active': 'Supprimer la candidate après une opération incomplète', 'save-repository-preference': 'Enregistrer la préférence de lecture du dépôt', 'save-vault': 'Enregistrer les sessions locales nommées', 'remove-vault': 'Supprimer le coffre local des sessions' },
    operationStates: { running: 'L’opération de session est en cours.', settled: 'Le service de sessions a renvoyé un résultat. Consultez chaque effet de stockage séparément.' },
    results: { pending: 'En attente du service', ready: 'Une vue actualisée des sessions a été renvoyée', invalid: 'Requête invalide', capacity: 'Limite de sessions atteinte', conflict: 'Les sessions ont changé', stale: 'Le contexte d’origine a changé', unavailable: 'Résultat du service indisponible', denied: 'La fenêtre éditrice actuelle est requise', unknown: 'Le résultat reste non confirmé', limited: 'GitHub a limité la requête', cooldown: 'En attente du délai existant', budget: 'Budget de lecture épuisé' },
    effectStates: { submitted: 'Une tentative a été observée ; son résultat est en attente.', settled: 'L’effet tenté a été inspecté.' },
    acknowledgements: { accepted: 'Accusé reçu', unknown: 'Accusé inconnu' },
    observations: { 'not-observed': 'Pas encore inspecté', committed: 'État souhaité vérifié', different: 'Un autre état a été observé', unavailable: 'Impossible de vérifier l’état' },
};
const PT: SessionCopy = {
    description: 'Cada tentativa de armazenamento é apresentada separadamente. Estas observações não substituem uma nova consulta das sessões atuais.',
    result: 'Resposta do serviço de sessões', empty: 'Não foi observada uma tentativa de armazenamento para esta operação.', incomplete: 'Alguns efeitos de armazenamento não foram observados por completo. Consulte as sessões atuais antes de continuar.', acknowledgement: 'Confirmação nativa', observation: 'Estado na consulta',
    actions: { connect: 'Ligar uma sessão de leitura com nome', select: 'Verificar e selecionar uma sessão', disconnect: 'Desligar a sessão de leitura selecionada', remove: 'Remover uma sessão com nome', 'revoke-all': 'Esquecer todas as sessões protegidas', 'connect-role': 'Adicionar uma sessão para uma finalidade opcional', 'disable-role': 'Desativar uma finalidade opcional' },
    effects: { 'retire-active': 'Remover a credencial ativa anterior', 'save-active': 'Guardar a ligação ativa verificada', 'cleanup-active': 'Remover a candidata após uma operação incompleta', 'save-repository-preference': 'Guardar a preferência de leitura do repositório', 'save-vault': 'Guardar as sessões locais com nome', 'remove-vault': 'Remover o cofre local de sessões' },
    operationStates: { running: 'A operação de sessão está em curso.', settled: 'O serviço de sessões devolveu um resultado. Consulte cada efeito de armazenamento separadamente.' },
    results: { pending: 'A aguardar o serviço', ready: 'Foi devolvida uma vista atualizada das sessões', invalid: 'Pedido inválido', capacity: 'Limite de sessões atingido', conflict: 'As sessões mudaram', stale: 'O contexto de origem mudou', unavailable: 'Resultado do serviço indisponível', denied: 'É necessária a janela editora atual', unknown: 'O resultado continua por confirmar', limited: 'O GitHub limitou o pedido', cooldown: 'A aguardar a pausa existente', budget: 'Orçamento de leituras esgotado' },
    effectStates: { submitted: 'Foi observada uma tentativa; o resultado está pendente.', settled: 'O efeito tentado foi consultado.' },
    acknowledgements: { accepted: 'Confirmada', unknown: 'Confirmação desconhecida' },
    observations: { 'not-observed': 'Ainda não consultado', committed: 'Estado pretendido verificado', different: 'Foi observado outro estado', unavailable: 'Não foi possível verificar o estado' },
};
const COPIES: Readonly<Record<string, SessionCopy>> = { en: EN, es: ES, fr: FR, pt: PT };
export function sessionCopy(locale: string): Readonly<SessionCopy> { return deepFreeze(Object.hasOwn(COPIES, locale) ? COPIES[locale] : EN); }
