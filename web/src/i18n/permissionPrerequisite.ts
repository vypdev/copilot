import type { SetupLocale } from './catalog';

const copy = {
  en: {
    'contents-write': 'Actions was not tested because its temporary branch could not be created. Check repository Contents Write, repository selection and organization authorization.',
    'contents-workflows-write': 'Actions was not tested because its temporary workflow could not be written. Check repository Contents and Workflows Write, repository selection and organization authorization. Unverifiable does not mean Actions is missing.',
    'dispatch-workflow': 'Actions was not tested because no active workflow_dispatch workflow was found on the default branch. Install an eligible workflow before retrying.',
  },
  es: {
    'contents-write': 'No se comprobó Actions porque no se pudo crear su rama temporal. Revisa Contents Write del repositorio, la selección del repositorio y la autorización de la organización.',
    'contents-workflows-write': 'No se comprobó Actions porque no se pudo escribir su workflow temporal. Revisa Contents y Workflows Write del repositorio, la selección del repositorio y la autorización de la organización. No verificable no significa que falte Actions.',
    'dispatch-workflow': 'No se comprobó Actions porque no se encontró un workflow activo con workflow_dispatch en la rama predeterminada. Instala uno antes de reintentar.',
  },
  fr: {
    'contents-write': 'Actions n’a pas été testé car sa branche temporaire n’a pas pu être créée. Vérifiez Contents Write du dépôt, la sélection du dépôt et l’autorisation de l’organisation.',
    'contents-workflows-write': 'Actions n’a pas été testé car son workflow temporaire n’a pas pu être écrit. Vérifiez Contents et Workflows Write du dépôt, la sélection du dépôt et l’autorisation de l’organisation. Non vérifiable ne signifie pas qu’Actions manque.',
    'dispatch-workflow': 'Actions n’a pas été testé car aucun workflow actif avec workflow_dispatch n’a été trouvé sur la branche par défaut. Installez-en un avant de réessayer.',
  },
  pt: {
    'contents-write': 'Actions não foi testado porque não foi possível criar a sua branch temporária. Verifique Contents Write do repositório, a seleção do repositório e a autorização da organização.',
    'contents-workflows-write': 'Actions não foi testado porque não foi possível escrever o seu workflow temporário. Verifique Contents e Workflows Write do repositório, a seleção do repositório e a autorização da organização. Não verificável não significa que falte Actions.',
    'dispatch-workflow': 'Actions não foi testado porque não foi encontrado um workflow ativo com workflow_dispatch na branch predefinida. Instale um antes de tentar novamente.',
  },
} satisfies Record<SetupLocale, Record<string, string>>;

/** Only fixed semantic codes select copy; provider prose cannot reach this surface. */
export function permissionPrerequisite(value: unknown, locale: SetupLocale): string | undefined {
  if (value === 'contents-write' || value === 'contents-workflows-write' || value === 'dispatch-workflow') {
    return copy[locale][value];
  }
  return undefined;
}
