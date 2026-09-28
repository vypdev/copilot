import type { WebSetupPrompt } from '../../application/contracts/web_setup_view';
import { safeGithubLink } from '../../../web/src/lib/githubLink';
import { initialQuestionAnswer, submittedQuestionAnswer, toggleSelection } from '../../../web/src/lib/questionAnswer';

function question(kind: Extract<WebSetupPrompt, { kind: 'question' }>['question']['kind'], defaultValue: string): Extract<WebSetupPrompt, { kind: 'question' }> {
  return { kind: 'question', title: 'Choice', phase: 'full', pass: 1, question: {
    stateId: 'repository', id: 'test', label: 'A choice', kind, defaultValue,
    choices: ['All', 'One — details', 'Two — details'], allowedNames: ['one', 'two'],
  } };
}

describe('web setup presentation helpers', () => {
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
});
