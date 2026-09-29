import type { WebSetupPrompt } from '../../../src/application/contracts/web_setup_view';

type QuestionPrompt = Extract<WebSetupPrompt, { kind: 'question' }>;

export function initialQuestionAnswer(prompt: QuestionPrompt): { value: string; selected: string[] } {
  const value = String(prompt.question.defaultValue);
  const defaults = value.split(',').map(item => item.trim()).filter(Boolean);
  const selected = prompt.question.kind === 'multi-select'
    ? defaults.includes('All') && prompt.question.choices?.includes('All') ? ['All']
      : (prompt.question.choices ?? []).filter(item => item !== 'All' && defaults.includes(item.split(' — ')[0]))
    : prompt.question.kind === 'scope-overrides' ? defaults
      : prompt.question.kind === 'producer-select' ? value.split(';').map(item => item.trim()).filter(Boolean)
        : prompt.question.kind === 'project-select' ? defaults.filter(number =>
          prompt.question.projectCandidates?.some(candidate => String(candidate.number) === number)) : [];
  const manualProjects = prompt.question.kind === 'project-select'
    ? defaults.filter(number => !selected.includes(number)).join(',') : value;
  return { value: prompt.question.kind === 'producer-select' ? '' : manualProjects, selected };
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
  if (prompt.question.kind === 'producer-select') return [...selected, ...value.split(';').map(item => item.trim()).filter(Boolean)].join(';');
  if (prompt.question.kind === 'project-select') return [...selected, ...value.split(',').map(item => item.trim()).filter(Boolean)].join(',') || 'none';
  return value;
}
