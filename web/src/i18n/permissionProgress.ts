import type { WebSetupView } from '../../../src/application/contracts/web_setup_view';
import type { SetupLocale } from './catalog';

type SetupTokenPermissionProbePhase = NonNullable<NonNullable<NonNullable<WebSetupView['permissions']>['progress']>[number]>['phase'];

const copy: Record<SetupLocale, Record<SetupTokenPermissionProbePhase | 'title' | 'lead' | 'pending', string>> = {
  en: { title: 'Checking PAT access', lead: 'Each permission is checked separately. Temporary test resources are removed after verification.', pending: 'Waiting', checking: 'Checking read access', creating: 'Creating temporary resource', reading: 'Reading temporary resource', deleting: 'Removing temporary resource', verified: 'Verified', failed: 'Needs attention', skipped: 'Checked after plan approval if required' },
  es: { title: 'Comprobando el acceso del PAT', lead: 'Cada permiso se comprueba por separado. Los recursos temporales se eliminan tras verificarlos.', pending: 'Pendiente', checking: 'Comprobando lectura', creating: 'Creando recurso temporal', reading: 'Leyendo recurso temporal', deleting: 'Eliminando recurso temporal', verified: 'Verificado', failed: 'Requiere atención', skipped: 'Se comprobará tras aprobar el plan si es necesario' },
  fr: { title: 'Vérification des accès du PAT', lead: 'Chaque permission est vérifiée séparément. Les ressources temporaires sont supprimées après vérification.', pending: 'En attente', checking: 'Vérification de la lecture', creating: 'Création d’une ressource temporaire', reading: 'Lecture de la ressource temporaire', deleting: 'Suppression de la ressource temporaire', verified: 'Vérifié', failed: 'Intervention nécessaire', skipped: 'Vérifiée après approbation du plan si nécessaire' },
  pt: { title: 'A verificar o acesso do PAT', lead: 'Cada permissão é verificada separadamente. Os recursos temporários são removidos após a verificação.', pending: 'Pendente', checking: 'A verificar a leitura', creating: 'A criar recurso temporário', reading: 'A ler recurso temporário', deleting: 'A remover recurso temporário', verified: 'Verificado', failed: 'Requer atenção', skipped: 'Verificada após a aprovação do plano se necessário' },
};

export function permissionProgressCopy(locale: SetupLocale, key: keyof typeof copy.en): string {
  return copy[locale][key];
}

const errors: Record<SetupLocale, Record<'unavailable' | 'cleanup-pending' | 'secret-collision' | 'unsupported', string>> = {
  en: { unavailable: 'The check did not complete. Review the terminal result.', 'cleanup-pending': 'Cleanup is unresolved; recovery is required before retrying.', 'secret-collision': 'GitHub reported an existing Secret at the random test name. Setup stopped; inspect the GitHub Secret audit trail.', unsupported: 'No isolated probe exists for this permission yet.' },
  es: { unavailable: 'La comprobación no terminó. Revisa el resultado en el terminal.', 'cleanup-pending': 'La limpieza está pendiente; hay que recuperarla antes de reintentar.', 'secret-collision': 'GitHub encontró un Secret existente con el nombre aleatorio de prueba. El setup se detuvo; revisa el historial del Secret.', unsupported: 'Aún no hay una prueba aislada para este permiso.' },
  fr: { unavailable: 'La vérification n’a pas abouti. Consultez le résultat dans le terminal.', 'cleanup-pending': 'Le nettoyage reste à terminer avant de réessayer.', 'secret-collision': 'GitHub a trouvé un Secret existant sous le nom de test aléatoire. La configuration s’est arrêtée ; consultez l’historique du Secret.', unsupported: 'Aucun test isolé n’existe encore pour cette permission.' },
  pt: { unavailable: 'A verificação não terminou. Consulte o resultado no terminal.', 'cleanup-pending': 'A limpeza está pendente; é necessária recuperação antes de tentar novamente.', 'secret-collision': 'O GitHub encontrou um Secret existente com o nome aleatório de teste. A configuração parou; consulte o histórico do Secret.', unsupported: 'Ainda não existe um teste isolado para esta permissão.' },
};

const issueResidue: Record<SetupLocale, { closed: (number: string) => string; unresolved: (number: string) => string }> = {
  en: { closed: number => `Temporary Issue #${number} was closed but could not be deleted. Remove it in GitHub before retrying.`, unresolved: number => `Temporary Issue #${number} could not be deleted or confirmed closed. Inspect it in GitHub before retrying.` },
  es: { closed: number => `El Issue temporal #${number} se cerró, pero no se pudo borrar. Elimínalo en GitHub antes de reintentar.`, unresolved: number => `No se pudo borrar ni confirmar el cierre del Issue temporal #${number}. Revísalo en GitHub antes de reintentar.` },
  fr: { closed: number => `L’Issue temporaire n° ${number} a été fermée mais n’a pas pu être supprimée. Supprimez-la dans GitHub avant de réessayer.`, unresolved: number => `La suppression et la fermeture de l’Issue temporaire n° ${number} n’ont pas pu être confirmées. Vérifiez-la dans GitHub avant de réessayer.` },
  pt: { closed: number => `A Issue temporária n.º ${number} foi fechada, mas não pôde ser eliminada. Elimine-a no GitHub antes de tentar novamente.`, unresolved: number => `Não foi possível eliminar nem confirmar o fecho da Issue temporária n.º ${number}. Verifique-a no GitHub antes de tentar novamente.` },
};

export function permissionProgressError(locale: SetupLocale, detail: string): string {
  const issue = /^issue-(closed|unresolved)-([1-9][0-9]*)$/u.exec(detail);
  if (issue) return issueResidue[locale][issue[1] as 'closed' | 'unresolved'](issue[2]);
  if (/^http-[1-5][0-9]{2}$/u.test(detail)) return `GitHub HTTP ${detail.slice(5)}`;
  if (detail === 'unavailable' || detail === 'cleanup-pending' || detail === 'secret-collision' || detail === 'unsupported') return errors[locale][detail];
  return errors[locale].unavailable;
}
