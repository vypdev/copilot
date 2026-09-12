import type {
  SetupPlanConfirmationPort,
  TerminalDriver,
} from '../application/ports/setup_terminal_ports';
import type { SetupPlan } from '../domain/setup';
import { color } from './setup_prompt_rendering';

export class SetupPlanConfirmationAdapter implements SetupPlanConfirmationPort {
  constructor(
    private readonly terminal: TerminalDriver | undefined,
    private readonly assumeYes: boolean,
  ) {}

  async confirm(plan: SetupPlan): Promise<
    { kind: 'approved' } | { kind: 'declined' } | { kind: 'cancelled' }
  > {
    if (this.assumeYes) return { kind: 'approved' };
    if (!this.terminal) return { kind: 'declined' };
    const target = plan.configuration.manageRepositoryVariables
      ? 'the repository and GitHub Variables'
      : 'the repository';
    while (true) {
      const result = await this.terminal.readText(`Apply this setup plan to ${target}? ${color('[N]', 90)}: `);
      if (result.kind !== 'value') return { kind: 'cancelled' };
      const value = result.value.normalize('NFKC').trim().toLowerCase();
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
