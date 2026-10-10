import type { WebSetupPrompt } from '../../application/contracts/web_setup_view';
import { safeGithubLink, safeGithubRunLink, safeGithubProjectLink, safeGithubRulesetLink, repositorySecretSettingsLink } from '../../../web/src/lib/githubLink';

test('repository Secret settings links stay on the selected repository and reject untrusted navigation', () => {
  expect(repositorySecretSettingsLink('owner/repo')).toBe('https://github.com/owner/repo/settings/secrets/actions');
  expect(repositorySecretSettingsLink('owner/.github')).toBe('https://github.com/owner/.github/settings/secrets/actions');
  for (const value of [undefined, '', 'https://attacker.example/repo', 'owner/../repo', 'owner/..', 'owner/.',
    'owner/repo?token=value', 'owner/repo#fragment', 'owner/repo/extra', 'owner/<script>']) {
    expect(repositorySecretSettingsLink(value)).toBeFalsy();
  }
});
import { checkConclusionLabel } from '../../../web/src/i18n/checkEvidence';
import { manualProducerIdentity } from '../../../web/src/lib/manualProducerIdentity';
import { canSubmitPairingCode } from '../../../web/src/lib/pairingCode';
import { featureName } from '../../../web/src/i18n/featureNames';
import { focusOnRevision } from '../../../web/src/lib/focusOnRevision';
import { safeHelpLink } from '../../../web/src/lib/helpLink';
import { initialQuestionAnswer, submittedQuestionAnswer, toggleSelection } from '../../../web/src/lib/questionAnswer';

function question(kind: Extract<WebSetupPrompt, { kind: 'question' }>['question']['kind'], defaultValue: string): Extract<WebSetupPrompt, { kind: 'question' }> {
  return { kind: 'question', title: 'Choice', phase: 'full', pass: 1, question: {
    stateId: 'repository', id: 'test', label: 'A choice', kind, defaultValue,
    choices: ['All', 'One — details', 'Two — details'], allowedNames: ['one', 'two'],
  } };
}

describe('web setup presentation helpers', () => {
  test('Enter and button pairing share strict code and busy validation', () => {
    expect(canSubmitPairingCode('0123456789abcdef', false)).toBe(true);
    expect(canSubmitPairingCode('0123456789ABCDEF', false)).toBe(true);
    expect(canSubmitPairingCode(' 0123456789abcdef ', false)).toBe(true);
    for (const invalid of ['', '0123456789abcde', '0123456789abcdef0', '0123456789abcdeg']) {
      expect(canSubmitPairingCode(invalid, false)).toBe(false);
    }
    expect(canSubmitPairingCode('0123456789abcdef', true)).toBe(false);
  });
  test('focus follows a new prompt revision but not background status polls', async () => {
    const focus = jest.fn();
    const action = focusOnRevision({ isConnected: true, focus }, 1);
    await Promise.resolve();
    expect(focus).toHaveBeenCalledTimes(1);
    action.update(1);
    await Promise.resolve();
    expect(focus).toHaveBeenCalledTimes(1);
    action.update(2);
    await Promise.resolve();
    expect(focus).toHaveBeenCalledTimes(2);
    action.update(3);
    action.destroy();
    await Promise.resolve();
    expect(focus).toHaveBeenCalledTimes(2);
  });
  test('localizes observed check outcomes and feature names without inventing unknown outcomes', () => {
    expect(checkConclusionLabel('success', 'es')).toBe('Correcto');
    expect(checkConclusionLabel('future-state', 'fr')).toBe('Résultat inconnu');
    expect(featureName('credentialHealth', 'pt')).toBe('Estado das credenciais');
    expect(featureName('future-capability', 'en')).toBe('future-capability');
  });
  test.each([
    ['en', 'Stale', 'Failed to start'],
    ['es', 'Obsoleto', 'Falló al iniciar'],
    ['fr', 'Obsolète', 'Échec au démarrage'],
    ['pt', 'Obsoleto', 'Falha ao iniciar'],
  ] as const)('%s labels both uncommon GitHub check conclusions', (locale, stale, startup) => {
    expect(checkConclusionLabel('stale', locale)).toBe(stale);
    expect(checkConclusionLabel('startup_failure', locale)).toBe(startup);
  });

  test('manual producer identity accepts a numeric App ID without calling string methods on it', () => {
    expect(manualProducerIdentity(' Test ', 42, ' CI ')).toBe('Test|42|CI');
    expect(manualProducerIdentity('Test', '42', 'CI')).toBe('Test|42|CI');
    for (const invalid of [undefined, 0, -2, 1.5, '1e2', '9007199254740992']) {
      expect(manualProducerIdentity('Test', invalid, 'CI')).toBeUndefined();
    }
    expect(manualProducerIdentity('Bad|name', '42', 'CI')).toBeUndefined();
  });

  test.each([
    ['Test, lint', 'CI'],
    ['Test', 'CI, checks'],
  ])('rejects comma delimiters in manual producer %s / %s before submission', (name, workflow) => {
    expect(manualProducerIdentity(name, 42, workflow)).toBeUndefined();
  });

  test.each([
    ['https://github.com/acme/repo/rules/7', true],
    ['https://github.com/acme/repo/rules/7?token=x', false],
    ['https://evil.example/acme/repo/rules/7', false],
    ['https://github.com/acme/repo/rules/0', false],
    ['not-a-url', false],
  ])('ruleset link allowlist %s: %s', (link, allowed) => {
    expect(Boolean(safeGithubRulesetLink(link))).toBe(allowed);
  });
  test('preselects matching multi-select defaults without selecting All', () => {
    expect(initialQuestionAnswer(question('multi-select', 'One,Two'))).toEqual({
      value: 'One,Two', selected: ['One — details', 'Two — details'],
    });
  });

  test('preserves the documented All default until explicitly deselected', () => {
    const prompt = question('multi-select', 'All');
    const initial = initialQuestionAnswer(prompt);
    expect(initial).toEqual({ value: 'All', selected: ['All'] });
    expect(submittedQuestionAnswer(prompt, initial.value, initial.selected)).toBe('All');
    expect(submittedQuestionAnswer(prompt, initial.value, toggleSelection(initial.selected, 'All'))).toBe('none');
    expect(submittedQuestionAnswer(prompt, initial.value, toggleSelection(initial.selected, 'One — details'))).toBe('One — details');
  });

  test('never invents an All selection when the choices do not offer it', () => {
    const prompt = question('multi-select', 'All');
    expect(initialQuestionAnswer({ ...prompt, question: { ...prompt.question, choices: ['One — details'] } }).selected).toEqual([]);
  });

  test('a multi-select without choices starts empty and never invents an option', () => {
    const prompt = question('multi-select', 'one');
    expect(initialQuestionAnswer({ ...prompt, question: { ...prompt.question, choices: undefined } }).selected).toEqual([]);
  });

  test('a plain text question retains its default without a selection', () => {
    expect(initialQuestionAnswer(question('text', 'hello'))).toEqual({ value: 'hello', selected: [] });
  });

  test('scope overrides preserve explicit names and serialize an empty set as none', () => {
    const prompt = question('scope-overrides', 'one,two');
    expect(initialQuestionAnswer(prompt).selected).toEqual(['one', 'two']);
    expect(submittedQuestionAnswer(prompt, '', [])).toBe('none');
    expect(submittedQuestionAnswer(prompt, '', ['one'])).toBe('one');
  });

  test('observed producer defaults select exact identities and can add a manual tuple', () => {
    const prompt = { ...question('producer-select', 'Tests|12|CI'), question: {
      ...question('producer-select', 'Tests|12|CI').question,
      producerCandidates: [{ name: 'Tests', sourceAppId: 12, workflowName: 'CI',
        runUrl: 'https://github.com/acme/repo/actions/runs/1', headSha: 'a'.repeat(40), conclusion: 'success' }],
    } };
    expect(initialQuestionAnswer(prompt)).toEqual({ value: '', selected: ['Tests|12|CI'] });
    expect(submittedQuestionAnswer(prompt, 'Lint|12|CI; ', ['Tests|12|CI'])).toBe('Tests|12|CI;Lint|12|CI');
    const unmatched = { ...prompt, question: { ...prompt.question, defaultValue: 'Other|13|CI' } };
    expect(initialQuestionAnswer(unmatched)).toEqual({ value: '', selected: ['Other|13|CI'] });
  });

  test('Project defaults distinguish discovered checkboxes from manually entered numbers', () => {
    const prompt = { ...question('project-select', '2,9'), question: {
      ...question('project-select', '2,9').question, id: 'projects.ids',
      projectCandidates: [{ number: 2, title: 'Roadmap', owner: 'acme', url: 'https://github.com/orgs/acme/projects/2' }],
    } };
    expect(initialQuestionAnswer(prompt)).toEqual({ selected: ['2'], value: '9' });
    expect(submittedQuestionAnswer(prompt, '9', ['2'])).toBe('2,9');
    expect(submittedQuestionAnswer(prompt, '', [])).toBe('none');
  });

  test.each([
    ['https://github.com/orgs/acme/projects/2', true],
    ['https://github.com/users/acme/projects/2', true],
    ['https://github.com/orgs/acme/projects/2?token=x', false],
    ['https://evil.example/orgs/acme/projects/2', false],
    ['not-a-url', false],
  ])('safe Project detail link %s: %s', (link, allowed) => {
    expect(Boolean(safeGithubProjectLink(link))).toBe(allowed);
  });

  test('All is mutually exclusive with individual choices', () => {
    expect(toggleSelection(['one'], 'All')).toEqual(['All']);
    expect(toggleSelection(['All'], 'one')).toEqual(['one']);
    expect(toggleSelection(['one'], 'one')).toEqual([]);
    expect(toggleSelection(['All'], 'All')).toEqual([]);
  });

  test('ordinary question answers use the entered value', () => {
    expect(submittedQuestionAnswer(question('text', 'old'), 'new', [])).toBe('new');
    expect(submittedQuestionAnswer(question('multi-select', ''), '', ['One — details'])).toBe('One — details');
    expect(submittedQuestionAnswer(question('multi-select', 'One'), '', [])).toBe('none');
  });

  test.each([
    [undefined, false],
    ['https://github.com/settings/personal-access-tokens/new?name=Setup', true],
    ['https://github.com/settings/personal-access-tokens', true],
    ['https://evil.example/settings/personal-access-tokens', false],
    ['http://github.com/settings/personal-access-tokens', false],
    ['https://github.com/settings/keys', false],
    ['javascript:alert(1)', false],
    ['not-a-url', false],
  ])('allowlisted GitHub link %s: %s', (link, allowed) => {
    expect(Boolean(safeGithubLink(link))).toBe(allowed);
  });

  test.each([
    ['https://github.com/acme/repo/actions/runs/42', true],
    ['https://github.com/acme/repo/actions/runs/42?x=1', false],
    ['https://github.com/acme/repo/actions/runs/42#secret', false],
    ['https://evil.example/acme/repo/actions/runs/42', false],
    ['https://github.com/acme/repo/settings/secrets', false],
    ['https://github.com@evil.example/acme/repo/actions/runs/42', false],
    ['javascript:alert(1)', false],
    ['not-a-url', false],
  ])('CI run link allowlist %s: %s', (link, allowed) => {
    expect(Boolean(safeGithubRunLink(link))).toBe(allowed);
  });

  test.each([
    ['https://docs.page/vypdev/copilot/agents/model-selection', true],
    ['https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets', true],
    ['https://docs.page/vypdev/copilot/pull-requests/guarded-approval#coverage', true],
    ['https://docs.page/vypdev/copilot/agents/model-selection?token=secret', false],
    ['https://docs.page.evil.example/vypdev/copilot/agents', false],
    ['https://docs.page@evil.example/vypdev/copilot/agents', false],
    ['http://docs.page/vypdev/copilot/agents', false],
    ['https://docs.github.com/other/guide', false],
    ['javascript:alert(1)', false],
    ['not-a-url', false],
  ])('documentation link allowlist %s: %s', (link, allowed) => {
    expect(Boolean(safeHelpLink(link))).toBe(allowed);
  });

  test('absent documentation link remains absent', () => {
    expect(safeHelpLink(undefined)).toBeUndefined();
  });
});
