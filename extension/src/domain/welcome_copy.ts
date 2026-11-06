import type { CenterLocale } from './center_copy_types.ts';
import type { WelcomeStage } from './welcome.ts';
import { deepFreeze } from './value.ts';

export interface WelcomeCopy {
    readonly steps: Readonly<Record<WelcomeStage, string>>;
    readonly guidance: Readonly<Record<WelcomeStage, string>>;
    readonly progress: string; readonly navigation: string; readonly resume: string; readonly advance: string; readonly finish: string;
    readonly restart: string; readonly boundary: string; readonly previewHint: string; readonly selected: string; readonly empty: string;
    readonly profileMeaning: string; readonly profileLink: string; readonly permissionLink: string; readonly appearance: string; readonly language: string;
    readonly features: string; readonly overview: string; readonly help: string; readonly guide: string;
}
const copies: Readonly<Record<CenterLocale, WelcomeCopy>> = deepFreeze({
    en: {
        steps: { welcome: 'Discover local settings', profile: 'Understand selected profiles', permissions: 'Understand browser access', complete: 'Welcome complete' },
        guidance: { welcome: 'Make GitHub work your way. Explore all features, appearance and language. The center works locally; connecting an account is optional.',
            profile: 'Profiles group your preferences. Explore the selected local profiles below or open Profiles to create or review a selection.',
            permissions: 'Browser access and GitHub identity are separate. Open Privacy to inspect current native grants and Connections for optional account access. This step requests neither.',
            complete: 'You can return to any step or continue to the overview. Only the saved progress above records completion; exploring this step does not save it.' },
        progress: 'Saved welcome progress', navigation: 'Explore welcome steps', resume: 'Return to saved step', advance: 'Review progress to next step', finish: 'Review welcome completion',
        restart: 'Review welcome restart', boundary: 'Welcome progress does not grant access, change profiles or certify feature readiness. No account is required to complete it.',
        previewHint: 'Review and confirm each saved progress change. Cancel keeps your previous step; closing and reopening resumes the last committed step.',
        selected: 'Selected local profiles', empty: 'No local profile is selected. You can keep the default preferences.',
        profileMeaning: 'These are local preference selections, not verified current account access. Scoped profiles apply only when their verified context matches. Changing the selection requires its own review.',
        profileLink: 'Manage profiles', permissionLink: 'Inspect permissions and privacy', appearance: 'Choose appearance', language: 'Choose language',
        features: 'Explore all features', overview: 'Continue to overview', help: 'Open help and recovery', guide: 'Welcome and recovery guide',
    },
    es: {
        steps: { welcome: 'Descubrir los ajustes locales', profile: 'Entender los perfiles seleccionados', permissions: 'Entender el acceso del navegador', complete: 'Bienvenida terminada' },
        guidance: { welcome: 'Adapta GitHub a tu forma de trabajar. Explora las funciones, la apariencia y el idioma. El centro funciona en local; conectar una cuenta es opcional.',
            profile: 'Los perfiles agrupan tus preferencias. Consulta los perfiles locales seleccionados o abre Perfiles para crear o revisar una selección.',
            permissions: 'El acceso del navegador y la identidad de GitHub son independientes. Abre Privacidad para consultar los permisos nativos y Conexiones para el acceso opcional a una cuenta. Este paso no solicita ninguno.',
            complete: 'Puedes volver a cualquier paso o continuar al resumen. Solo el progreso guardado que aparece arriba registra la finalización; consultar este paso no la guarda.' },
        progress: 'Progreso guardado de bienvenida', navigation: 'Explorar pasos de bienvenida', resume: 'Volver al paso guardado', advance: 'Revisar avance al siguiente paso', finish: 'Revisar finalización de bienvenida',
        restart: 'Revisar reinicio de bienvenida', boundary: 'El progreso de bienvenida no concede acceso, cambia perfiles ni acredita que las funciones estén listas. No requiere una cuenta para terminar.',
        previewHint: 'Revisa y confirma cada cambio de progreso guardado. Cancelar conserva el paso anterior; cerrar y volver a abrir retoma el último paso confirmado.',
        selected: 'Perfiles locales seleccionados', empty: 'No hay ningún perfil local seleccionado. Puedes mantener las preferencias predeterminadas.',
        profileMeaning: 'Son selecciones locales de preferencias, no un acceso actual a una cuenta verificado. Los perfiles con ámbito solo se aplican si coincide su contexto verificado. Cambiar la selección requiere su propia revisión.',
        profileLink: 'Gestionar perfiles', permissionLink: 'Consultar permisos y privacidad', appearance: 'Elegir apariencia', language: 'Elegir idioma',
        features: 'Explorar todas las funciones', overview: 'Continuar al resumen', help: 'Abrir ayuda y recuperación', guide: 'Guía de bienvenida y recuperación',
    },
    fr: {
        steps: { welcome: 'Découvrir les réglages locaux', profile: 'Comprendre les profils sélectionnés', permissions: 'Comprendre les accès du navigateur', complete: 'Accueil terminé' },
        guidance: { welcome: 'Adaptez GitHub à votre façon de travailler. Explorez les fonctions, l’apparence et la langue. Le centre fonctionne localement ; connecter un compte est facultatif.',
            profile: 'Les profils regroupent vos préférences. Consultez les profils locaux sélectionnés ou ouvrez Profils pour créer ou vérifier une sélection.',
            permissions: 'Les accès du navigateur et l’identité GitHub sont distincts. Ouvrez Confidentialité pour consulter les permissions natives, et Connexions pour l’accès facultatif à un compte. Cette étape ne demande aucun des deux.',
            complete: 'Vous pouvez revoir chaque étape ou poursuivre vers la vue d’ensemble. Seule la progression enregistrée ci-dessus indique la fin ; consulter cette étape ne l’enregistre pas.' },
        progress: 'Progression d’accueil enregistrée', navigation: 'Explorer les étapes d’accueil', resume: 'Revenir à l’étape enregistrée', advance: 'Vérifier le passage à l’étape suivante', finish: 'Vérifier la fin de l’accueil',
        restart: 'Vérifier le redémarrage de l’accueil', boundary: 'La progression d’accueil n’accorde aucun accès, ne change aucun profil et ne certifie pas les fonctions. Aucun compte n’est requis pour terminer.',
        previewHint: 'Vérifiez et confirmez chaque progression enregistrée. Annuler conserve l’étape précédente ; rouvrir reprend la dernière étape confirmée.',
        selected: 'Profils locaux sélectionnés', empty: 'Aucun profil local n’est sélectionné. Vous pouvez conserver les préférences par défaut.',
        profileMeaning: 'Ce sont des sélections locales de préférences, pas un accès de compte actuel vérifié. Les profils limités ne s’appliquent que si le contexte vérifié correspond. Toute nouvelle sélection exige sa propre vérification.',
        profileLink: 'Gérer les profils', permissionLink: 'Consulter permissions et confidentialité', appearance: 'Choisir l’apparence', language: 'Choisir la langue',
        features: 'Explorer toutes les fonctions', overview: 'Poursuivre vers la vue d’ensemble', help: 'Ouvrir aide et récupération', guide: 'Guide d’accueil et de récupération',
    },
    pt: {
        steps: { welcome: 'Descobrir os ajustes locais', profile: 'Compreender os perfis selecionados', permissions: 'Compreender o acesso do navegador', complete: 'Boas-vindas concluídas' },
        guidance: { welcome: 'Adapte o GitHub à sua forma de trabalhar. Explore as funções, a aparência e o idioma. O centro funciona localmente; ligar uma conta é opcional.',
            profile: 'Os perfis agrupam preferências. Consulte os perfis locais selecionados ou abra Perfis para criar ou rever uma seleção.',
            permissions: 'O acesso do navegador e a identidade do GitHub são independentes. Abra Privacidade para consultar permissões nativas e Ligações para o acesso opcional a uma conta. Este passo não solicita nenhum.',
            complete: 'Pode voltar a qualquer passo ou continuar para o resumo. Só o progresso guardado acima regista a conclusão; consultar este passo não a guarda.' },
        progress: 'Progresso de boas-vindas guardado', navigation: 'Explorar passos de boas-vindas', resume: 'Voltar ao passo guardado', advance: 'Rever avanço para o próximo passo', finish: 'Rever conclusão das boas-vindas',
        restart: 'Rever reinício das boas-vindas', boundary: 'O progresso de boas-vindas não concede acesso, altera perfis nem certifica as funções. Não é necessária uma conta para concluir.',
        previewHint: 'Reveja e confirme cada alteração de progresso guardado. Cancelar preserva o passo anterior; fechar e reabrir retoma o último passo confirmado.',
        selected: 'Perfis locais selecionados', empty: 'Nenhum perfil local está selecionado. Pode manter as preferências predefinidas.',
        profileMeaning: 'São seleções locais de preferências, não acesso atual verificado a uma conta. Os perfis com âmbito só se aplicam se o contexto verificado corresponder. Alterar a seleção exige a sua própria revisão.',
        profileLink: 'Gerir perfis', permissionLink: 'Consultar permissões e privacidade', appearance: 'Escolher aparência', language: 'Escolher idioma',
        features: 'Explorar todas as funções', overview: 'Continuar para o resumo', help: 'Abrir ajuda e recuperação', guide: 'Guia de boas-vindas e recuperação',
    },
});
export function welcomeCopy(locale: CenterLocale): WelcomeCopy { return copies[locale]; }
