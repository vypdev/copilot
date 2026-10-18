const runnerDiscoveryPresentation = {
  "en": {
    "label": "Discover existing runners and groups?",
    "summary": "Optional: prefill repository Administration read and organization Self-hosted runners read in the setup PAT link. Disabled by default; exact manual routing needs neither discovery grant.",
    "when": "Changes generated workflow runs-on values; runner access, Secrets and authentication are separate.",
    "where": "Changes generated workflow runs-on values; runner access, Secrets and authentication are separate.",
    "how": "Retain keeps existing jobs. Hosted explicitly replaces managed agent/validation routes. A reusable profile comes from COPILOT_RUNNER_PROFILES; manual entry needs exact existing group and labels.",
    "why": "Different job roles have different trust and runtime requirements.",
    "effect": "Observer and publication routes stay independent. Native source workflows remain visible exceptions. Nothing grants access or falls back silently.",
    "verify": "Review effective YAML, repository access and runner authentication. Busy/offline means pending capacity; unknown access needs verification.",
    "example": "Group vypdev; labels self-hosted,codex,Linux; ordinary validation hosted.",
    "documentation": {
      "title": "Where should Copilot jobs run?",
      "url": "https://docs.page/vypdev/copilot/configuration#runner-profiles"
    }
  },
  "es": {
    "label": "¿Consultar los runners y grupos existentes?",
    "summary": "Opcional: incluye Administration de repositorio y Self-hosted runners de organización en lectura en el enlace del PAT. Desactivado por defecto; puedes indicar una ruta manual exacta sin estos permisos de consulta.",
    "when": "Cambia runs-on en los workflows generados; acceso, Secrets y autenticación se verifican por separado.",
    "where": "Cambia runs-on en los workflows generados; acceso, Secrets y autenticación se verifican por separado.",
    "how": "Conservar mantiene los jobs existentes. GitHub sustituye expresamente las rutas gestionadas de agente y validación. Un perfil reutilizable procede de COPILOT_RUNNER_PROFILES; la entrada manual necesita el grupo y las etiquetas exactos.",
    "why": "Cada tipo de job tiene requisitos de confianza y ejecución distintos.",
    "effect": "Observador y publicación conservan rutas independientes. Los workflows nativos se muestran como excepciones. No se concede acceso ni se cambia de entorno automáticamente.",
    "verify": "Revisa YAML, acceso del repositorio y autenticación del runner. Ocupado o desconectado indica capacidad pendiente; acceso desconocido requiere verificación.",
    "example": "Grupo vypdev; etiquetas self-hosted,codex,Linux; validación ordinaria en GitHub.",
    "documentation": {
      "title": "¿Dónde deben ejecutarse los jobs de Copilot?",
      "url": "https://docs.page/vypdev/copilot/configuration#runner-profiles"
    }
  },
  "fr": {
    "label": "Consulter les runners et groupes existants ?",
    "summary": "Facultatif : préremplit Administration du dépôt et Self-hosted runners de l’organisation en lecture dans le lien PAT. Désactivé par défaut ; une route manuelle exacte reste possible sans ces droits de consultation.",
    "when": "Modifie runs-on dans les workflows générés ; accès, Secrets et authentification restent distincts.",
    "where": "Modifie runs-on dans les workflows générés ; accès, Secrets et authentification restent distincts.",
    "how": "Conserver maintient les jobs existants. GitHub remplace explicitement les routes gérées. Le profil partagé provient de COPILOT_RUNNER_PROFILES ; la saisie manuelle exige le groupe et les étiquettes exacts.",
    "why": "Chaque rôle a des exigences de confiance et d’exécution distinctes.",
    "effect": "Observation et publication gardent leurs routes. Les workflows natifs restent des exceptions visibles. Aucun accès accordé ni repli automatique.",
    "verify": "Vérifiez le YAML, l’accès du dépôt et l’authentification. Occupé/hors ligne indique une capacité en attente ; l’accès inconnu doit être vérifié.",
    "example": "Groupe vypdev ; étiquettes self-hosted,codex,Linux ; validation sur GitHub.",
    "documentation": {
      "title": "Où exécuter les jobs Copilot ?",
      "url": "https://docs.page/vypdev/copilot/configuration#runner-profiles"
    }
  },
  "pt": {
    "label": "Consultar runners e grupos existentes?",
    "summary": "Opcional: inclui Administration do repositório e Self-hosted runners da organização em leitura no link do PAT. Desativado por padrão; uma rota manual exata continua disponível sem estas permissões de consulta.",
    "when": "Altera runs-on nos workflows gerados; acesso, Secrets e autenticação são independentes.",
    "where": "Altera runs-on nos workflows gerados; acesso, Secrets e autenticação são independentes.",
    "how": "Manter conserva os jobs existentes. GitHub substitui explicitamente as rotas geridas. O perfil partilhado vem de COPILOT_RUNNER_PROFILES; a entrada manual exige grupo e etiquetas exatos.",
    "why": "Cada função tem requisitos de confiança e execução diferentes.",
    "effect": "Observador e publicação mantêm rotas independentes. Workflows nativos são exceções visíveis. Não concede acesso nem muda automaticamente de ambiente.",
    "verify": "Reveja YAML, acesso do repositório e autenticação. Ocupado/offline indica capacidade pendente; acesso desconhecido exige verificação.",
    "example": "Grupo vypdev; etiquetas self-hosted,codex,Linux; validação normal no GitHub.",
    "documentation": {
      "title": "Onde executar os jobs do Copilot?",
      "url": "https://docs.page/vypdev/copilot/configuration#runner-profiles"
    }
  }
};
/** Credential-free presentation evidence; no provider or mutation adapters. */
const installationReview = {
  blockers: [],
  jobs: [
    { file: 'copilot_issue.yml', job: 'copilot-issues', role: 'agent', runsOn: { group: 'vypdev', labels: ['self-hosted', 'codex', 'Linux'] }, status: 'pending-capacity', retained: false },
    { file: 'agent-cli-provisioning.yml', job: 'verify-agent-clis', role: 'agent', runsOn: { group: 'vypdev', labels: ['self-hosted', 'codex', 'Linux'] }, status: 'access-unknown', retained: false },
    { file: 'copilot_credential_health.yml', job: 'verify-pat', role: 'validation', runsOn: 'ubuntu-latest', status: 'hosted', retained: false },
    { file: 'copilot_pull_request_approval.yml', job: 'observe-approval', role: 'observer', runsOn: 'ubuntu-latest', status: 'hosted', retained: true },
    { file: 'release_workflow.yml', job: 'publish-npm', role: 'publication', runsOn: 'ubuntu-latest', status: 'hosted', retained: true },
  ],
  assets: [
    { path: '.github/workflows/copilot_issue.yml', status: 'customized', enabled: true },
    { path: '.github/workflows/agent-cli-provisioning.yml', status: 'missing', enabled: true },
    { path: '.github/workflows/copilot_credential_health.yml', status: 'missing', enabled: false },
    { path: '.github/workflows/ci_check.yml', status: 'source-only', enabled: true },
    { path: '.copilot/AGENT_GUIDE.md', status: 'shared', enabled: true },
  ],
  changes: [{ path: '.github/workflows/copilot_issue.yml', before: 'jobs:\n  copilot-issues:\n    runs-on: ubuntu-latest\n',
    after: 'jobs:\n  copilot-issues:\n    runs-on:\n      group: vypdev\n      labels: [self-hosted, codex, Linux]\n' }],
};
function runnerReviewView(state, normalPlan) {
  if (state === 'runner-discovery') return { revision: 1, promptRevision: 1, repository: 'fixture-owner/fixture-repo',
    prompt: { kind: 'question', title: 'Runner discovery', presentation: runnerDiscoveryPresentation, phase: 'permission-intent', pass: 1, canGoBack: true,
      question: { stateId: 'agent-runtime', id: 'runners.discover', label: 'Discover existing runners and groups?', kind: 'boolean', defaultValue: false } } };

  if (state === 'runner-plan' || state === 'runner-blocked') return { ...normalPlan,
    prompt: { ...normalPlan.prompt, editGroups: ['agent-runtime'], plan: { ...normalPlan.prompt.plan,
      installationReview: state === 'runner-blocked'
        ? { ...installationReview, blockers: ['Restore the compatible generator before replacing this asset.'] } : installationReview } } };
  if (state === 'runner-question') return { revision: 1, promptRevision: 1, repository: 'fixture-owner/fixture-repo',
    prompt: { kind: 'question', title: 'Runner profile', phase: 'full', pass: 1, canGoBack: true,
      question: { stateId: 'agent-runtime', id: 'runners.mode', label: 'Where should Copilot jobs run?', kind: 'choice', defaultValue: 'manual-self-hosted',
        choices: ['retain', 'hosted', 'organization-profile', 'manual-self-hosted'], runnerRegistryStatus: 'available',
        runnerProfiles: [{ id: 'vypdev-agent', group: 'vypdev', labels: ['self-hosted', 'codex', 'Linux'], validation: 'hosted' }],
        runnerInventory: { status: 'incomplete', groups: [{ name: 'vypdev', access: 'unknown' }], candidates: [] } } } };
}
module.exports = { runnerReviewView };
