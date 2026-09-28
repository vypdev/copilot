import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

function markup(name: string, props: Record<string, unknown>): string {
  return execFileSync(process.execPath, [
    resolve(__dirname, '../../../scripts/render-web-setup-component.cjs'), name, JSON.stringify(props),
  ], { encoding: 'utf8' });
}

const noOp = async (): Promise<void> => undefined;

describe('web setup component semantics', () => {
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
        files: ['AGENTS.md'], workflows: ['copilot.yml'], variables: ['MAIN_BRANCH'], secrets: ['PAT'], warnings: [],
      } }, controller: true, busy: false, onSubmit: noOp,
    });
    for (const item of ['AGENTS.md', 'copilot.yml', 'MAIN_BRANCH', 'PAT']) expect(html).toContain(item);
    expect(html).toContain('Approve');
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
  });

  test('permission evidence labels missing grants instead of implying access', () => {
    const html = markup('ContextPanel', { view: { revision: 1, repository: 'owner/repo', permissions: {
      role: 'setup', report: { checks: [{ permission: 'Secrets', scope: 'repository', level: 'write',
        applicability: 'required', reason: 'Provision Actions Secret', status: 'missing' }] },
    } } });
    expect(html).toContain('Setup PAT');
    expect(html).toContain('required');
    expect(html).toContain('missing');
    expect(html).toContain('Provision Actions Secret');
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

  test('waiting state never implies that setup has completed', () => {
    const html = markup('WaitingPanel', {});
    expect(html).not.toContain('Setup completed');
  });
});
