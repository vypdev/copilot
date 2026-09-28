import type { WebSetupPrompt } from '../../../src/application/contracts/web_setup_view';

type QuestionPrompt = Extract<WebSetupPrompt, { kind: 'question' }>;

export function initialQuestionAnswer(prompt: QuestionPrompt): { value: string; selected: string[] } {
  const value = String(prompt.question.defaultValue);
  const defaults = value.split(',').map(item => item.trim()).filter(Boolean);
  const selected = prompt.question.kind === 'multi-select'
    ? (prompt.question.choices ?? []).filter(item => item !== 'All' && defaults.includes(item.split(' — ')[0]))
    : prompt.question.kind === 'scope-overrides' ? defaults : [];
  return { value, selected };
}

export function toggleSelection(selected: string[], item: string): string[] {
  if (item === 'All') return selected.includes('All') ? [] : ['All'];
  return selected.includes(item)
    ? selected.filter(candidate => candidate !== item)
    : [...selected.filter(candidate => candidate !== 'All'), item];
}

export function submittedQuestionAnswer(prompt: QuestionPrompt, value: string, selected: string[]): string {
  if (prompt.question.kind === 'scope-overrides') return selected.length ? selected.join(',') : 'none';
  if (prompt.question.kind === 'multi-select') return selected.length ? selected.join(',') : 'none';
  return value;
}
