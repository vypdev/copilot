import type { CenterLocale } from './center_copy_types.ts';
import { deepFreeze } from './value.ts';
export interface ShortcutsCopy {
    readonly intro: string; readonly enabled: string; readonly assignment: string; readonly unassigned: string;
    readonly invalid: string; readonly reset: string; readonly scope: string; readonly native: string;
    readonly protected: string; readonly testing: string; readonly guide: string;
    readonly opening: string; readonly opened: string; readonly unknown: string; readonly conflict: string; readonly unavailable: string;
    readonly conflictHeading: string;
    readonly physical: string;
}
const copies: Readonly<Record<CenterLocale, ShortcutsCopy>> = deepFreeze({
    en: {
        conflictHeading: 'Native conflict checks',
        physical: 'Letters identify physical positions on a US QWERTY keyboard, shown below. They do not identify the printed character on every layout. This keeps Option combinations usable without reading your keyboard layout.',
        intro: 'Configure four local navigation commands. Changes take effect only after review and confirmation.',
        enabled: 'Enable shortcuts globally', assignment: 'Assigned combination', unassigned: 'Unassigned',
        invalid: 'Choose a different combination for each command. Only the listed Alt+Shift letters are supported.', reset: 'Clear assignments in this draft',
        scope: 'These assignments work on eligible GitHub pages. The current profile, feature preference and pause can still disable shortcuts. They are not global OS hotkeys.',
        native: 'Local duplicate checks do not establish freedom from browser, system or other-extension conflicts. A page access-key collision blocks execution. Other native interception may be unobservable.',
        protected: 'Typing, focused controls, password and login contexts, composition, synthetic events and held keys do not trigger these commands. Leave focus on the page background or its nonediting main region.',
        testing: 'After saving, test on an eligible GitHub page outside an editor. Use the displayed US key position with Alt+Shift (Option on macOS). If no command arrives, native delivery is unknown; keep the toolbar/options entrypoint and choose another assignment. Never test in a credential field.',
        guide: 'Read shortcut and native-conflict guidance', opening: 'Shortcut received. Opening the local control center…',
        opened: 'The local control center opened in another tab.', unknown: 'Opening could not be confirmed. Inspect existing tabs before trying again.',
        conflict: 'This combination matches a page access key. It was not intercepted; choose another assignment in Shortcuts.',
        unavailable: 'The page access-key check is unavailable or exceeds its inspection limit. The shortcut was not intercepted.',
    },
    es: {
        conflictHeading: 'Comprobación de conflictos nativos',
        physical: 'Las letras identifican posiciones físicas del teclado QWERTY estadounidense mostrado debajo. No representan el carácter impreso de todas las distribuciones. Así se pueden usar combinaciones con Opción sin leer tu distribución del teclado.',
        intro: 'Configura cuatro órdenes de navegación local. Los cambios se aplican después de revisarlos y confirmarlos.',
        enabled: 'Activar atajos globalmente', assignment: 'Combinación asignada', unassigned: 'Sin asignar',
        invalid: 'Elige una combinación distinta por orden. Solo se admiten las letras Alt+Mayús de la lista.', reset: 'Borrar asignaciones de este borrador',
        scope: 'Estas asignaciones funcionan en páginas de GitHub aptas. El perfil actual, la preferencia de la función y la pausa pueden desactivar los atajos. No son atajos globales del sistema.',
        native: 'Comprobar duplicados locales no demuestra la ausencia de conflictos con el navegador, el sistema u otras extensiones. Una tecla de acceso de la página bloquea la ejecución. Otras interceptaciones nativas pueden no ser observables.',
        protected: 'Escribir, los controles con foco, las contraseñas y el inicio de sesión, la composición, los eventos sintéticos y las teclas mantenidas no activan estas órdenes. Deja el foco en el fondo de la página o en su región principal sin edición.',
        testing: 'Tras guardar, prueba en una página de GitHub apta fuera de un editor. Usa la posición estadounidense indicada con Alt+Mayús (Opción en macOS). Si no llega la orden, la entrega nativa es desconocida; conserva el acceso desde la barra o las opciones y elige otra asignación. No pruebes en un campo de credenciales.',
        guide: 'Leer ayuda sobre atajos y conflictos nativos', opening: 'Atajo recibido. Abriendo el centro de control local…',
        opened: 'El centro de control local se ha abierto en otra pestaña.', unknown: 'No se ha podido confirmar la apertura. Comprueba las pestañas existentes antes de reintentar.',
        conflict: 'Esta combinación coincide con una tecla de acceso de la página. No se ha interceptado; elige otra asignación en Atajos.',
        unavailable: 'La comprobación de teclas de acceso no está disponible o supera su límite. No se ha interceptado el atajo.',
    },
    fr: {
        conflictHeading: 'Vérification des conflits natifs',
        physical: 'Les lettres indiquent les positions physiques du clavier QWERTY américain ci-dessous, pas le caractère imprimé de chaque disposition. Les combinaisons Option restent ainsi utilisables sans lire votre disposition de clavier.',
        intro: 'Configurez quatre commandes de navigation locale. Les changements prennent effet après examen et confirmation.',
        enabled: 'Activer les raccourcis globalement', assignment: 'Combinaison attribuée', unassigned: 'Non attribuée',
        invalid: 'Choisissez une combinaison différente par commande. Seules les lettres Alt+Maj de la liste sont prises en charge.', reset: 'Effacer les attributions de ce brouillon',
        scope: 'Ces combinaisons fonctionnent sur les pages GitHub admissibles. Le profil, la préférence de fonction et la pause peuvent désactiver les raccourcis. Ce ne sont pas des raccourcis globaux du système.',
        native: 'La vérification des doublons locaux ne garantit pas l’absence de conflits avec le navigateur, le système ou une autre extension. Une touche d’accès de la page bloque l’exécution. Les autres interceptions natives peuvent rester inobservables.',
        protected: 'La saisie, les contrôles ayant le focus, les mots de passe et connexions, la composition, les événements synthétiques et les touches maintenues ne déclenchent pas ces commandes. Placez le focus sur le fond de la page ou sa zone principale non modifiable.',
        testing: 'Après enregistrement, testez sur une page GitHub admissible hors éditeur. Utilisez la position américaine indiquée avec Alt+Maj (Option sur macOS). Sans commande reçue, la réception native reste inconnue ; gardez l’accès par la barre ou les options et choisissez une autre attribution. Ne testez jamais dans un champ d’identification.',
        guide: 'Lire l’aide sur les raccourcis et conflits natifs', opening: 'Raccourci reçu. Ouverture du centre de contrôle local…',
        opened: 'Le centre de contrôle local est ouvert dans un autre onglet.', unknown: 'L’ouverture n’a pas pu être confirmée. Vérifiez les onglets existants avant de réessayer.',
        conflict: 'Cette combinaison correspond à une touche d’accès de la page. Elle n’a pas été interceptée ; choisissez une autre attribution dans Raccourcis.',
        unavailable: 'La vérification des touches d’accès est indisponible ou dépasse sa limite. Le raccourci n’a pas été intercepté.',
    },
    pt: {
        conflictHeading: 'Verificação de conflitos nativos',
        physical: 'As letras identificam posições físicas do teclado QWERTY americano apresentado abaixo, não o caráter impresso de todas as disposições. Assim, as combinações Option continuam utilizáveis sem ler a disposição do teclado.',
        intro: 'Configure quatro comandos de navegação local. As alterações só são aplicadas após revisão e confirmação.',
        enabled: 'Ativar atalhos globalmente', assignment: 'Combinação atribuída', unassigned: 'Sem atribuição',
        invalid: 'Escolha uma combinação diferente por comando. Só são suportadas as letras Alt+Shift da lista.', reset: 'Limpar atribuições deste rascunho',
        scope: 'Estas combinações funcionam em páginas GitHub elegíveis. O perfil, a preferência da função e a pausa podem desativar os atalhos. Não são atalhos globais do sistema.',
        native: 'A verificação de duplicados locais não garante ausência de conflitos com o navegador, o sistema ou outras extensões. Uma tecla de acesso da página bloqueia a execução. Outras interceções nativas podem não ser observáveis.',
        protected: 'Escrita, controlos com foco, palavras-passe e autenticação, composição, eventos sintéticos e teclas mantidas não ativam estes comandos. Deixe o foco no fundo da página ou na região principal sem edição.',
        testing: 'Após guardar, teste numa página GitHub elegível fora de um editor. Use a posição americana indicada com Alt+Shift (Option no macOS). Se o comando não chegar, a receção nativa é desconhecida; mantenha o acesso pela barra ou opções e escolha outra atribuição. Nunca teste num campo de credenciais.',
        guide: 'Ler ajuda sobre atalhos e conflitos nativos', opening: 'Atalho recebido. A abrir o centro de controlo local…',
        opened: 'O centro de controlo local abriu noutro separador.', unknown: 'Não foi possível confirmar a abertura. Verifique os separadores existentes antes de tentar novamente.',
        conflict: 'Esta combinação corresponde a uma tecla de acesso da página. Não foi intercetada; escolha outra atribuição em Atalhos.',
        unavailable: 'A verificação de teclas de acesso está indisponível ou excede o limite. O atalho não foi intercetado.',
    },
});
export function shortcutsCopy(locale: CenterLocale): ShortcutsCopy { return copies[locale]; }
