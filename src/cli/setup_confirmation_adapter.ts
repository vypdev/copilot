import type {
  SetupPlanConfirmationPort,
  TerminalDriver,
} from '../application/ports/setup_terminal_ports';
import type { SetupPlan } from '../domain/setup';
import { color, renderBox } from './setup_prompt_rendering';
import { setupEditableGroups, setupQuestionnaireStateLabel } from '../application/policies/setup_questionnaire_policy';
import type { SetupQuestion } from '../domain/setup_questionnaire';

export class SetupPlanConfirmationAdapter implements SetupPlanConfirmationPort {
  constructor(
    private readonly terminal: TerminalDriver | undefined,
    private readonly assumeYes: boolean,
  ) {}

  async confirm(plan: SetupPlan): Promise<
    { kind: 'approved' } | { kind: 'declined' } | { kind: 'cancelled' } | { kind: 'revise'; group: SetupQuestion['stateId'] }
  > {
    if (this.assumeYes) return { kind: 'approved' };
    if (!this.terminal) return { kind: 'declined' };
    const target = plan.configuration.manageRepositoryVariables || plan.configuration.manageRepositorySecrets
      ? 'repository files and selected GitHub Actions resources'
      : 'repository files';
    const groups = setupEditableGroups(plan.configuration);
    while (true) {
      const result = await this.terminal.readText(`Approve temporary PAT permission probes, then apply this setup plan to ${target}? Tests may create and remove GitHub resources; Actions or PR tests may leave runs, notifications, or history. Type ? for details or :edit to change an answer. ${color('[N]', 90)}: `);
      if (result.kind !== 'value') return { kind: 'cancelled' };
      const value = result.value.normalize('NFKC').trim().toLowerCase();
      if (value === '?') {
        console.log(renderBox([
          `This is the final approval. The plan lists ${plan.selectedFiles.length} file(s), ${plan.variables.length} Variable(s), and ${plan.requiredSecrets.length} Secret name(s).`,
          'Yes starts the listed local and GitHub setup writes. No leaves the plan unapplied.',
          'Before setup changes, each selected write permission is tested with a temporary resource. Actions and PR tests can create visible runs, notifications, and history even after cleanup.',
          'A failure after writes begin may leave partial changes; inspect the result and run copilot doctor --read-only before retrying.',
          'PATs created on GitHub are not deleted automatically if you decline or cancel.',
          'Read more: https://docs.page/vypdev/copilot/how-to-use',
        ].join('\n'), 'Before applying setup'));
        continue;
      }
      if (value === ':edit') {
        console.log(groups.map((group, index) => `  ${index + 1}) ${setupQuestionnaireStateLabel(group)}`).join('\n'));
        const selected = await this.terminal.readText('Choose a section number (empty returns to the plan): ');
        if (selected.kind !== 'value') return { kind: 'cancelled' };
        const index = Number(selected.value.trim()) - 1;
        if (/^[1-9]\d*$/u.test(selected.value.trim()) && Number.isSafeInteger(index) && groups[index]) {
          return { kind: 'revise', group: groups[index] };
        }
        if (selected.value.trim()) console.log(color('Choose one of the listed section numbers.', 33));
        continue;
      }
      if (!value || ['n', 'no', 'false', '0'].includes(value)) return { kind: 'declined' };
      if (['y', 'yes', 'true', '1'].includes(value)) return { kind: 'approved' };
      console.log(color('Enter yes or no.', 33));
    }
  }
}

export class DryRunSetupPlanConfirmation implements SetupPlanConfirmationPort {
  async confirm(_plan: SetupPlan): Promise<{ kind: 'approved' }> {
    return { kind: 'approved' };
  }
}
