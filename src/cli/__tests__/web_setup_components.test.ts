import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { setupQuestionPresentation } from '../../application/policies/setup_question_guidance_policy';
import type { SetupQuestion } from '../../domain/setup_questionnaire';

function markup(name: string, props: Record<string, unknown>, locale = 'en'): string {
  return execFileSync(process.execPath, [
    resolve(__dirname, '../../../scripts/render-web-setup-component.cjs'), name, JSON.stringify(props), locale,
  ], { encoding: 'utf8' });
}

const noOp = async (): Promise<void> => undefined;

describe('web setup component semantics', () => {
  test('pairing screen explains terminal code without exposing a key in the URL', () => {
    const html = markup('PairingPanel', { busy: false });
    expect(html).toContain('Pair this browser');
    expect(html).toContain('Pairing code from terminal');
    expect(html).toContain('16-character pairing code');
    expect(html).toContain('After refreshing');
    expect(html).not.toContain('setup-key');
  });
  test.each([
    ['en', 'Pair this browser'], ['es', 'Vincula este navegador'],
    ['fr', 'Associer ce navigateur'], ['pt', 'Emparelhar este navegador'],
  ])('%s has a localized pairing screen', (locale, label) => {
    const html = markup('PairingPanel', { busy: false }, locale);
    expect(html).toContain(label);
    expect(html).toContain('copilot setup --web');
  });
  test('language selector lists exactly the four supported languages, with English first', () => {
    const html = markup('LanguageSwitch', {});
    for (const code of ['en', 'es', 'fr', 'pt']) {
      expect(html).toContain(`value="${code}"`);
    }
    expect(html.indexOf('value="en"')).toBeLessThan(html.indexOf('value="es"'));
    expect(html).not.toContain('value="ar"');
    expect(html).toContain('aria-live="polite"');
  });
  test.each([
    ['complete', 'Your configuration was applied', 'not revoked automatically'],
    ['dry-run', 'No changes were made', 'did not begin applying'],
    ['cancelled', 'No setup changes started', 'did not begin applying'],
    ['blocked', 'No setup changes started', 'did not begin applying'],
    ['partial', 'Check partial changes before retrying', 'may have succeeded'],
  ])('%s result explains actual mutation state and PAT cleanup', (outcome, heading, explanation) => {
    const html = markup('ResultPanel', { outcome, controller: true, onClose: noOp });
    expect(html).toContain(heading);
    expect(html).toContain(explanation);
    expect(html).toContain('Close local session');
    expect(html).toContain('copilot doctor');
  });
  test('completed Spanish result offers safe in-page verification and explains unverified Secret values', () => {
    const before = markup('ResultPanel', { outcome: 'complete', controller: true, onClose: noOp }, 'es');
    expect(before).toContain('Comprobar instalación (solo lectura)');
    const html = markup('ResultPanel', { outcome: 'complete', controller: true, onClose: noOp,
      doctor: { status: 'complete', healthy: false, pass: 4, warn: 1, fail: 0, skipped: 2 } }, 'es');
    expect(html).toContain('4 correctas');
    expect(html).toContain('Este modo no puede verificar los valores de Secrets.');
    expect(html).toContain('copilot doctor --read-only');
    expect(html).not.toContain('private GitHub diagnostic');
  });

  test('blocked page identifies the cause and next action in the chosen language', () => {
    const detail = { reasonCode: 'permissions', stoppedStage: 'Plan', mutationStarted: false };
    const html = markup('ResultPanel', { outcome: 'blocked', detail, controller: true }, 'es');
    expect(html).toContain('Faltan permisos del PAT');
    expect(html).toContain('Plan');
    expect(html).toContain('Comprueba los permisos mostrados');
    expect(html).toContain('No se iniciaron cambios');
  });

  test.each([
    ['en', 'PAT permission evidence', 'Projects', 'Unverifiable'],
    ['es', 'Comprobación de permisos del PAT', 'Proyectos', 'No verificable'],
    ['fr', 'Vérification des droits du PAT', 'Projets', 'Non vérifiable'],
    ['pt', 'Verificação das permissões do PAT', 'Projetos', 'Não verificável'],
  ])('%s blocked PAT result preserves the exact failed grant without a credential', (locale, title, name, status) => {
    const html = markup('ResultPanel', { outcome: 'blocked', controller: true,
      detail: { reasonCode: 'permissions', stoppedStage: 'Setup PAT', mutationStarted: false },
      permissionReport: { role: 'setup', identityStatus: 'valid', identityMessage: 'ok', ready: false,
        confirmationRequired: false, checks: [{ id: 'setup.organization.projects', role: 'setup',
          permission: 'Projects', scope: 'organization', level: 'read', applicability: 'required',
          reason: 'Inspect Projects', probe: 'projects', status: 'unverifiable',
          operationallyAvailable: true,
          message: 'private diagnostic secret-token' }] } }, locale);
    expect(html).toContain(title);
    expect(html).toContain(name);
    expect(html).toContain(status);
    expect(html).not.toContain('No required grant failed this check');
    if (locale !== 'en') expect(html).toContain('GitHub · Projects');
    expect(html).not.toContain('private diagnostic');
    expect(html).not.toContain('secret-token');
  });

  test.each([
    ['en', 'Rejected', 'Not checked'],
    ['es', 'Rechazados', 'Sin comprobar'],
    ['fr', 'Refusés', 'Non vérifié'],
    ['pt', 'Recusados', 'Não verificada'],
  ])('%s invalid identity lists required grants without claiming individual denial', (locale, identity, status) => {
    const html = markup('ResultPanel', { outcome: 'blocked', controller: true,
      detail: { reasonCode: 'permissions', stoppedStage: 'Setup PAT', mutationStarted: false },
      permissionReport: { role: 'setup', identityStatus: 'invalid', identityMessage: 'rejected',
        ready: false, confirmationRequired: false, checks: [{ permission: 'Projects',
          scope: 'organization', level: 'read', applicability: 'required', status: 'missing' }] } }, locale);
    expect(html).toContain(identity);
    expect(html).toContain('Projects');
    expect(html).toContain(status);
    expect(html).not.toContain('private diagnostic');
  });

  test('unverifiable identity lists grants as not checked', () => {
    const html = markup('ResultPanel', { outcome: 'blocked', controller: true,
      detail: { reasonCode: 'permissions', stoppedStage: 'Setup PAT', mutationStarted: false },
      permissionReport: { role: 'setup', identityStatus: 'unverifiable', identityMessage: 'private diagnostic',
        ready: false, confirmationRequired: false, checks: [{ permission: 'Secrets',
          scope: 'organization', level: 'write', applicability: 'required', status: 'unverifiable' }] } });
    expect(html).toContain('Secrets');
    expect(html).toContain('Not checked');
    expect(html).not.toContain('private diagnostic');
  });

  test('unrelated blocked outcome does not attribute stale permission evidence to its cause', () => {
    const html = markup('ResultPanel', { outcome: 'blocked', controller: true,
      detail: { reasonCode: 'storage', stoppedStage: 'Plan', mutationStarted: false },
      permissionReport: { role: 'setup', identityStatus: 'valid', checks: [{ permission: 'Projects',
        scope: 'organization', level: 'read', applicability: 'required', status: 'unverifiable' }] } });
    expect(html).not.toContain('PAT permission evidence');
    expect(html).not.toContain('Projects');
  });

  test('partial result shows structured cause, safe effects, and diagnostic reference', () => {
    const html = markup('ResultPanel', { outcome: 'partial', controller: true, onClose: noOp,
      detail: { reasonCode: 'provider', stoppedStage: 'Apply', mutationStarted: true,
        diagnosticRef: '12345678-1234-4123-8123-123456789abc',
        effects: [{ id: 'files', state: 'completed' }, { id: 'secret', state: 'needs-inspection' }] } });
    expect(html).toContain('GitHub or another provider did not complete');
    expect(html).toContain('Reported completed');
    expect(html).toContain('Outcome needs inspection');
    expect(html).toContain('12345678-1234-4123-8123-123456789abc');
  });

  test.each([
    ['en', 'which changes completed', 'before Apply'],
    ['es', 'qué cambios se completaron', 'antes de aplicar cambios'],
    ['fr', 'modifications effectuées', 'avant l’application'],
    ['pt', 'quais alterações foram concluídas', 'antes de aplicar'],
  ])('%s partial result with unknown cause does not claim Apply never started', (locale, expected, falseClaim) => {
    const html = markup('ResultPanel', { outcome: 'partial', controller: true, onClose: noOp,
      detail: { reasonCode: 'unknown', stoppedStage: 'Apply', mutationStarted: true,
        effects: [{ id: 'secrets', state: 'needs-inspection', scope: 'repository' }] } }, locale);
    expect(html).toContain(expected);
    expect(html).not.toContain(falseClaim);
  });

  test('French technical question guidance is complete, not a mixed-language preview', () => {
    const question: SetupQuestion = { stateId: 'pull-request-approval', id: 'pullRequestApproval.testChecks',
      label: 'Trusted checks', kind: 'text', defaultValue: '' };
    const html = markup('QuestionPrompt', { prompt: {
      kind: 'question', title: 'Approval', phase: 'full', pass: 1,
      question, presentation: setupQuestionPresentation(question),
    }, controller: true, busy: false }, 'fr');
    expect(html).toContain('Quelles vérifications CI sont fiables pour approuver ?');
    expect(html).toContain('jobs CI');
    expect(html).not.toContain('Detailed guidance below is currently available in English');
  });

  test.each([
    ['en', 'Keep release selected'], ['es', 'Mantén release seleccionado'],
    ['fr', 'Gardez release sélectionné'], ['pt', 'Mantenha release selecionado'],
  ])('%s PAT-intent workflow question explains fixed feature overrides before input', (locale, expected) => {
    const html = markup('QuestionPrompt', { prompt: { kind: 'question', title: 'Issue workflows', phase: 'permission-intent', pass: 1,
      question: { stateId: 'capabilities', id: 'issueWorkflows.enabled', label: 'Issue workflows', kind: 'multi-select',
        defaultValue: 'feature,release', choices: ['feature', 'release', 'hotfix'],
        fixedWorkflowFeatures: { release: true, hotfix: false } } }, controller: true, busy: false }, locale);
    expect(html).toContain(expected);
    expect(html).toContain('features.hotfix=false');
  });

  test('question details explain where, how and why, with a safe contextual link', () => {
    const html = markup('QuestionPrompt', { prompt: {
      kind: 'question', title: 'Repository', phase: 'full', pass: 1,
      question: { stateId: 'repository', id: 'repository.mainBranch', label: 'Production branch', kind: 'text', defaultValue: 'main' },
      presentation: {
        en: { label: 'Production branch', summary: 'Choose the production branch.', when: 'Before release.',
          where: 'Repository settings.', how: 'Enter its exact name.', why: 'Releases target this branch.',
          example: 'main', effect: 'Changes release target.', verify: 'Review plan.',
          documentation: { title: 'Copilot configuration', url: 'https://docs.page/vypdev/copilot/configuration' } },
        es: { label: 'Rama de producción', summary: 'Elige la rama de producción.', when: 'Antes de publicar.',
          where: 'Configuración del repositorio.', how: 'Escribe el nombre exacto.', why: 'La publicación usa esta rama.',
          example: 'main', effect: 'Cambia el destino.', verify: 'Revisa el plan.',
          documentation: { title: 'Configuración de Copilot', url: 'https://docs.page/vypdev/copilot/configuration' } },
      },
    }, controller: true, busy: false }, 'es');
    expect(html).toContain('Dónde se configura');
    expect(html).toContain('Cómo elegir');
    expect(html).toContain('Por qué importa');
    expect(html).toContain('https://docs.page/vypdev/copilot/configuration');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html.indexOf('question-help-link')).toBeLessThan(html.indexOf('<details'));
  });

  test.each([
    ['en', 'Retry GitHub discovery'], ['es', 'Reintentar búsqueda en GitHub'],
    ['fr', 'Relancer la recherche GitHub'], ['pt', 'Repetir pesquisa no GitHub'],
  ])('%s Project discovery offers a localized bounded retry without claiming the organization is empty', (locale, retryLabel) => {
    const html = markup('QuestionPrompt', { prompt: {
      kind: 'question', title: 'Projects', phase: 'full', pass: 1,
      question: { stateId: 'projects', id: 'projects.ids', label: 'Projects', kind: 'project-select', defaultValue: '',
        discoveryStatus: 'empty', discoveryRetryRemaining: 2, projectCandidates: [], projectOwner: 'acme' },
    }, controller: true, busy: false }, locale);
    expect(html).toContain(retryLabel);
    expect(html).toContain('2');
    expect(html).toContain('discovery-actions');
  });

  test('discovery scope is specific and unsupported personal Projects do not offer retry', () => {
    const checkNotice = markup('DiscoveryNotice', { kind: 'checks', status: 'observed' }, 'en');
    expect(checkNotice).toContain('20 recent pull-request workflow runs');
    expect(checkNotice).toContain('15 runs');
    const projectNotice = markup('DiscoveryNotice', { kind: 'projects', status: 'observed' }, 'en');
    expect(projectNotice).toContain('30 open, accessible organization Projects');
    expect(projectNotice).toContain('Closed Projects are excluded');
    const unsupported = markup('QuestionPrompt', { prompt: { kind: 'question', title: 'Projects', phase: 'full', pass: 1,
      question: { stateId: 'projects', id: 'projects.ids', label: 'Projects', kind: 'project-select', defaultValue: '',
        discoveryStatus: 'unsupported', projectCandidates: [], projectOwner: 'owner' } }, controller: true, busy: false }, 'en');
    expect(unsupported).not.toContain('Retry GitHub discovery');
    expect(unsupported).toContain('fine-grained PAT');
  });

  test('coverage selector shows the selected producer identity and the observation limitation', () => {
    const html = markup('QuestionPrompt', { prompt: {
      kind: 'question', title: 'Coverage', phase: 'full', pass: 1,
      question: { stateId: 'pull-request-approval', id: 'pullRequestApproval.coverage.checkName',
        label: 'Coverage check', kind: 'choice', defaultValue: 'Tests', choices: ['Tests'],
        trustedProducers: [{ name: 'Tests', workflowName: 'CI', sourceAppId: 12 }],
        producerCandidates: [{ name: 'Tests', workflowName: 'CI', sourceAppId: 12,
          runUrl: 'https://github.com/acme/repo/actions/runs/7', headSha: 'a'.repeat(40),
          conclusion: 'success', observedAt: '2026-09-29T10:00:00Z' }] },
    }, controller: true, busy: false }, 'en');
    expect(html).toContain('Tests — CI · App 12');
    expect(html).toContain('2026-09-29T10:00:00Z');
    expect(html).toContain('Required by branch rule: not checked');
  });

  test('manual producer App ID remains string-bound while offering a numeric keyboard', () => {
    const html = markup('ProducerSelector', { candidates: [], selected: [], controller: true });
    expect(html).toMatch(/id="producer-app-id"[^>]*type="text"[^>]*inputmode="numeric"/u);
    expect(html).toContain('pattern="[1-9][0-9]*"');
  });

  test('a Project retained across discovery refresh remains visible as unverified and removable', () => {
    const html = markup('ProjectSelector', { candidates: [], selected: ['12'], value: '', controller: true }, 'en');
    expect(html).toContain('#12');
    expect(html).toContain('no longer appear in this GitHub result');
    expect(html).toContain('Remove selection');
  });

  test('manual Project Status attestation displays every transition and exact value', () => {
    const question: SetupQuestion = { stateId: 'projects', id: 'projects.statusVerified', label: 'Verify Status',
      kind: 'boolean', defaultValue: false, projectStatusValues: [
        { transition: 'issueCreated', value: 'Todo' },
        { transition: 'pullRequestCreated', value: 'Doing' },
        { transition: 'issueInProgress', value: 'Started' },
        { transition: 'pullRequestInProgress', value: 'Active' },
      ] };
    const html = markup('QuestionPrompt', { prompt: { kind: 'question', title: 'Projects', phase: 'full', pass: 1,
      question, presentation: setupQuestionPresentation(question) }, controller: true, busy: false }, 'es');
    for (const value of ['Todo', 'Doing', 'Started', 'Active']) expect(html).toContain(value);
    expect(html).toContain('Issue nuevo');
    expect(html).toContain('Pull request en curso');
  });

  test('boolean recommendations use the selected language rather than raw true or false', () => {
    const html = markup('QuestionPrompt', { prompt: {
      kind: 'question', title: 'Features', phase: 'full', pass: 1,
      question: { stateId: 'capabilities', id: 'features.issues', label: 'Issue automation?', kind: 'boolean', defaultValue: false },
    }, controller: true, busy: false }, 'es');
    expect(html).toContain('Respuesta sugerida: No');
    expect(html).not.toContain('Respuesta sugerida: false');
  });

  test('choice recommendations translate their display label without changing the option value', () => {
    const html = markup('QuestionPrompt', { prompt: {
      kind: 'question', title: 'Bugbot', phase: 'full', pass: 1,
      question: { stateId: 'bugbot', id: 'ai.bugbotEffort', label: 'Bugbot effort',
        kind: 'choice', defaultValue: 'smart', choices: ['smart', 'low', 'default', 'high'] },
    }, controller: true, busy: false }, 'es');
    expect(html).toContain('Respuesta sugerida: Adaptativa');
    expect(html).toContain('value="smart"');
  });

  test('read-only result cannot show its close control', () => {
    expect(markup('ResultPanel', { outcome: 'complete', controller: false, onClose: noOp })).not.toContain('Close local session');
  });

  test('choice prompt escapes untrusted text and disables a read-only controller', () => {
    const html = markup('ChoicePrompt', {
      prompt: { kind: 'choice', title: 'Choose', choices: ['<script>alert(1)</script>', 'Safe'] },
      controller: false, busy: false, onSubmit: noOp,
    });
    expect(html).toContain('&lt;script>');
    expect(html).not.toContain('<script>');
    expect(html.match(/disabled/g)?.length).toBeGreaterThanOrEqual(2);
  });

  test('non-question decisions show their purpose before the choices', () => {
    const html = markup('PromptCard', {
      prompt: { kind: 'choice', title: 'How will you provide your setup PAT?',
        description: 'Choose the account that will configure this repository.',
        choices: ['Guided GitHub link', 'Manual PAT'] },
      revision: 1, promptRevision: 1, controller: true, busy: false,
    });
    expect(html).toContain('<h2>How will you provide your setup PAT?</h2>');
    expect(html.indexOf('How will you provide your setup PAT?'))
      .toBeLessThan(html.indexOf('Guided GitHub link'));
    expect(html).toContain('Choose the account that will configure this repository.');
  });

  test('secret presenter uses a password input and only an allowlisted GitHub URL', () => {
    const html = markup('CredentialPrompt', {
      prompt: { kind: 'secret', title: 'Setup PAT', link: 'https://github.com/settings/personal-access-tokens/new?name=Test' },
      controller: true, busy: false, onSubmit: noOp,
    });
    expect(html).toContain('type="password"');
    expect(html).toContain('Only select repositories');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain('ghp_');
  });

  test('credential presenter rejects an untrusted external URL', () => {
    const html = markup('CredentialPrompt', {
      prompt: { kind: 'secret', title: 'Setup PAT', link: 'https://evil.example/steal' },
      controller: true, busy: false, onSubmit: noOp,
    });
    expect(html).not.toContain('evil.example');
    expect(html).not.toContain('Open the official GitHub PAT form');
  });

  test('review plan shows only selected resource names and requires an explicit control', () => {
    const html = markup('PlanPrompt', {
      prompt: { kind: 'plan', title: 'Review', plan: {
        presentationDefaults: [],
        decisions: { enabledCapabilities: ['issues'], agentRouting: [{ role: 'planner', provider: 'codex', modelProvider: 'openai', model: 'o3' }],
          issueWorkflows: ['bugfix'], productionBranch: 'main', developmentBranch: 'develop',
          approvalMode: 'recommend', trustedChecks: [{ name: 'Tests', sourceAppId: 15368, workflowName: 'CI' }], producerAttested: true,
          coverageMode: 'check', coverageCheck: 'Tests', projectNumbers: ['12'],
          projectStatuses: [{ transition: 'issueCreated', value: 'Todo' }],
          variableScope: 'repository', secretScope: 'repository', initialTag: false },
        files: ['AGENTS.md'], workflows: ['copilot.yml'], variables: ['MAIN_BRANCH'], secrets: ['PAT'], warnings: [],
      } }, controller: true, busy: false, onSubmit: noOp,
    });
    for (const item of ['AGENTS.md', 'copilot.yml', 'MAIN_BRANCH', 'PAT']) expect(html).toContain(item);
    expect(html).toContain('main');
    for (const item of ['Planner', 'o3', 'Tests', '15368', 'Todo', '#12']) expect(html).toContain(item);
    expect(html).toContain('Approve');
  });

  test('numeric coverage plan review includes the exact threshold, reporter and operator attestation in Spanish', () => {
    const html = markup('PlanDecisionSummary', { decisions: {
      enabledCapabilities: ['pullRequests'], issueWorkflows: [], agentRouting: [],
      productionBranch: 'main', developmentBranch: 'develop', approvalMode: 'guarded',
      trustedChecks: [{ name: 'Coverage', sourceAppId: 15368, workflowName: 'CI' }], producerAttested: true,
      coverageMode: 'numeric', coverageCheck: 'Coverage', coverageMinimum: 87,
      coverageArtifactWorkflow: 'CI', coverageReporterAttested: true,
      projectNumbers: [], projectStatuses: [], variableScope: 'repository', secretScope: 'repository', initialTag: false,
    } }, 'es');
    for (const value of ['Cobertura mínima de líneas modificadas', '87%', 'Workflow que publica el artefacto',
      'Generador de cobertura comprobado por ti', 'Coverage', '15368']) expect(html).toContain(value);
  });

  test('status banner displays an error without turning arbitrary links into actions', () => {
    const html = markup('StatusBanner', {
      tone: 'error', title: 'Needs attention', message: 'No permission', link: 'javascript:alert(1)',
    });
    expect(html).toContain('No permission');
    expect(html).not.toContain('javascript:');
  });

  test('progress sidebar marks the active step semantically', () => {
    const html = markup('SetupSidebar', { journey: { position: 3 } });
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('Setup PAT');
  });

  test('permissions context distinguishes the setup PAT from bot PAT', () => {
    const base = { revision: 1, repository: 'owner/repo', permissions: {
      role: 'workflow', requirements: [{ permission: 'Contents', scope: 'repository', level: 'read' }],
    } };
    const html = markup('ContextPanel', { view: base });
    expect(html).toContain('Bot PAT');
    expect(html).toContain('Contents');
    expect(html).toContain('owner/repo');
    const translated = markup('ContextPanel', { view: base }, 'es');
    expect(translated).toContain('Contenido');
    expect(translated).toContain('GitHub · Contents');
  });

  test('permission evidence labels missing grants instead of implying access', () => {
    const html = markup('ContextPanel', { view: { revision: 1, repository: 'owner/repo', permissions: {
      role: 'setup', report: { checks: [{ permission: 'Secrets', scope: 'repository', level: 'write',
        applicability: 'required', reason: 'Provision Actions Secret', status: 'missing' }] },
    } } });
    expect(html).toContain('Setup PAT');
    expect(html).toContain('Required');
    expect(html).toContain('Missing');
    expect(html).toContain('Provision Actions Secret');
  });

  test.each([
    ['en', 'A non-public organization Project', 'public resource can be read', 'Read-only checks cannot prove Write'],
    ['es', 'Un Project no público', 'recurso público se puede leer', 'consultas de solo lectura no demuestran Escritura'],
    ['fr', 'Un Project non public', 'ressource publique est lisible', 'lectures seules ne prouvent pas'],
    ['pt', 'Um Project não público', 'recurso público pode ser lido', 'consultas só de leitura não provam Escrita'],
  ])('%s explains mixed PAT evidence without leaking provider details', (locale, projectReason, publicReason, writeReason) => {
    const checks = [
      { id: 'metadata', role: 'setup', scope: 'repository', permission: 'Metadata', level: 'read',
        applicability: 'required', reason: 'Resolve repository identity and visibility.', probe: 'metadata',
        status: 'unverifiable', publicReadEvidence: 'public-repository', operationallyAvailable: true,
        message: 'private diagnostic token-marker' },
      { id: 'secrets', role: 'setup', scope: 'organization', permission: 'Secrets', level: 'write',
        applicability: 'required', reason: 'Inspect and provision selected organization Actions Secrets.', probe: 'secrets',
        status: 'unverifiable', message: 'private diagnostic token-marker' },
      { id: 'projects', role: 'setup', scope: 'organization', permission: 'Projects', level: 'read',
        applicability: 'required', reason: 'Inspect selected Projects and their Status options; setup does not edit Project items.',
        probe: 'projects', status: 'verified', message: 'private diagnostic token-marker' },
    ];
    const html = markup('ContextPanel', { view: { revision: 1, repository: 'owner/repo', permissions: {
      role: 'setup', report: { role: 'setup', identityStatus: 'valid', identityMessage: 'checked',
        ready: false, confirmationRequired: true, checks },
    } } }, locale);
    expect(html).toContain(projectReason);
    expect(html).toContain(publicReason);
    expect(html).toContain(writeReason);
    expect(html).not.toContain('private diagnostic');
    expect(html).not.toContain('token-marker');
  });

  test.each([
    ['boolean', 'aria-pressed', 'yes'],
    ['choice', '<select', 'alpha'],
    ['multi-select', 'type="checkbox"', 'alpha'],
    ['scope-overrides', 'type="checkbox"', 'alpha'],
    ['text', 'type="text"', 'alpha'],
  ])('%s question presenter exposes the expected accessible control', (kind, control, defaultValue) => {
    const html = markup('QuestionPrompt', { prompt: {
      kind: 'question', title: 'Question', phase: 'full', pass: 1,
      question: { stateId: 'repository', id: 'test', label: 'A question', kind,
        defaultValue, choices: ['alpha', 'beta'], allowedNames: ['alpha', 'beta'] },
    }, controller: true, busy: false, onSubmit: noOp });
    expect(html).toContain(control);
    expect(html).toContain('A question');
  });

  test('empty issue workflow selection still has an enabled Continue control', () => {
    const html = markup('QuestionPrompt', { prompt: {
      kind: 'question', title: 'Question', phase: 'permission-intent', pass: 1,
      question: { stateId: 'capabilities', id: 'issueWorkflows.enabled', label: 'Issue workflow types',
        kind: 'multi-select', defaultValue: '', choices: ['All', 'feature — Feature'] },
    }, controller: true, busy: false, onSubmit: noOp });
    expect(html).toContain('PERMISSION PREVIEW');
    expect(html).toContain('Continue');
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Continue/);
  });
  test('coverage choice links back to the selected exact CI producer', () => {
    const html = markup('QuestionPrompt', { prompt: {
      kind: 'question', title: 'Coverage', phase: 'full', pass: 1,
      question: { stateId: 'pull-request-approval', id: 'pullRequestApproval.coverage.checkName',
        label: 'Coverage check', kind: 'choice', defaultValue: 'Tests', choices: ['Tests'],
        producerCandidates: [{ name: 'Tests', sourceAppId: 12, workflowName: 'CI',
          runUrl: 'https://github.com/acme/repo/actions/runs/42', headSha: 'a'.repeat(40), conclusion: 'success' }] },
    }, controller: true, busy: false });
    expect(html).toContain('GitHub App 12');
    expect(html).toContain('https://github.com/acme/repo/actions/runs/42');
  });
  test('suggested check card shows observed App, revision, date, and safe run link', () => {
    const html = markup('QuestionPrompt', { prompt: {
      kind: 'question', title: 'Trusted checks', phase: 'full', pass: 1,
      question: { stateId: 'pull-request-approval', id: 'pullRequestApproval.testChecks',
        label: 'Trusted checks', kind: 'producer-select', defaultValue: '',
        producerCandidates: [{ name: 'Tests', sourceAppId: 12, sourceAppName: 'GitHub Actions', workflowName: 'CI',
          runUrl: 'https://github.com/acme/repo/actions/runs/42', headSha: 'a'.repeat(40), conclusion: 'success',
          observedAt: '2026-09-29T00:00:00Z' }] },
    }, controller: true, busy: false });
    expect(html).toContain('GitHub Actions 12');
    expect(html).toContain('aaaaaaa');
    expect(html).toContain('https://github.com/acme/repo/actions/runs/42');
    expect(html).toContain('Check/job name');
    expect(html).toContain('Source GitHub App ID');
    expect(html).toContain('Workflow name');
  });

  test.each([
    ['en', 'GitHub did not allow Project discovery'],
    ['es', 'GitHub no permitió consultar Projects'],
    ['fr', 'GitHub a refusé la découverte des Projects'],
    ['pt', 'O GitHub recusou a consulta de Projects'],
  ])('%s Project selector explains permission denial and manual fallback', (locale, copy) => {
    const html = markup('QuestionPrompt', { prompt: {
      kind: 'question', title: 'Projects', phase: 'full', pass: 1,
      question: { stateId: 'projects', id: 'projects.ids', label: 'Projects', kind: 'project-select', defaultValue: '',
        discoveryStatus: 'permission-denied', projectCandidates: [], projectOwner: 'acme' },
    }, controller: true, busy: false }, locale);
    expect(html).toContain(copy);
    expect(html).toContain('PVT_');
    expect(html).toContain('manual-project');
  });

  test('Project cards show title, number and only safe official links', () => {
    const html = markup('ProjectSelector', { candidates: [
      { title: 'Roadmap', number: 5, owner: 'acme', url: 'https://github.com/orgs/acme/projects/5', statusOptions: ['Todo'] },
      { title: '<unsafe>', number: 7, owner: 'acme', url: 'https://evil.example/phish' },
    ], selected: ['5'], value: '', controller: true });
    expect(html).toContain('Roadmap');
    expect(html).toContain('#5');
    expect(html).toContain('https://github.com/orgs/acme/projects/5');
    expect(html).not.toContain('https://evil.example/phish');
    expect(html).toContain('&lt;unsafe>');
    expect(html).toContain('checked');
  });

  test('Status choice is explicit when Project options are verified', () => {
    const statusQuestion: SetupQuestion = { stateId: 'projects', id: 'projects.issueCreatedColumn', label: 'Status for new issues',
      kind: 'choice', defaultValue: 'Todo', choices: ['Todo', 'In Progress'], statusOptionState: 'observed' };
    const html = markup('QuestionPrompt', { prompt: {
      kind: 'question', title: 'Projects', phase: 'full', pass: 1,
      question: statusQuestion, presentation: setupQuestionPresentation(statusQuestion),
    }, controller: true, busy: false }, 'es');
    expect(html).toContain('Estado Status de nuevos issues');
    expect(html).toContain('value="Todo"');
    expect(html).toContain('value="In Progress"');
  });

  test('successive question revisions render their own default values', () => {
    const question = (id: string, defaultValue: string) => ({
      kind: 'question', title: 'Question', phase: 'full', pass: 1,
      question: { stateId: 'repository', id, label: id, kind: 'text', defaultValue },
    });
    const first = markup('PromptCard', { promptRevision: 7, revision: 7,
      prompt: question('first', 'alpha'), controller: true, busy: false });
    const second = markup('PromptCard', { promptRevision: 9, revision: 9,
      prompt: question('second', 'beta'), controller: true, busy: false });
    expect(first).toContain('value="alpha"');
    expect(second).toContain('value="beta"');
    expect(second).not.toContain('value="alpha"');
  });

  test('waiting state never implies that setup has completed', () => {
    const html = markup('WaitingPanel', {});
    expect(html).not.toContain('Setup completed');
  });
});
