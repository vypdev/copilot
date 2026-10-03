import type { SetupQuestion } from '../../domain/setup_questionnaire';
import type { SetupQuestionExplanation } from '../contracts/web_setup_view';
import { translatedQuestionLabel } from './setup_question_labels_fr_pt';
import { setupQuestionPurposeFrPt } from './setup_question_purpose_fr_pt';

type Copy = Pick<SetupQuestionExplanation, 'summary' | 'when' | 'example' | 'effect' | 'verify'>;

const where: Readonly<Record<SetupQuestion['stateId'], string>> = {
  capabilities: 'La configuration écrit les workflows choisis dans ce dépôt et ne demande que les autorisations GitHub nécessaires.',
  'agent-runtime': 'Les workflows GitHub Actions générés lancent cet agent sur leur runner ; rien n’est installé sur cet ordinateur.',
  'agent-model-defaults': 'Le modèle et la commande communs sont enregistrés dans la configuration du dépôt lue par les workflows.',
  'agent-role-overrides': 'Cette exception propre à une tâche est enregistrée dans le dépôt et lue uniquement lorsque cette tâche s’exécute.',
  repository: 'Le profil du dépôt et les workflows générés utilisent cette valeur pour les futurs événements de branches, tickets et pull requests.',
  deployment: 'Le profil du dépôt commande les futurs workflows de version et de correctif urgent ; répondre ne publie rien.',
  bugbot: 'Le workflow généré lit ce réglage dans la configuration du dépôt ou les Variables GitHub Actions sélectionnées.',
  'pull-request-approval': 'L’approbation encadrée utilise les identités exactes des producteurs CI et les preuves des exécutions GitHub.',
  projects: 'Les Projects choisis et leurs valeurs du champ Status seront utilisés par l’automatisation future des tickets et pull requests.',
  provisioning: 'Après la confirmation finale, la configuration peut créer ou mettre à jour les fichiers et ressources GitHub Actions choisis.',
  storage: 'GitHub Actions stocke ces ressources au niveau du dépôt ou de l’organisation ; ce choix change leur visibilité et les autorisations du PAT.',
};

const section: Readonly<Record<SetupQuestion['stateId'], Copy>> = {
  capabilities: { summary: 'Choisissez les automatisations que Copilot installera.', when: 'Ce choix influence les workflows, les autorisations GitHub et les questions suivantes.', example: 'Désactivez une fonction que vous ne prévoyez pas d’utiliser.', effect: 'Seules les fonctions sélectionnées figureront dans le plan.', verify: 'Examinez le plan avant d’appliquer les changements.' },
  'agent-runtime': { summary: 'Choisissez l’agent CLI pour cette tâche.', when: 'Il sera utilisé lorsque la fonction sélectionnée s’exécutera dans GitHub Actions.', example: 'Codex est lancé avec la commande codex.', effect: 'L’Action lance le fournisseur choisi, sans solution de remplacement implicite.', verify: 'Vérifiez que le runner dispose du CLI et des identifiants nécessaires.' },
  'agent-model-defaults': { summary: 'Définissez les modèles utilisés par défaut pour les tâches de l’agent.', when: 'Ils s’appliquent sauf si vous configurez chaque tâche séparément.', example: 'Gardez le modèle proposé si vous n’avez pas de besoin particulier.', effect: 'L’Action transmet ces valeurs au CLI sélectionné.', verify: 'Examinez le plan et les modèles autorisés sur le runner.' },
  'agent-role-overrides': { summary: 'Personnalisez cette tâche de l’agent.', when: 'Uniquement si vous avez activé la configuration indépendante des tâches.', example: 'Utilisez un modèle différent pour la revue et la planification.', effect: 'Seule cette tâche utilise cette exception.', verify: 'Examinez les valeurs de chaque tâche dans le plan.' },
  repository: { summary: 'Définissez comment Copilot traite votre dépôt.', when: 'Ce réglage agit sur les workflows et futurs événements de tickets ou pull requests.', example: 'Indiquez le véritable nom de votre branche de développement.', effect: 'L’automatisation future suivra les branches et règles choisies.', verify: 'Examinez les fichiers prévus et le profil du dépôt.' },
  deployment: { summary: 'Définissez le comportement des versions et correctifs urgents.', when: 'Ce réglage n’importe que si ces workflows sont activés.', example: 'Gardez la stratégie par défaut sauf si votre organisation des branches diffère.', effect: 'Il modifie la gestion des branches et pull requests de réconciliation.', verify: 'Examinez la partie versions et correctifs du plan.' },
  bugbot: { summary: 'Définissez comment Bugbot analyse et signale les changements.', when: 'Ce réglage sert lorsque les fonctions de revue IA s’exécutent.', example: 'Par défaut, les résultats admissibles sont publiés sans bloquer toutes les pull requests.', effect: 'Il change les futures publications et diagnostics de revue.', verify: 'Examinez les Variables Bugbot du plan et les résultats de revue.' },
  'pull-request-approval': { summary: 'Choisissez les preuves exigées avant que le bot recommande ou soumette une approbation.', when: 'Ce réglage ne s’applique que si l’automatisation des pull requests est activée.', example: '« Recommend » informe une personne ; « guarded » peut approuver sur GitHub.', effect: 'Une vérification verte affichée ici ne suffit jamais à approuver une pull request.', verify: 'Inspectez les preuves CI, Bugbot et les règles de branche.' },
  projects: { summary: 'Choisissez une valeur Status existante pour une transition de ticket ou PR.', when: 'Seulement si vous intégrez des Projects.', example: 'Todo à la création ; In Progress au début du travail.', effect: 'L’automatisation modifiera le champ Status, pas une colonne visuelle.', verify: 'Vérifiez les options Status de chaque Project choisi.' },
  provisioning: { summary: 'Choisissez les ressources GitHub Actions gérées par la configuration.', when: 'Cela influence les autorisations du PAT et les écritures prévues.', example: 'Gardez les Secrets activés si le PAT du bot doit être installé.', effect: 'Les ressources sélectionnées pourront être créées ou mises à jour après approbation.', verify: 'Examinez les noms exacts des ressources dans le plan.' },
  storage: { summary: 'Choisissez où résident les Variables et Secrets GitHub Actions.', when: 'Ce réglage s’applique quand leur création est activée.', example: 'Le dépôt est le périmètre par défaut le plus simple.', effect: 'Il change la visibilité, les autorisations et l’ordre de priorité.', verify: 'Examinez le périmètre et les avertissements de masquage dans le plan.' },
};

const special: Readonly<Record<string, Copy>> = {
  'agents.findings.executable': { summary: 'Choisissez la commande de l’agent sur le runner GitHub Actions, pas sur cet ordinateur.', when: 'Ne la changez que si un agent personnalisé est délibérément installé sur le runner.', example: 'Laissez vide pour codex, opencode ou agent selon le fournisseur.', effect: 'Le chemin personnalisé est utilisé pour les tâches choisies et n’est jamais installé automatiquement.', verify: 'Vérifiez que le runner possède exactement cet exécutable avant d’activer le workflow.' },
  'ai.includeReasoning': { summary: 'Demandez des explications supplémentaires si la réponse du fournisseur les contient.', when: 'Réservé aux diagnostics avancés ; le parcours CLI actuel ne fournit pas de parties de raisonnement séparées.', example: 'Laissez désactivé pour une configuration normale.', effect: 'Cela peut ajouter du texte du fournisseur, sans garantir des métadonnées brèves.', verify: 'Inspectez une réponse structurée contrôlée ; ne supposez pas que l’option a produit plus de texte.' },
  'ai.bugbotDryRun': { summary: 'Gardez Bugbot en mode analyse seule pour ses futures exécutions.', when: 'Utile pour une évaluation ; incompatible avec les preuves nécessaires à l’approbation.', example: 'Choisissez Non pour publier les revues normales.', effect: 'Bugbot analyse sans publier de résultat ni modifier le dépôt. Ce n’est pas setup --dry-run.', verify: 'Inspectez le résultat du workflow Bugbot : le mode analyse seule ne publie ni revue ni vérification.' },
  'ai.bugbotOrganizationRules': { summary: 'Définissez des consignes générales pour Bugbot, une règle par ligne.', when: 'Utile si l’équipe partage des critères de revue dans le dépôt configuré.', example: 'Signaler les changements qui contournent l’isolation des clients.', effect: 'Ces règles précèdent celles du dépôt ; le périmètre de la Variable détermine le stockage.', verify: 'Inspectez la Variable configurée et activez le traçage des sources de règles.' },
  'pullRequestApproval.testChecks': { summary: 'Choisissez les jobs CI que le bot peut considérer comme preuve de tests indépendante.', when: 'Obligatoire pour les modes Recommend et Guarded.', example: 'Sélectionnez le job Tests exact, son ID d’App GitHub et son workflow dans une exécution récente.', effect: 'Seules les identités exactes listées satisfont la condition d’approbation.', verify: 'Ouvrez l’exécution liée et vérifiez le job, l’App et le résultat pour le commit courant.' },
  'pullRequestApproval.producerAttested': { summary: 'Confirmez avoir inspecté le producteur CI exact et son étape obligatoire de couverture.', when: 'Obligatoire avant que le mode Guarded puisse approuver.', example: 'Vérifiez que le job Tests échoue si le seuil de couverture n’est pas atteint.', effect: 'Votre confirmation est enregistrée ; Copilot ne la déduit pas d’une vérification verte.', verify: 'Inspectez le fichier du workflow et une exécution réelle avant de répondre Oui.' },
  'pullRequestApproval.coverage.mode': { summary: 'Choisissez comment prouver la couverture exigée du code modifié.', when: 'Ce choix s’applique lorsque l’approbation de PR est activée.', example: 'Check : le CI impose le seuil. Numeric : un workflow fiable publie des décomptes limités.', effect: 'Check fait confiance au garde CI ; Numeric lit copilot-diff-coverage-v1 et compare un seuil.', verify: 'Inspectez respectivement la condition d’échec du CI ou l’artefact du rapporteur.' },
  'pullRequestApproval.coverage.checkName': { summary: 'Sélectionnez la vérification fiable qui échoue sous le seuil de couverture.', when: 'Obligatoire dans les deux modes de preuve.', example: 'Utilisez le même job Tests exact que dans l’étape précédente.', effect: 'Le succès d’une autre vérification ou App ne remplace pas ce garde.', verify: 'Vérifiez que l’étape de couverture est obligatoire, pas seulement informative.' },
  'projects.enabled': { summary: 'Décidez si les futurs tickets et PR doivent utiliser des Projects GitHub existants.', when: 'Avant de créer le PAT de configuration pour prévoir le droit de lecture des Projects.', example: 'Oui si l’équipe utilise un Project de l’organisation ; Non pour ignorer cette intégration.', effect: 'Oui prévoit Projects: read de l’organisation si nécessaire. Aucun Project n’est modifié maintenant.', verify: 'Vérifiez les droits du PAT ; les Projects précis seront choisis après son autorisation.' },
  'projects.ids': { summary: 'Choisissez les Projects existants que Copilot pourra actualiser plus tard.', when: 'Après la vérification du PAT ; si la liste est inaccessible, utilisez la saisie manuelle.', example: 'Pour https://github.com/orgs/acme/projects/5, choisissez la carte ou saisissez 5, jamais PVT_…', effect: 'Leurs numéros seront enregistrés ; aucun élément Project n’est modifié maintenant.', verify: 'Ouvrez chaque Project et vérifiez propriétaire et numéro avant de confirmer le plan.' },
};

function howToChoose(question: SetupQuestion): string {
  if (question.id === 'pullRequestApproval.coverage.checkName') return 'Choisissez l’une des vérifications fiables ci-dessus. Ouvrez son exécution et son workflow : l’étape de couverture doit faire échouer le job si le seuil n’est pas atteint. Un résultat vert ne suffit pas.';
  if (question.id === 'pullRequestApproval.producerAttested') return 'Répondez Oui uniquement après avoir vérifié chaque nom, ID d’App et workflow choisis, ainsi que l’étape de couverture obligatoire du check retenu. Sinon, répondez Non et restez en mode recommandation.';
  if (question.id === 'pullRequestApproval.coverage.artifactWorkflowName') return 'Saisissez le nom exact d’un workflow fiable choisi qui publie copilot-diff-coverage-v1 pour cette PR et ses commits de base et de tête. Ne devinez pas le nom du workflow.';
  if (question.id === 'projects.statusVerified') return 'Ouvrez chaque Project choisi sur GitHub, inspectez son champ Status et comparez les quatre valeurs exactes ci-dessus. Répondez Oui uniquement si toutes existent dans chaque Project ; Non revient au choix des Projects.';
  if (/^projects\.(issue|pullRequest)(Created|InProgress)Column$/u.test(question.id)) return 'Choisissez une option du champ Status présente dans tous les Projects sélectionnés. Si les options ne sont pas lisibles, ouvrez chaque Project sur GitHub et saisissez la même valeur existante ; des valeurs différentes par Project ne sont pas prises en charge.';
  switch (question.kind) {
    case 'boolean': return 'Choisissez Oui pour activer ou Non pour désactiver ; la réponse suggérée apparaît plus bas.';
    case 'producer-select': return 'Inspectez chaque exécution candidate sur GitHub, puis choisissez le job, l’ID d’App et le workflow exacts. Ne saisissez manuellement que si aucun candidat vérifié n’apparaît.';
    case 'project-select': return 'Choisissez par titre et URL. Saisissez le numéro positif ou l’URL GitHub exacte si un Project manque ; les ID PVT_ sont invalides.';
    case 'scope-overrides': return 'Sélectionnez uniquement les noms hérités à remplacer volontairement dans le dépôt. Laissez vide pour conserver les valeurs de l’organisation.';
    case 'multi-select': return 'Cochez les workflows que vous utiliserez. Vous pouvez en choisir plusieurs ; vérifiez leurs autorisations avant de créer un PAT.';
    case 'choice': return 'Choisissez une valeur après avoir lu ses conséquences ; la valeur enregistrée n’est pas traduite.';
    case 'number': return 'Saisissez un entier dans la plage indiquée ; gardez la valeur suggérée en cas de doute.';
    default: return 'Saisissez la valeur exacte utilisée par votre dépôt ou runner ; ne laissez vide que si la question le permet.';
  }
}

export function frenchQuestionExplanation(question: SetupQuestion, documentation: SetupQuestionExplanation['documentation']): SetupQuestionExplanation {
  const copy = special[question.id] ?? section[question.stateId];
  return {
    label: translatedQuestionLabel(question, 'fr'),
    ...copy,
    summary: special[question.id] ? copy.summary : (setupQuestionPurposeFrPt(question, 'fr') ?? copy.summary),
    where: where[question.stateId],
    how: howToChoose(question),
    why: `Cette décision permet d’accorder le plan, les autorisations du PAT et l’automatisation future avant d’appliquer des changements. ${copy.when}`,
    documentation: { title: 'Documentation de cette option', url: documentation.url },
  };
}
