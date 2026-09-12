import type { TerminalDriver } from '../application/ports/setup_terminal_ports';
import type { SetupWorkflowUpdatePromptPort } from '../application/ports/setup_wizard_ports';
import type { SetupWorkflowComparison } from '../domain/setup';
import { color, renderBox } from './setup_prompt_rendering';
import { SetupTerminalCancelledError } from './setup_credential_prompt_adapter';

export class SetupWorkflowUpdatePromptAdapter implements SetupWorkflowUpdatePromptPort {
  constructor(private readonly terminal: TerminalDriver | undefined) {}

  async confirmWorkflowUpdates(
    comparisons: readonly SetupWorkflowComparison[],
    forcedByFlag: boolean,
  ): Promise<boolean> {
    const changed = comparisons.filter((comparison) =>
      comparison.status === 'changed' || comparison.status === 'unmanaged');
    if (changed.length === 0) return false;
    if (!this.terminal) return forcedByFlag;
    console.log(renderBox(
      changed.map((comparison) =>
        `  ${comparison.status === 'changed' ? '↻' : '⚠'} ${comparison.destination} (${comparison.status})`).join('\n'),
      'Existing workflows detected',
      33,
    ));
    if (forcedByFlag) {
      console.log('The --update-workflows flag makes these setup-managed workflows eligible for update.');
      return true;
    }
    while (true) {
      const result = await this.terminal.readText(
        `Update the detected workflows with this setup? ${color('[N]', 90)}: `,
      );
      if (result.kind !== 'value') throw new SetupTerminalCancelledError();
      const value = result.value.normalize('NFKC').trim().toLowerCase();
      if (!value || ['n', 'no', 'false', '0'].includes(value)) return false;
      if (['y', 'yes', 'true', '1'].includes(value)) return true;
      console.log(color('Enter yes or no.', 33));
    }
  }
}
