import type { SetupQuestionRenderer } from '../application/ports/setup_terminal_ports';
import type { SetupQuestion } from '../domain/setup_questionnaire';
import { color, renderBox } from './setup_prompt_rendering';
import { setupQuestionnaireStateLabel } from '../application/policies/setup_questionnaire_policy';

export class ConsoleSetupQuestionRenderer implements SetupQuestionRenderer {
  showIntroduction(): void {
    console.log(renderBox(
      'This wizard configures repository workflows, GitHub Actions resources, AI agents, and operational defaults.\n\nThe setup PAT is used in memory only. Runtime credentials are collected separately after the plan is approved.',
      'Copilot Setup',
    ));
  }

  showState(stateId: SetupQuestion['stateId']): void {
    console.log(color(`\n${setupQuestionnaireStateLabel(stateId)}\n`, 36));
  }

  renderPrompt(question: SetupQuestion): string {
    const fallback = formatDefault(question.defaultValue);
    if (question.kind === 'choice') {
      const choices = question.choices ?? [];
      const lines = choices.map((choice, index) =>
        `  ${index + 1}) ${choice}${choice === question.defaultValue ? color(' (default)', 90) : ''}`);
      return [question.label, ...lines, `Select 1-${choices.length} ${color(`[${choices.indexOf(String(question.defaultValue)) + 1}]`, 90)}: `].join('\n');
    }
    if (question.kind === 'scope-overrides' && question.allowedNames?.length) {
      return `${question.label}\n  Available: ${question.allowedNames.join(', ')}; enter "none" to inherit all\n  ${color(`[${fallback}]`, 90)}: `;
    }
    return `${question.label} ${color(`[${fallback}]`, 90)}: `;
  }

  showValidation(message: string): void {
    console.log(color(message, 33));
  }

  showCancelled(): void {
    console.log('Setup cancelled. No changes were applied.');
  }
}

function formatDefault(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'Y' : 'N';
  return String(value) || 'none';
}
