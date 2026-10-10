import type { SetupQuestion } from '../../domain/setup_questionnaire';
import { spanishQuestionLabel } from './setup_question_translations';
import { questionLabelsFr } from './setup_question_labels/fr';
import { questionLabelsPt } from './setup_question_labels/pt';

export const questionLabelsFrPt = { fr: questionLabelsFr, pt: questionLabelsPt } as const;

const roleNames = {
  fr: { planner: 'Planification', findings: 'Résultats', reviewer: 'Revue', fixer: 'Correction', tester: 'Tests' },
  pt: { planner: 'Planeamento', findings: 'Resultados', reviewer: 'Revisão', fixer: 'Correção', tester: 'Testes' },
} as const;

export function translatedQuestionLabel(question: SetupQuestion, locale: 'en' | 'es' | 'fr' | 'pt'): string {
  if (locale === 'en') return question.label.replace(' (Space toggles, Enter confirms)', '');
  if (locale === 'es') return spanishQuestionLabel(question);
  const exact = questionLabelsFrPt[locale][question.id];
  if (exact) return exact;
  const agent = question.id.match(/^agents\.(planner|findings|reviewer|fixer|tester)\.(provider|modelProvider|model|effort|executable)$/u);
  if (agent) {
    const fields = {
      fr: { provider: 'agent CLI', modelProvider: 'fournisseur du modèle', model: 'modèle', effort: 'effort de raisonnement', executable: 'commande exécutable' },
      pt: { provider: 'agente CLI', modelProvider: 'fornecedor do modelo', model: 'modelo', effort: 'esforço de raciocínio', executable: 'comando executável' },
    } as const;
    return `${roleNames[locale][agent[1] as keyof typeof roleNames.fr]} : ${fields[locale][agent[2] as keyof typeof fields.fr]}`;
  }
  const storage = question.id.match(/^storage\.(variables|secrets)\.(defaultScope|organizationVisibility|preserveExisting|overrides)$/u);
  if (storage) {
    const resources = { fr: { variables: 'Variables', secrets: 'Secrets' }, pt: { variables: 'Variables', secrets: 'Secrets' } } as const;
    const fields = {
      fr: { defaultScope: 'périmètre par défaut', organizationVisibility: 'visibilité dans l’organisation', preserveExisting: 'conserver les ressources existantes', overrides: 'exceptions de périmètre' },
      pt: { defaultScope: 'âmbito predefinido', organizationVisibility: 'visibilidade na organização', preserveExisting: 'conservar recursos existentes', overrides: 'exceções de âmbito' },
    } as const;
    return `${resources[locale][storage[1] as 'variables' | 'secrets']} : ${fields[locale][storage[2] as keyof typeof fields.fr]}`;
  }
  return question.label;
}
