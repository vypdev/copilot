import { canonicalizeLocaleTag } from '../../domain/locale';
import { MESSAGE_CATALOG_VERSION, validateCatalogDefinition, type MessageCatalogDefinition } from '../../domain/message_catalog';
import { resolveStaticMessageCatalogView } from './resolved_message_catalog_policy';

const english = Object.freeze({
  title: 'Install the Bugbot status publisher — {repository}',
  inspecting: 'Inspecting the proposal, source and destination. No changes started.',
  preview: 'Review both complete files before creating the installation PR.',
  effects: 'Approval permits one Git tree, one commit, one installation branch and one PR for these files.',
  dryRun: 'Preview complete. No GitHub changes or operation journal were written.',
  unchanged: 'The exact publisher is already present. No empty PR was created.',
  declined: 'You declined this snapshot. No new installation effects started.',
  cancelled: 'Installation stopped. Inspect any retained effects before continuing.',
  applying: 'Creating the approved installation PR. The default branch is not updated.',
  waitingMerge: 'The installation PR is ready for review: {url}',
  nextMerge: 'Review and merge that PR separately, then obtain the separately authorized native verification.',
  nativePending: 'Native verification remains pending. Delivery does not prove installation.',
  production: 'This publisher plan preserves the production verification settings.',
  retained: 'Previously retained effects: {effects}',
  uncertain: 'Unconfirmed effect: {effect}. Inspect the operation; do not repeat an unknown object creation.',
  journalUnconfirmed: 'The latest operation could not be saved. Preserve this report and inspect the existing receipt before resuming.',
  operationRecord: 'Saved operation record: {url}',
  knownPullRequest: 'Installation pull request: {url}',
  operation: 'Operation: {id}',
  source: 'Source: vypdev/copilot@{commit}',
  target: 'Target: {repository} · {branch}@{head}',
  actor: 'Authenticated actor ID: {id}',
  digest: 'Approved plan: {digest}',
  file: 'Complete file: {path} · {bytes} bytes · SHA-256 {hash}',
  object: '{effect}: {sha}',
  'effect.tree': 'Git tree',
  'effect.commit': 'commit',
  'effect.branch': 'installation branch',
  'effect.pull-request': 'installation PR',
  noEffects: 'No confirmed effects.',
  confirm: 'Type {approve} to approve these exact files, {decline} to decline, or press Enter to cancel: ',
  approve: 'APPROVE',
  decline: 'DECLINE',
  tokenPrompt: 'GitHub token (hidden)',
  tokenRequired: 'Provide a valid --token or PERSONAL_ACCESS_TOKEN, or use an interactive terminal for hidden entry.',
  interactiveRequired: 'Fresh approval needs an interactive terminal. Use --dry-run to inspect without applying.',
  invalid: 'The publisher options or local proposal are invalid. Check the supported options and the regular UTF-8 proposal file.',
  blocked: 'The installation could not continue. Inspect access and the retained operation, then prepare a fresh preview.',
  stale: 'The reviewed source, target, actor or operation changed. Prepare a fresh preview before applying.',
  authority: 'Relevant write authority is denied or cannot be established. Inspect the existing credential and repository access.',
  sourceUnverified: 'The exact reviewed, merged source and its file identities could not be established.',
  unsupported: 'The installed manifest, guidance or workflow inventory is unsupported or uncertain. Inspect it before preparing another proposal.',
  resumeMissing: 'No compatible publisher operation exists for this ID. Check the selected receipt.',
  resumeRequired: 'This operation already exists. Inspect it and explicitly select --resume-operation for fresh review.',
  recovery: 'Keep the operation ID and known object identities. Review a fresh snapshot before any further change.',
  prTitle: 'Install the Bugbot status publisher',
  prBody: 'Install the reviewed publisher workflow and preserve compatible Setup metadata.\n\nSource: vypdev/copilot@{commit}\n\nDefault-branch merge and native verification remain pending. This PR preserves the production verification settings.',
});
export type SetupPublisherMessageId = keyof typeof english;

const spanish: Readonly<Record<SetupPublisherMessageId, string>> = Object.freeze({
  title: 'Instalar el publicador de estados de Bugbot — {repository}',
  inspecting: 'Comprobando la propuesta, la fuente y el destino. No se han iniciado cambios.',
  preview: 'Revisa los dos archivos completos antes de crear la PR de instalación.',
  effects: 'La aprobación permite un árbol Git, un commit, una rama de instalación y una PR para estos archivos.',
  dryRun: 'Vista previa completada. No se han escrito cambios en GitHub ni un diario de operación.',
  unchanged: 'El publicador exacto ya está presente. No se ha creado una PR vacía.',
  declined: 'Has rechazado esta revisión. No se han iniciado nuevos efectos de instalación.',
  cancelled: 'Instalación detenida. Revisa los efectos conservados antes de continuar.',
  applying: 'Creando la PR de instalación aprobada. La rama por defecto no se actualiza.',
  waitingMerge: 'La PR de instalación está lista para revisión: {url}',
  nextMerge: 'Revisa y fusiona esa PR por separado; después, obtén la autorización específica para la verificación nativa.',
  nativePending: 'La verificación nativa sigue pendiente. La entrega no demuestra la instalación.',
  production: 'Este plan del publicador conserva la configuración de verificación en producción.',
  retained: 'Efectos conservados anteriormente: {effects}',
  uncertain: 'Efecto sin confirmar: {effect}. Inspecciona la operación; no repitas una creación de objetos de resultado desconocido.',
  journalUnconfirmed: 'No se ha podido guardar el último estado. Conserva este informe y revisa el recibo existente antes de reanudar.',
  operationRecord: 'Registro guardado de la operación: {url}',
  knownPullRequest: 'PR de instalación: {url}',
  operation: 'Operación: {id}', source: 'Fuente: vypdev/copilot@{commit}',
  target: 'Destino: {repository} · {branch}@{head}', actor: 'ID del actor autenticado: {id}',
  digest: 'Plan aprobado: {digest}', file: 'Archivo completo: {path} · {bytes} bytes · SHA-256 {hash}', object: '{effect}: {sha}',
  'effect.tree': 'árbol Git', 'effect.commit': 'commit', 'effect.branch': 'rama de instalación', 'effect.pull-request': 'PR de instalación',
  noEffects: 'No hay efectos confirmados.',
  confirm: 'Escribe {approve} para aprobar estos archivos exactos, {decline} para rechazarlos o pulsa Intro para cancelar: ',
  approve: 'APROBAR', decline: 'RECHAZAR', tokenPrompt: 'Token de GitHub (oculto)',
  tokenRequired: 'Proporciona un --token válido o PERSONAL_ACCESS_TOKEN, o usa un terminal interactivo para introducirlo de forma oculta.',
  interactiveRequired: 'Una aprobación nueva requiere un terminal interactivo. Usa --dry-run para inspeccionar sin aplicar.',
  invalid: 'Las opciones del publicador o la propuesta local no son válidas. Revisa las opciones admitidas y el archivo regular UTF-8 de la propuesta.',
  blocked: 'La instalación no puede continuar. Revisa el acceso y la operación conservada; después, prepara una vista previa nueva.',
  stale: 'Han cambiado la fuente, el destino, el actor o la operación revisados. Prepara una vista previa nueva antes de aplicar.',
  authority: 'Los permisos de escritura necesarios están denegados o no se pueden acreditar. Revisa la credencial existente y el acceso al repositorio.',
  sourceUnverified: 'No se han podido acreditar la fuente exacta revisada y fusionada ni las identidades de sus archivos.',
  unsupported: 'El manifiesto, las instrucciones o el inventario de workflows instalados son incompatibles o inciertos. Revísalos antes de preparar otra propuesta.',
  resumeMissing: 'No existe una operación compatible del publicador para este ID. Revisa el recibo seleccionado.',
  resumeRequired: 'Esta operación ya existe. Revísala y selecciona --resume-operation explícitamente para obtener una aprobación nueva.',
  recovery: 'Conserva el ID de operación y las identidades de los objetos conocidos. Revisa una vista previa nueva antes de cambiar nada más.',
  prTitle: 'Instalar el publicador de estados de Bugbot',
  prBody: 'Instalar el workflow revisado del publicador y conservar los metadatos compatibles de Setup.\n\nFuente: vypdev/copilot@{commit}\n\nLa fusión en la rama por defecto y la verificación nativa siguen pendientes. Esta PR conserva la configuración de verificación en producción.',
});
const french: Readonly<Record<SetupPublisherMessageId, string>> = Object.freeze({
  title: 'Installer le publicateur de statuts Bugbot — {repository}',
  inspecting: 'Vérification de la proposition, de la source et de la destination. Aucune modification commencée.',
  preview: 'Examinez les deux fichiers complets avant de créer la PR d’installation.',
  effects: 'L’approbation autorise un arbre Git, un commit, une branche d’installation et une PR pour ces fichiers.',
  dryRun: 'Aperçu terminé. Aucune modification GitHub ni écriture du journal d’opération.',
  unchanged: 'Le publicateur exact est déjà présent. Aucune PR vide créée.',
  declined: 'Vous avez refusé cet état. Aucun nouvel effet d’installation commencé.',
  cancelled: 'Installation arrêtée. Examinez les effets conservés avant de continuer.',
  applying: 'Création de la PR d’installation approuvée. La branche par défaut reste inchangée.',
  waitingMerge: 'La PR d’installation est prête à être examinée : {url}',
  nextMerge: 'Examinez et fusionnez cette PR séparément, puis obtenez l’autorisation spécifique de vérification native.',
  nativePending: 'La vérification native reste en attente. La livraison ne prouve pas l’installation.',
  production: 'Ce plan du publicateur conserve les paramètres de vérification en production.',
  retained: 'Effets précédemment conservés : {effects}',
  uncertain: 'Effet non confirmé : {effect}. Examinez l’opération ; ne répétez pas une création d’objet au résultat inconnu.',
  journalUnconfirmed: 'Le dernier état n’a pas pu être enregistré. Conservez ce rapport et examinez le reçu existant avant de reprendre.',
  operationRecord: 'Enregistrement sauvegardé de l’opération : {url}',
  knownPullRequest: 'Pull request d’installation : {url}',
  operation: 'Opération : {id}', source: 'Source : vypdev/copilot@{commit}',
  target: 'Destination : {repository} · {branch}@{head}', actor: 'ID de l’acteur authentifié : {id}',
  digest: 'Plan approuvé : {digest}', file: 'Fichier complet : {path} · {bytes} octets · SHA-256 {hash}', object: '{effect} : {sha}',
  'effect.tree': 'arbre Git', 'effect.commit': 'commit', 'effect.branch': 'branche d’installation', 'effect.pull-request': 'PR d’installation',
  noEffects: 'Aucun effet confirmé.',
  confirm: 'Saisissez {approve} pour approuver ces fichiers exacts, {decline} pour refuser, ou Entrée pour annuler : ',
  approve: 'APPROUVER', decline: 'REFUSER', tokenPrompt: 'Jeton GitHub (masqué)',
  tokenRequired: 'Fournissez un --token valide ou PERSONAL_ACCESS_TOKEN, ou utilisez un terminal interactif pour une saisie masquée.',
  interactiveRequired: 'Une nouvelle approbation nécessite un terminal interactif. Utilisez --dry-run pour examiner sans appliquer.',
  invalid: 'Les options du publicateur ou la proposition locale sont invalides. Vérifiez les options admises et le fichier régulier UTF-8 de la proposition.',
  blocked: 'L’installation ne peut pas continuer. Examinez les accès et l’opération conservée, puis préparez un nouvel aperçu.',
  stale: 'La source, la destination, l’acteur ou l’opération examinés ont changé. Préparez un nouvel aperçu avant d’appliquer.',
  authority: 'Les droits d’écriture nécessaires sont refusés ou ne peuvent pas être établis. Examinez le jeton existant et l’accès au dépôt.',
  sourceUnverified: 'La source exacte examinée et fusionnée, ainsi que l’identité de ses fichiers, n’ont pas pu être établies.',
  unsupported: 'Le manifeste installé, les instructions ou l’inventaire des workflows sont incompatibles ou incertains. Examinez-les avant de préparer une autre proposition.',
  resumeMissing: 'Aucune opération compatible du publicateur ne correspond à cet ID. Vérifiez le reçu sélectionné.',
  resumeRequired: 'Cette opération existe déjà. Examinez-la et sélectionnez explicitement --resume-operation pour une nouvelle approbation.',
  recovery: 'Conservez l’ID de l’opération et l’identité des objets connus. Examinez un nouvel aperçu avant toute autre modification.',
  prTitle: 'Installer le publicateur de statuts Bugbot',
  prBody: 'Installer le workflow examiné du publicateur et conserver les métadonnées Setup compatibles.\n\nSource : vypdev/copilot@{commit}\n\nLa fusion dans la branche par défaut et la vérification native restent en attente. Cette PR conserve les paramètres de vérification en production.',
});
const portuguese: Readonly<Record<SetupPublisherMessageId, string>> = Object.freeze({
  title: 'Instalar o publicador de estados do Bugbot — {repository}',
  inspecting: 'Verificando a proposta, a origem e o destino. Nenhuma alteração iniciada.',
  preview: 'Revise os dois arquivos completos antes de criar a PR de instalação.',
  effects: 'A aprovação permite uma árvore Git, um commit, uma branch de instalação e uma PR para estes arquivos.',
  dryRun: 'Prévia concluída. Nenhuma alteração no GitHub ou gravação no diário da operação.',
  unchanged: 'O publicador exato já está presente. Nenhuma PR vazia foi criada.',
  declined: 'Você recusou este estado. Nenhum novo efeito de instalação foi iniciado.',
  cancelled: 'Instalação interrompida. Revise os efeitos preservados antes de continuar.',
  applying: 'Criando a PR de instalação aprovada. A branch padrão não será atualizada.',
  waitingMerge: 'A PR de instalação está pronta para revisão: {url}',
  nextMerge: 'Revise e faça o merge dessa PR separadamente; depois, obtenha a autorização específica para a verificação nativa.',
  nativePending: 'A verificação nativa continua pendente. A entrega não comprova a instalação.',
  production: 'Este plano do publicador preserva a configuração de verificação em produção.',
  retained: 'Efeitos preservados anteriormente: {effects}',
  uncertain: 'Efeito não confirmado: {effect}. Inspecione a operação; não repita a criação de um objeto com resultado desconhecido.',
  journalUnconfirmed: 'Não foi possível salvar o último estado. Preserve este relatório e revise o recibo existente antes de retomar.',
  operationRecord: 'Registro salvo da operação: {url}',
  knownPullRequest: 'Pull request de instalação: {url}',
  operation: 'Operação: {id}', source: 'Origem: vypdev/copilot@{commit}',
  target: 'Destino: {repository} · {branch}@{head}', actor: 'ID do ator autenticado: {id}',
  digest: 'Plano aprovado: {digest}', file: 'Arquivo completo: {path} · {bytes} bytes · SHA-256 {hash}', object: '{effect}: {sha}',
  'effect.tree': 'árvore Git', 'effect.commit': 'commit', 'effect.branch': 'branch de instalação', 'effect.pull-request': 'PR de instalação',
  noEffects: 'Nenhum efeito confirmado.',
  confirm: 'Digite {approve} para aprovar estes arquivos exatos, {decline} para recusar, ou pressione Enter para cancelar: ',
  approve: 'APROVAR', decline: 'RECUSAR', tokenPrompt: 'Token do GitHub (oculto)',
  tokenRequired: 'Forneça um --token válido ou PERSONAL_ACCESS_TOKEN, ou use um terminal interativo para inserir o token de forma oculta.',
  interactiveRequired: 'Uma nova aprovação exige um terminal interativo. Use --dry-run para inspecionar sem aplicar.',
  invalid: 'As opções do publicador ou a proposta local são inválidas. Verifique as opções aceitas e o arquivo regular UTF-8 da proposta.',
  blocked: 'A instalação não pode continuar. Revise o acesso e a operação preservada; depois, prepare uma nova prévia.',
  stale: 'A origem, o destino, o ator ou a operação revisados mudaram. Prepare uma nova prévia antes de aplicar.',
  authority: 'Os direitos de gravação necessários foram negados ou não podem ser comprovados. Revise a credencial existente e o acesso ao repositório.',
  sourceUnverified: 'Não foi possível comprovar a origem exata revisada e integrada nem a identidade dos arquivos.',
  unsupported: 'O manifesto, as instruções ou o inventário de workflows instalados são incompatíveis ou incertos. Revise-os antes de preparar outra proposta.',
  resumeMissing: 'Não existe uma operação compatível do publicador para este ID. Verifique o recibo selecionado.',
  resumeRequired: 'Esta operação já existe. Revise-a e selecione --resume-operation explicitamente para uma nova aprovação.',
  recovery: 'Preserve o ID da operação e a identidade dos objetos conhecidos. Revise uma nova prévia antes de qualquer outra alteração.',
  prTitle: 'Instalar o publicador de estados do Bugbot',
  prBody: 'Instalar o workflow revisado do publicador e preservar os metadados compatíveis do Setup.\n\nOrigem: vypdev/copilot@{commit}\n\nO merge na branch padrão e a verificação nativa continuam pendentes. Esta PR preserva a configuração de verificação em produção.',
});

const definition = (locale: string, compatibleBaseLanguage: string, messages: Readonly<Record<SetupPublisherMessageId, string>>): MessageCatalogDefinition<SetupPublisherMessageId> =>
  Object.freeze({ version: MESSAGE_CATALOG_VERSION, locale, compatibleBaseLanguage, messages });
export const SETUP_PUBLISHER_CATALOG_DEFINITIONS = Object.freeze([
  definition('en-US', 'en', english), definition('es-ES', 'es', spanish), definition('fr-FR', 'fr', french), definition('pt-BR', 'pt', portuguese),
]);
export const SETUP_PUBLISHER_MESSAGE_IDS = Object.freeze(Object.keys(english) as SetupPublisherMessageId[]);

export function setupPublisherEnvironmentLocale(environment: Readonly<Partial<Record<'LC_ALL' | 'LC_MESSAGES' | 'LANG', unknown>>>): string {
  const raw = [environment.LC_ALL, environment.LC_MESSAGES, environment.LANG].find(value => value !== undefined && value !== '');
  if (typeof raw !== 'string' || raw.length > 255) return 'en-US';
  const match = /^([A-Za-z]{2,3})(?:[-_]([A-Za-z]{2}|\d{3}))?(?:\.[A-Za-z0-9-]+)?$/u.exec(raw);
  if (!match) return 'en-US';
  try { return canonicalizeLocaleTag(match[1] + (match[2] ? '-' + match[2] : '')); }
  catch { return 'en-US'; }
}

export function resolveStaticSetupPublisherCatalog(locale: unknown = 'en-US') {
  let normalized: string;
  try {
    if (typeof locale !== 'string' || locale !== locale.trim() || /[\p{Cc}\p{Cf}]/u.test(locale)) throw new Error('Invalid display locale.');
    normalized = canonicalizeLocaleTag(locale);
  }
  catch { normalized = 'en-US'; }
  const complete = SETUP_PUBLISHER_CATALOG_DEFINITIONS.filter(definition =>
    validateCatalogDefinition(definition, SETUP_PUBLISHER_MESSAGE_IDS).length === 0);
  return resolveStaticMessageCatalogView(normalized, SETUP_PUBLISHER_CATALOG_DEFINITIONS[0], complete);
}
export type SetupPublisherMessageCatalog = ReturnType<typeof resolveStaticSetupPublisherCatalog>;
