import type { CenterLocale } from './center_copy_types.ts';
import type { SessionPurpose } from './credential_roles.ts';
import { deepFreeze } from './value.ts';

export interface CredentialRoleCopy {
    readonly purpose: string; readonly labels: Readonly<Record<SessionPurpose, string>>; readonly hints: Readonly<Record<SessionPurpose, string>>;
    readonly credential: string; readonly discard: string; readonly unselected: string; readonly grant: string; readonly availability: string;
    readonly states: Readonly<Record<'disabled' | 'stored' | 'identity-verified', string>>;
    readonly unavailable: string; readonly refresh: string; readonly disable: string; readonly review: string; readonly title: string; readonly hint: string;
    readonly confirm: string; readonly cancel: string; readonly close: string; readonly pending: string; readonly saved: string;
    readonly unknown: string; readonly changed: string; readonly independent: string; readonly navigation: string; readonly draft: string;
}
const COPIES: Readonly<Record<CenterLocale, CredentialRoleCopy>> = deepFreeze({
    en: {
        purpose: 'Credential purpose', labels: { 'repository-read': 'Read selected repository', 'issues-write': 'Issue triage', 'actions-write': 'Actions operations' },
        hints: { 'repository-read': 'Use a user-owned read credential for the selected repository. This role makes no GitHub changes.',
            'issues-write': 'Use a separate fine-grained personal token for the selected repository, with Metadata read and Issues write. Never use setup, bot or provider secrets.',
            'actions-write': 'Use a separate fine-grained personal token for the selected repository, with Metadata read and Actions write. Never use setup, bot or provider secrets.' },
        credential: 'User-owned GitHub credential', discard: 'Discard connection draft', unselected: 'Not selected', grant: 'Identity verification does not establish write permissions. Every operation needs its own permission checks and review.',
        availability: 'Issue and run operation controls are not available yet. Saving or selecting a role does not enable them or change anything on GitHub.',
        states: { disabled: 'Disabled', stored: 'Stored selection; verify this identity again', 'identity-verified': 'Account and repository verified for this selection' },
        unavailable: 'Current purpose state unavailable', refresh: 'Read current sessions', disable: 'Disable this purpose', review: 'Review selection', title: 'Review optional-purpose selection', hint: 'This chooses the identity for this purpose only. No GitHub write is requested.',
        confirm: 'Verify and select this identity', cancel: 'Keep current selection', close: 'Return to sessions', pending: 'Verifying the selected account and repository…', saved: 'Selection saved. Write permissions remain unverified.',
        unknown: 'The response did not establish the selection outcome. Read current sessions; do not repeat this request automatically.', changed: 'The session source changed. Close this review and read the current sessions before choosing again.',
        independent: 'The selected read identity is independent of this optional purpose.', navigation: 'Leaving closes local session forms. Previously requested or saved session changes are not undone.', draft: 'Finish or discard the connection draft before opening another session review.',
    },
    es: {
        purpose: 'Propósito de la credencial', labels: { 'repository-read': 'Leer el repositorio seleccionado', 'issues-write': 'Triaje de issues', 'actions-write': 'Operaciones de Actions' },
        hints: { 'repository-read': 'Usa una credencial personal de lectura para el repositorio seleccionado. Este rol no cambia nada en GitHub.',
            'issues-write': 'Usa un token personal de acceso granular independiente, con Metadata de lectura e Issues de escritura para el repositorio seleccionado. Nunca uses secretos del setup, bots o proveedores.',
            'actions-write': 'Usa un token personal de acceso granular independiente, con Metadata de lectura y Actions de escritura para el repositorio seleccionado. Nunca uses secretos del setup, bots o proveedores.' },
        credential: 'Credencial personal de GitHub', discard: 'Descartar borrador de conexión', unselected: 'Sin seleccionar', grant: 'Verificar la identidad no acredita permisos de escritura. Cada operación exige sus propias comprobaciones de permisos y revisión.',
        availability: 'Los controles de operaciones sobre issues y ejecuciones aún no están disponibles. Guardar o seleccionar un rol no los activa ni cambia nada en GitHub.',
        states: { disabled: 'Desactivado', stored: 'Selección guardada; vuelve a verificar esta identidad', 'identity-verified': 'Cuenta y repositorio verificados para esta selección' },
        unavailable: 'Estado actual del propósito no disponible', refresh: 'Leer sesiones actuales', disable: 'Desactivar este propósito', review: 'Revisar selección', title: 'Revisar selección de propósito opcional', hint: 'Esta elección afecta solo a la identidad de este propósito. No solicita escrituras en GitHub.',
        confirm: 'Verificar y seleccionar esta identidad', cancel: 'Conservar selección actual', close: 'Volver a las sesiones', pending: 'Verificando la cuenta y el repositorio seleccionados…', saved: 'Selección guardada. Los permisos de escritura siguen sin verificar.',
        unknown: 'La respuesta no confirma el resultado de la selección. Lee las sesiones actuales; no repitas la solicitud automáticamente.', changed: 'El origen de la sesión ha cambiado. Cierra esta revisión y lee las sesiones actuales antes de elegir otra vez.',
        independent: 'La identidad de lectura seleccionada es independiente de este propósito opcional.', navigation: 'Al salir se cierran los formularios locales. No se deshacen los cambios de sesión ya solicitados o guardados.', draft: 'Completa o descarta el borrador de conexión antes de abrir otra revisión de sesión.',
    },
    fr: {
        purpose: 'Usage de l’identifiant', labels: { 'repository-read': 'Lire le dépôt sélectionné', 'issues-write': 'Triage des tickets', 'actions-write': 'Opérations Actions' },
        hints: { 'repository-read': 'Utilisez un identifiant personnel de lecture pour le dépôt sélectionné. Cet usage ne modifie rien sur GitHub.',
            'issues-write': 'Utilisez un jeton personnel à permissions fines distinct, avec Metadata en lecture et Issues en écriture pour le dépôt sélectionné. Aucun secret de configuration, de robot ou de fournisseur.',
            'actions-write': 'Utilisez un jeton personnel à permissions fines distinct, avec Metadata en lecture et Actions en écriture pour le dépôt sélectionné. Aucun secret de configuration, de robot ou de fournisseur.' },
        credential: 'Identifiant GitHub personnel', discard: 'Abandonner le brouillon de connexion', unselected: 'Non sélectionné', grant: 'La vérification de l’identité ne prouve pas les droits d’écriture. Chaque opération exige ses propres contrôles et sa revue.',
        availability: 'Les commandes de tickets et d’exécutions ne sont pas encore disponibles. Enregistrer ou sélectionner un usage ne les active pas et ne modifie rien sur GitHub.',
        states: { disabled: 'Désactivé', stored: 'Sélection conservée ; vérifiez à nouveau cette identité', 'identity-verified': 'Compte et dépôt vérifiés pour cette sélection' },
        unavailable: 'État actuel de l’usage indisponible', refresh: 'Consulter les sessions actuelles', disable: 'Désactiver cet usage', review: 'Examiner la sélection', title: 'Examiner la sélection d’un usage facultatif', hint: 'Ce choix concerne uniquement l’identité de cet usage. Aucune écriture GitHub n’est demandée.',
        confirm: 'Vérifier et sélectionner cette identité', cancel: 'Conserver la sélection actuelle', close: 'Revenir aux sessions', pending: 'Vérification du compte et du dépôt sélectionnés…', saved: 'Sélection enregistrée. Les droits d’écriture restent à vérifier.',
        unknown: 'La réponse ne confirme pas le résultat de la sélection. Consultez les sessions actuelles sans répéter automatiquement la demande.', changed: 'La source de la session a changé. Fermez cette revue et consultez les sessions actuelles avant de choisir à nouveau.',
        independent: 'L’identité de lecture sélectionnée est indépendante de cet usage facultatif.', navigation: 'Quitter ferme les formulaires locaux. Les changements de session déjà demandés ou enregistrés ne sont pas annulés.', draft: 'Terminez ou abandonnez le brouillon de connexion avant d’ouvrir une autre revue de session.',
    },
    pt: {
        purpose: 'Finalidade da credencial', labels: { 'repository-read': 'Ler o repositório selecionado', 'issues-write': 'Triagem de issues', 'actions-write': 'Operações do Actions' },
        hints: { 'repository-read': 'Use uma credencial pessoal de leitura para o repositório selecionado. Esta finalidade não altera o GitHub.',
            'issues-write': 'Use um token pessoal de acesso granular separado, com Metadata de leitura e Issues de escrita para o repositório selecionado. Nunca use segredos do setup, bots ou fornecedores.',
            'actions-write': 'Use um token pessoal de acesso granular separado, com Metadata de leitura e Actions de escrita para o repositório selecionado. Nunca use segredos do setup, bots ou fornecedores.' },
        credential: 'Credencial pessoal do GitHub', discard: 'Descartar rascunho de conexão', unselected: 'Não selecionada', grant: 'Verificar a identidade não comprova permissões de escrita. Cada operação exige as suas próprias verificações e revisão.',
        availability: 'Os controlos de operações sobre issues e execuções ainda não estão disponíveis. Guardar ou selecionar uma finalidade não os ativa nem altera o GitHub.',
        states: { disabled: 'Desativada', stored: 'Seleção guardada; verifique esta identidade novamente', 'identity-verified': 'Conta e repositório verificados para esta seleção' },
        unavailable: 'Estado atual da finalidade indisponível', refresh: 'Consultar as sessões atuais', disable: 'Desativar esta finalidade', review: 'Rever seleção', title: 'Rever seleção de finalidade opcional', hint: 'Esta escolha afeta apenas a identidade desta finalidade. Não solicita escrita no GitHub.',
        confirm: 'Verificar e selecionar esta identidade', cancel: 'Manter seleção atual', close: 'Voltar às sessões', pending: 'A verificar a conta e o repositório selecionados…', saved: 'Seleção guardada. As permissões de escrita continuam por verificar.',
        unknown: 'A resposta não confirma o resultado da seleção. Consulte as sessões atuais; não repita a solicitação automaticamente.', changed: 'A origem da sessão mudou. Feche esta revisão e consulte as sessões atuais antes de escolher novamente.',
        independent: 'A identidade de leitura selecionada é independente desta finalidade opcional.', navigation: 'Sair fecha os formulários locais. As alterações de sessão já solicitadas ou guardadas não são anuladas.', draft: 'Conclua ou descarte o rascunho de conexão antes de abrir outra revisão de sessão.',
    },
});
export function credentialRoleCopy(locale: CenterLocale): CredentialRoleCopy { return COPIES[locale]; }
