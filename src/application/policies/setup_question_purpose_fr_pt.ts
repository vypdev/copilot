import type { SetupQuestion } from '../../domain/setup_questionnaire';
import { purposesFr } from './setup_question_purpose/fr';
import { purposesPt } from './setup_question_purpose/pt';

export const purposesFrPt = { fr: purposesFr, pt: purposesPt } as const;

export function setupQuestionPurposeFrPt(question: SetupQuestion, locale: 'fr' | 'pt'): string | undefined {
  const exact = purposesFrPt[locale][question.id];
  if (exact) return exact;
  if (question.id.startsWith('features.')) return locale === 'fr'
    ? 'Activez ou désactivez cette fonction. Si vous la désactivez, cette configuration n’installera ni son automatisation ni ses autorisations conditionnelles.'
    : 'Ative ou desative esta função. Se a desativar, esta configuração não instalará a automatização nem pedirá as permissões condicionais correspondentes.';
  if (/^agents\.[^.]+\.provider$/u.test(question.id)) return locale === 'fr'
    ? 'Choisissez l’agent CLI de cette tâche dans GitHub Actions ; ce fournisseur détermine la commande et les identifiants du runner.'
    : 'Escolha o agente CLI desta tarefa no GitHub Actions; o fornecedor determina o comando e as credenciais do runner.';
  const setting = question.id.match(/^agents\.[^.]+\.(modelProvider|model|effort|executable)$/u)?.[1];
  if (setting) {
    const fields = {
      fr: { modelProvider: 'le service fournissant le modèle et ses identifiants', model: 'le nom exact du modèle autorisé par le fournisseur', effort: 'l’effort de raisonnement (ou vide pour la valeur du fournisseur)', executable: 'la commande présente sur le runner GitHub Actions, pas sur cet ordinateur' },
      pt: { modelProvider: 'o serviço que fornece o modelo e as suas credenciais', model: 'o nome exato do modelo permitido pelo fornecedor', effort: 'o esforço de raciocínio (ou vazio para usar a predefinição do fornecedor)', executable: 'o comando disponível no runner GitHub Actions, não neste computador' },
    } as const;
    const scope = question.stateId === 'agent-model-defaults'
      ? (locale === 'fr' ? 'pour toutes les tâches actives' : 'para todas as tarefas ativas')
      : (locale === 'fr' ? 'pour cette tâche' : 'para esta tarefa');
    return `${locale === 'fr' ? 'Définissez' : 'Defina'} ${fields[locale][setting as keyof typeof fields.fr]} ${scope}.`;
  }
  if (/^repository\.(feature|bugfix|hotfix|release|docs|chore|reconciliation)Tree$/u.test(question.id)) return locale === 'fr'
    ? 'Définissez le préfixe des branches créées par Copilot pour ce type de travail ; il doit suivre votre convention de nommage.'
    : 'Defina o prefixo dos ramos criados pelo Copilot para este tipo de trabalho; deve seguir as suas regras de nomes.';
  if (/^projects\.(issue|pullRequest)(Created|InProgress)Column$/u.test(question.id)) return locale === 'fr'
    ? 'Choisissez la valeur du champ Status appliquée à la création ou au début du travail ; ce n’est pas le nom d’une colonne visuelle.'
    : 'Escolha o valor do campo Status aplicado na criação ou no início do trabalho; não é o nome de uma coluna visual.';
  const storage = question.id.match(/^storage\.(variables|secrets)\.(defaultScope|organizationVisibility|preserveExisting|overrides)$/u);
  if (storage) {
    const resource = storage[1] === 'variables' ? 'Variables' : 'Secrets';
    const field = storage[2];
    if (field === 'defaultScope') return locale === 'fr'
      ? `Choisissez si les nouvelles ${resource} sont stockées dans le dépôt ou l’organisation ; ce dernier périmètre peut exiger davantage d’autorisations du PAT.`
      : `Escolha se as novas ${resource} ficam no repositório ou na organização; este último âmbito pode exigir mais permissões do PAT.`;
    if (field === 'organizationVisibility') return locale === 'fr'
      ? `Choisissez les dépôts pouvant utiliser les ${resource} de l’organisation ; « selected » est l’accès le plus restreint.`
      : `Escolha os repositórios que podem usar as ${resource} da organização; «selected» é a visibilidade mais restrita.`;
    if (field === 'preserveExisting') return locale === 'fr'
      ? `Conservez les ${resource} existantes déjà applicables au lieu de les écraser pendant la configuration.`
      : `Conserve as ${resource} existentes e aplicáveis em vez de as substituir durante a configuração.`;
    return locale === 'fr'
      ? `Sélectionnez les ${resource} héritées de l’organisation à définir plutôt dans le dépôt.`
      : `Selecione as ${resource} herdadas da organização que pretende definir no repositório.`;
  }
  return undefined;
}
