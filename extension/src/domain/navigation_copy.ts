import type { CenterLocale } from './center_copy_types.ts';
import { deepFreeze } from './value.ts';

export interface NavigationCopy {
    readonly locale: CenterLocale;
    readonly workIntro: string; readonly favorites: string; readonly emptyFavorites: string;
    readonly profiles: string; readonly emptyProfiles: string; readonly groups: string; readonly emptyGroups: string;
    readonly savedScope: string; readonly references: string; readonly selected: string; readonly tools: string;
    readonly attentionIntro: string; readonly emptyAttention: string; readonly notInspected: string;
    readonly globalPause: string; readonly onboarding: string; readonly profilePause: string;
    readonly current: string; readonly later: string; readonly roadmap: string; readonly guides: string;
    readonly copilotIntro: string; readonly setupIntro: string; readonly workDependency: string;
    readonly privacyTools: string; readonly privacyScope: string;
}
const copies: Readonly<Record<CenterLocale, NavigationCopy>> = deepFreeze({
    en: {
        locale: 'en',
        workIntro: 'Your saved local workspace. Open feature guides, selected profiles and repository groups from this browser.',
        favorites: 'Favorite feature guides', emptyFavorites: 'Choose favorites in Features to keep their guides here.',
        profiles: 'Saved profile selections', emptyProfiles: 'No profile is selected. You can review global preferences or choose profiles for their matching scope.',
        groups: 'Saved repository groups', emptyGroups: 'Create a local group to organize saved connection references.',
        savedScope: 'These are saved choices. Review their applicable scope and connection availability in Profiles and repository groups.',
        references: 'Saved references', selected: 'Selected local group', tools: 'Current local tools',
        attentionIntro: 'Review saved configuration choices that can explain why local features are paused or onboarding is incomplete.',
        emptyAttention: 'No matching local configuration review items in this saved revision.',
        notInspected: 'Review GitHub tasks, permissions and connection status in their own tools. This list reflects saved local preferences.',
        globalPause: 'A global pause is saved.', onboarding: 'Local onboarding can be resumed.',
        profilePause: 'This selected profile saves a pause. Review when its scope applies.',
        current: 'Development feature guide', later: 'Planned capability', roadmap: 'View implementation plan', guides: 'Planned capability guides',
        copilotIntro: 'Prepare connections, access and diagnostics with the current local tools. Repository status, command drafts and Action handoff belong to the linked Copilot integration milestone.',
        setupIntro: 'Prepare browser preferences, profiles and backups with the current local tools. Shared repository setup will use the shared setup engine described in the linked implementation plan.',
        workDependency: 'GitHub work queues and attention views belong to the linked work-management milestone.',
        privacyTools: 'Choose the privacy scope', privacyScope: 'Temporary API responses, connection credentials and the global pause have independent controls. Review their own scope before making a change.',
    },
    es: {
        locale: 'es',
        workIntro: 'Tu espacio local guardado. Abre guías de funciones, perfiles seleccionados y grupos de repositorios de este navegador.',
        favorites: 'Guías de funciones favoritas', emptyFavorites: 'Elige favoritos en Funciones para tener aquí sus guías.',
        profiles: 'Selecciones de perfiles guardadas', emptyProfiles: 'No hay ningún perfil seleccionado. Puedes revisar las preferencias globales o elegir perfiles para su ámbito correspondiente.',
        groups: 'Grupos de repositorios guardados', emptyGroups: 'Crea un grupo local para organizar las referencias de conexión guardadas.',
        savedScope: 'Son elecciones guardadas. Revisa su ámbito aplicable y la disponibilidad de conexiones en Perfiles y en los grupos de repositorios.',
        references: 'Referencias guardadas', selected: 'Grupo local seleccionado', tools: 'Herramientas locales actuales',
        attentionIntro: 'Revisa elecciones guardadas que pueden explicar por qué hay funciones pausadas o una incorporación sin terminar.',
        emptyAttention: 'No hay elementos de revisión local que coincidan en esta revisión guardada.',
        notInspected: 'Consulta las tareas de GitHub, los permisos y la conexión en sus herramientas correspondientes. Esta lista describe preferencias locales guardadas.',
        globalPause: 'Hay una pausa global guardada.', onboarding: 'Puedes retomar la incorporación local.',
        profilePause: 'Este perfil seleccionado guarda una pausa. Revisa cuándo se aplica su ámbito.',
        current: 'Guía de función en desarrollo', later: 'Capacidad prevista', roadmap: 'Ver plan de implementación', guides: 'Guías de capacidades previstas',
        copilotIntro: 'Prepara conexiones, acceso y diagnósticos con las herramientas locales actuales. El estado del repositorio, los borradores de comandos y la coordinación con la Action corresponden al hito de integración enlazado.',
        setupIntro: 'Prepara preferencias del navegador, perfiles y copias con las herramientas locales actuales. La configuración compartida del repositorio usará el motor descrito en el plan de implementación enlazado.',
        workDependency: 'Las colas de trabajo y las vistas de atención de GitHub corresponden al hito de gestión de trabajo enlazado.',
        privacyTools: 'Elige el ámbito de privacidad', privacyScope: 'Las respuestas temporales de la API, las credenciales de conexión y la pausa global tienen controles independientes. Revisa su ámbito antes de hacer un cambio.',
    },
    fr: {
        locale: 'fr',
        workIntro: 'Votre espace local enregistré. Ouvrez les guides de fonctions, les profils sélectionnés et les groupes de dépôts de ce navigateur.',
        favorites: 'Guides de fonctions favoris', emptyFavorites: 'Choisissez des favoris dans Fonctions pour retrouver leurs guides ici.',
        profiles: 'Sélections de profils enregistrées', emptyProfiles: 'Aucun profil n’est sélectionné. Consultez les préférences globales ou choisissez des profils pour leur périmètre correspondant.',
        groups: 'Groupes de dépôts enregistrés', emptyGroups: 'Créez un groupe local pour organiser les références de connexion enregistrées.',
        savedScope: 'Il s’agit de choix enregistrés. Vérifiez leur périmètre applicable et les connexions disponibles dans Profils et les groupes de dépôts.',
        references: 'Références enregistrées', selected: 'Groupe local sélectionné', tools: 'Outils locaux actuels',
        attentionIntro: 'Examinez les choix enregistrés qui peuvent expliquer une fonction en pause ou un accueil inachevé.',
        emptyAttention: 'Aucun élément de révision locale ne correspond à cette révision enregistrée.',
        notInspected: 'Consultez les tâches GitHub, les autorisations et la connexion dans leurs outils respectifs. Cette liste décrit les préférences locales enregistrées.',
        globalPause: 'Une pause globale est enregistrée.', onboarding: 'L’accueil local peut être repris.',
        profilePause: 'Ce profil sélectionné enregistre une pause. Vérifiez quand son périmètre s’applique.',
        current: 'Guide de fonction en développement', later: 'Capacité prévue', roadmap: 'Voir le plan de réalisation', guides: 'Guides des capacités prévues',
        copilotIntro: 'Préparez les connexions, les accès et les diagnostics avec les outils locaux actuels. L’état du dépôt, les brouillons de commandes et le relais vers l’Action relèvent du jalon d’intégration lié.',
        setupIntro: 'Préparez les préférences du navigateur, les profils et les sauvegardes avec les outils locaux actuels. La configuration partagée du dépôt utilisera le moteur décrit dans le plan de réalisation lié.',
        workDependency: 'Les files de travail et les vues d’attention GitHub relèvent du jalon de gestion du travail lié.',
        privacyTools: 'Choisissez le périmètre de confidentialité', privacyScope: 'Les réponses API temporaires, les identifiants de connexion et la pause globale ont des contrôles indépendants. Vérifiez leur périmètre avant toute modification.',
    },
    pt: {
        locale: 'pt',
        workIntro: 'O seu espaço local guardado. Abra guias de funções, perfis selecionados e grupos de repositórios deste navegador.',
        favorites: 'Guias de funções favoritas', emptyFavorites: 'Escolha favoritos em Funções para encontrar os seus guias aqui.',
        profiles: 'Seleções de perfis guardadas', emptyProfiles: 'Nenhum perfil está selecionado. Reveja as preferências globais ou escolha perfis para o âmbito correspondente.',
        groups: 'Grupos de repositórios guardados', emptyGroups: 'Crie um grupo local para organizar referências de ligação guardadas.',
        savedScope: 'Estas são escolhas guardadas. Reveja o âmbito aplicável e as ligações disponíveis em Perfis e nos grupos de repositórios.',
        references: 'Referências guardadas', selected: 'Grupo local selecionado', tools: 'Ferramentas locais atuais',
        attentionIntro: 'Reveja escolhas guardadas que podem explicar funções em pausa ou uma introdução por concluir.',
        emptyAttention: 'Não existem itens de revisão local correspondentes nesta revisão guardada.',
        notInspected: 'Consulte tarefas do GitHub, permissões e estado da ligação nas ferramentas correspondentes. Esta lista descreve preferências locais guardadas.',
        globalPause: 'Existe uma pausa global guardada.', onboarding: 'Pode retomar a introdução local.',
        profilePause: 'Este perfil selecionado guarda uma pausa. Reveja quando o seu âmbito se aplica.',
        current: 'Guia de função em desenvolvimento', later: 'Capacidade prevista', roadmap: 'Ver plano de implementação', guides: 'Guias de capacidades previstas',
        copilotIntro: 'Prepare ligações, acesso e diagnósticos com as ferramentas locais atuais. O estado do repositório, rascunhos de comandos e a coordenação com a Action pertencem ao marco de integração ligado.',
        setupIntro: 'Prepare preferências do navegador, perfis e cópias com as ferramentas locais atuais. A configuração partilhada do repositório usará o motor descrito no plano de implementação ligado.',
        workDependency: 'As filas de trabalho e vistas de atenção do GitHub pertencem ao marco de gestão de trabalho ligado.',
        privacyTools: 'Escolha o âmbito de privacidade', privacyScope: 'As respostas temporárias da API, as credenciais de ligação e a pausa global têm controlos independentes. Reveja o âmbito antes de fazer uma alteração.',
    },
});
export function navigationCopy(locale: string): NavigationCopy { return copies[locale === 'es' || locale === 'fr' || locale === 'pt' ? locale : 'en']; }
