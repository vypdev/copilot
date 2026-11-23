import type { SetupPublisherJournalPort } from '../../ports/setup_publisher_apply_ports';
import { setupBatchBranch } from '../../policies/setup_batch_policy';
import { parseSetupPublisherOperation, parseSetupPublisherProposal } from '../../policies/setup_publisher_installation_policy';
import { ApplySetupPublisherUseCase } from './apply_setup_publisher_use_case';
import { ReviewSetupPublisherUseCase } from './review_setup_publisher_use_case';

export class SetupPublisherInstallationError extends Error {
  constructor(readonly reason: 'invalid' | 'journal' | 'resume-missing' | 'resume-required') {
    super(`Publisher installation stopped: ${reason}. Inspect the retained operation and prepare a fresh review.`);
  }
}

/** Load and disclose retained effects before fresh review; no approval inferred from storage. */
export class InstallSetupPublisherUseCase {
  constructor(private readonly review: ReviewSetupPublisherUseCase, private readonly apply: ApplySetupPublisherUseCase,
    private readonly journal: Pick<SetupPublisherJournalPort, 'load'>) {}

  async execute(input: { readonly proposal: unknown; readonly operationId: string; readonly dryRun: boolean; readonly resume: boolean }) {
    const { operationId, dryRun, resume } = input;
    const proposal = (() => {
      try {
        setupBatchBranch(operationId);
        if (typeof dryRun !== 'boolean' || typeof resume !== 'boolean') throw new SetupPublisherInstallationError('invalid');
        return parseSetupPublisherProposal(input.proposal);
      } catch { throw new SetupPublisherInstallationError('invalid'); }
    })();
    const retained = await (async () => {
      try {
        const value = await this.journal.load(operationId);
        if (value === undefined) return undefined;
        const operation = parseSetupPublisherOperation(value);
        return Object.freeze({ ...operation, effects: Object.freeze([...operation.effects]) });
      } catch { throw new SetupPublisherInstallationError('journal'); }
    })();
    if (resume && !retained) throw new SetupPublisherInstallationError('resume-missing');
    if (!resume && retained) throw new SetupPublisherInstallationError('resume-required');
    return this.review.execute({ proposal, operationId, dryRun, reviewedOperation: retained },
      (plan, session, fresh) => this.apply.execute(plan, session, fresh, retained));
  }
}
