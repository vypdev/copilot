import type { SetupLocale } from './catalog';

const labels: Record<SetupLocale, Record<string, string>> = {
  en: { success: 'Passed', failure: 'Failed', cancelled: 'Cancelled', neutral: 'Neutral', skipped: 'Skipped', timed_out: 'Timed out', action_required: 'Action required', unknown: 'Unknown outcome' },
  es: { success: 'Correcto', failure: 'Falló', cancelled: 'Cancelado', neutral: 'Neutral', skipped: 'Omitido', timed_out: 'Agotó el tiempo', action_required: 'Requiere intervención', unknown: 'Resultado desconocido' },
  fr: { success: 'Réussi', failure: 'Échoué', cancelled: 'Annulé', neutral: 'Neutre', skipped: 'Ignoré', timed_out: 'Délai dépassé', action_required: 'Action nécessaire', unknown: 'Résultat inconnu' },
  pt: { success: 'Concluído', failure: 'Falhou', cancelled: 'Cancelado', neutral: 'Neutro', skipped: 'Ignorado', timed_out: 'Tempo esgotado', action_required: 'Ação necessária', unknown: 'Resultado desconhecido' },
};

export function checkConclusionLabel(value: string, locale: SetupLocale): string {
  return labels[locale][value] ?? labels[locale].unknown;
}
