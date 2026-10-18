import type { SetupQuestion } from '../../domain/setup_questionnaire';
import type { SetupQuestionPresentation } from '../contracts/web_setup_view';

const copy = {
  en: { labels: ['Where should Copilot jobs run?', 'Reusable runner profile', 'Existing runner group (empty uses labels)', 'Exact runner labels, comma-separated', 'Ordinary validation runner'],
    summary: 'Keep installed routing, choose GitHub-hosted jobs, or explicitly select an existing self-hosted profile.',
    where: 'Changes generated workflow runs-on values; runner access, Secrets and authentication are separate.',
    how: 'Retain keeps existing jobs. Hosted explicitly replaces managed agent/validation routes. A reusable profile comes from COPILOT_RUNNER_PROFILES; manual entry needs exact existing group and labels.',
    why: 'Different job roles have different trust and runtime requirements.', effect: 'Credential verification stays hosted; observer and publication routes stay independent. Native source workflows remain visible exceptions. Nothing grants access or falls back silently.',
    verify: 'Review effective YAML, repository access and runner authentication. Busy/offline means pending capacity; unknown access needs verification.', example: 'Group vypdev; labels self-hosted,codex,Linux; ordinary validation hosted.' },
  es: { labels: ['¿Dónde deben ejecutarse los jobs de Copilot?', 'Perfil de runners reutilizable', 'Grupo de runners existente (vacío usa etiquetas)', 'Etiquetas exactas del runner, separadas por comas', 'Runner para validaciones ordinarias'],
    summary: 'Conserva las rutas instaladas, elige runners de GitHub o selecciona expresamente un perfil self-hosted existente.',
    where: 'Cambia runs-on en los workflows generados; acceso, Secrets y autenticación se verifican por separado.',
    how: 'Conservar mantiene los jobs existentes. GitHub sustituye expresamente las rutas gestionadas de agente y validación. Un perfil reutilizable procede de COPILOT_RUNNER_PROFILES; la entrada manual necesita el grupo y las etiquetas exactos.',
    why: 'Cada tipo de job tiene requisitos de confianza y ejecución distintos.', effect: 'La verificación de credenciales permanece en GitHub; observador y publicación conservan rutas independientes. Los workflows nativos se muestran como excepciones. No se concede acceso ni se cambia de entorno automáticamente.',
    verify: 'Revisa YAML, acceso del repositorio y autenticación del runner. Ocupado o desconectado indica capacidad pendiente; acceso desconocido requiere verificación.', example: 'Grupo vypdev; etiquetas self-hosted,codex,Linux; validación ordinaria en GitHub.' },
  fr: { labels: ['Où exécuter les jobs Copilot ?', 'Profil de runners réutilisable', 'Groupe existant (vide utilise les étiquettes)', 'Étiquettes exactes séparées par des virgules', 'Runner de validation ordinaire'],
    summary: 'Conservez les routes installées, choisissez GitHub ou sélectionnez explicitement un profil auto-hébergé existant.',
    where: 'Modifie runs-on dans les workflows générés ; accès, Secrets et authentification restent distincts.',
    how: 'Conserver maintient les jobs existants. GitHub remplace explicitement les routes gérées. Le profil partagé provient de COPILOT_RUNNER_PROFILES ; la saisie manuelle exige le groupe et les étiquettes exacts.',
    why: 'Chaque rôle a des exigences de confiance et d’exécution distinctes.', effect: 'La vérification des identifiants reste sur GitHub ; observation et publication gardent leurs routes. Les workflows natifs restent des exceptions visibles. Aucun accès accordé ni repli automatique.',
    verify: 'Vérifiez le YAML, l’accès du dépôt et l’authentification. Occupé/hors ligne indique une capacité en attente ; l’accès inconnu doit être vérifié.', example: 'Groupe vypdev ; étiquettes self-hosted,codex,Linux ; validation sur GitHub.' },
  pt: { labels: ['Onde executar os jobs do Copilot?', 'Perfil reutilizável de runners', 'Grupo existente (vazio usa etiquetas)', 'Etiquetas exatas separadas por vírgulas', 'Runner de validação normal'],
    summary: 'Mantenha as rotas instaladas, escolha GitHub ou selecione explicitamente um perfil self-hosted existente.',
    where: 'Altera runs-on nos workflows gerados; acesso, Secrets e autenticação são independentes.',
    how: 'Manter conserva os jobs existentes. GitHub substitui explicitamente as rotas geridas. O perfil partilhado vem de COPILOT_RUNNER_PROFILES; a entrada manual exige grupo e etiquetas exatos.',
    why: 'Cada função tem requisitos de confiança e execução diferentes.', effect: 'A verificação de credenciais permanece no GitHub; observador e publicação mantêm rotas independentes. Workflows nativos são exceções visíveis. Não concede acesso nem muda automaticamente de ambiente.',
    verify: 'Reveja YAML, acesso do repositório e autenticação. Ocupado/offline indica capacidade pendente; acesso desconhecido exige verificação.', example: 'Grupo vypdev; etiquetas self-hosted,codex,Linux; validação normal no GitHub.' },
};
const fields = ['mode', 'profileId', 'group', 'labels', 'validation'];
export const SETUP_RUNNER_QUESTION_IDS: readonly string[] = [...fields, 'discover'].map(field => `runners.${field}`);
const discoveryCopy = {
  en: ['Discover existing runners and groups?', 'Optional: prefill repository Administration read and organization Self-hosted runners read in the setup PAT link. Disabled by default; exact manual routing needs neither discovery grant.', 'Temporary setup PAT only. Discovery reads inventory after PAT verification, never changes runner access, and keeps exact manual routing available when skipped or denied.'],
  es: ['¿Consultar los runners y grupos existentes?', 'Opcional: incluye Administration de repositorio y Self-hosted runners de organización en lectura en el enlace del PAT. Desactivado por defecto; puedes indicar una ruta manual exacta sin estos permisos de consulta.', 'Solo afecta al PAT temporal de setup. Consulta el inventario tras verificarlo, nunca cambia el acceso a runners y permite indicar la ruta manual si se omite o deniega la consulta.'],
  fr: ['Consulter les runners et groupes existants ?', 'Facultatif : préremplit Administration du dépôt et Self-hosted runners de l’organisation en lecture dans le lien PAT. Désactivé par défaut ; une route manuelle exacte reste possible sans ces droits de consultation.', 'Concerne uniquement le PAT temporaire. Consulte l’inventaire après vérification, ne modifie jamais les accès et permet une route manuelle si la consultation est ignorée ou refusée.'],
  pt: ['Consultar runners e grupos existentes?', 'Opcional: inclui Administration do repositório e Self-hosted runners da organização em leitura no link do PAT. Desativado por padrão; uma rota manual exata continua disponível sem estas permissões de consulta.', 'Afeta apenas o PAT temporário. Consulta o inventário após a verificação, nunca altera o acesso e permite uma rota manual se a consulta for ignorada ou negada.'],
};
export function setupRunnerGuidance(question: SetupQuestion): SetupQuestionPresentation {
  const index = fields.indexOf(question.id.slice('runners.'.length));
  return Object.fromEntries(Object.entries(copy).map(([locale, value]) => [locale, {
    label: question.id === 'runners.discover' ? discoveryCopy[locale as keyof typeof discoveryCopy][0] : value.labels[index],
    summary: question.id === 'runners.discover' ? discoveryCopy[locale as keyof typeof discoveryCopy][1] : value.summary, when: value.where, where: question.id === 'runners.discover' ? discoveryCopy[locale as keyof typeof discoveryCopy][2] : value.where,
    how: question.id === 'runners.discover' ? discoveryCopy[locale as keyof typeof discoveryCopy][1] : value.how, why: value.why,
    effect: question.id === 'runners.discover' ? discoveryCopy[locale as keyof typeof discoveryCopy][2] : value.effect, verify: value.verify, example: value.example,
    documentation: { title: value.labels[0], url: 'https://docs.page/vypdev/copilot/configuration#runner-profiles' },
  }])) as unknown as SetupQuestionPresentation;
}
