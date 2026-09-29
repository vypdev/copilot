import type { SetupFeature } from '../../../src/application/contracts/web_setup_view';
import type { SetupLocale } from './catalog';

export const featureNames: Readonly<Record<SetupLocale, Readonly<Record<SetupFeature, string>>>> = {
  en: { issues: 'Issues', pullRequests: 'Pull requests', commits: 'Commits', issueComments: 'Issue comments',
    pullRequestComments: 'Pull-request comments', release: 'Releases', hotfix: 'Hotfixes', agentProvisioning: 'Agent provisioning',
    credentialHealth: 'Credential health', inactiveIssueClosure: 'Inactive issue closure', issueTemplates: 'Issue templates', pullRequestTemplate: 'Pull-request template' },
  es: { issues: 'Issues', pullRequests: 'Pull requests', commits: 'Commits', issueComments: 'Comentarios en issues',
    pullRequestComments: 'Comentarios en pull requests', release: 'Releases', hotfix: 'Correcciones urgentes', agentProvisioning: 'Instalación de agentes',
    credentialHealth: 'Estado de credenciales', inactiveIssueClosure: 'Cierre de issues inactivos', issueTemplates: 'Plantillas de issues', pullRequestTemplate: 'Plantilla de pull requests' },
  fr: { issues: 'Tickets', pullRequests: 'Pull requests', commits: 'Commits', issueComments: 'Commentaires des tickets',
    pullRequestComments: 'Commentaires des pull requests', release: 'Versions', hotfix: 'Correctifs urgents', agentProvisioning: 'Installation des agents',
    credentialHealth: 'État des identifiants', inactiveIssueClosure: 'Fermeture des tickets inactifs', issueTemplates: 'Modèles de tickets', pullRequestTemplate: 'Modèle de pull request' },
  pt: { issues: 'Questões', pullRequests: 'Pull requests', commits: 'Commits', issueComments: 'Comentários nas questões',
    pullRequestComments: 'Comentários nas pull requests', release: 'Versões', hotfix: 'Correções urgentes', agentProvisioning: 'Instalação de agentes',
    credentialHealth: 'Estado das credenciais', inactiveIssueClosure: 'Fecho de questões inativas', issueTemplates: 'Modelos de questões', pullRequestTemplate: 'Modelo de pull request' },
};

export function featureName(value: string, locale: SetupLocale): string {
  return featureNames[locale][value as SetupFeature] ?? value;
}
