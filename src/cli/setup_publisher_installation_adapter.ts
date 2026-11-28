import { randomUUID } from 'node:crypto';
import { assertSetupPublisherOptions } from '../application/policies/setup_publisher_installation_policy';
import { setupBatchBranch } from '../application/policies/setup_batch_policy';
import { isSetupTokenValueValid } from '../application/policies/setup_token_value_policy';
import { resolveStaticSetupPublisherCatalog, setupPublisherEnvironmentLocale, type SetupPublisherMessageId } from '../application/policies/setup_publisher_message_catalog';
import { SetupPublisherApplyError } from '../application/usecases/setup/apply_setup_publisher_use_case';
import { SetupPublisherReviewError } from '../application/usecases/setup/review_setup_publisher_use_case';
import { SetupPublisherInstallationError } from '../application/usecases/setup/install_setup_publisher_use_case';
import { SetupPublisherPlanError } from '../application/policies/setup_publisher_plan_policy';
import { createSetupPublisherInstallationCompositionRoot } from '../infrastructure/composition/setup_publisher_installation_composition_root';
import { SetupPublisherCredentialError } from '../infrastructure/setup_publisher_credentials';
import { SetupBatchProviderError } from '../infrastructure/setup_batch_github_read_adapter';
import { createInteractiveTerminalDriver } from './setup_terminal_driver';
import { readSetupPublisherProposalFile, SetupPublisherProposalFileError } from './setup_publisher_proposal_file';
import { SetupPublisherInstallationPresenter } from './setup_publisher_installation_presenter';

export interface SetupPublisherCommandInput {
  readonly proposalPath: unknown;
  readonly explicitOptions: readonly string[];
  readonly token: unknown;
  readonly dryRun: boolean;
  readonly resumeOperation: unknown;
}
class PublisherCommandError extends Error {
  constructor(readonly reason: 'invalid' | 'tokenRequired' | 'interactiveRequired') { super(reason); }
}

/** Explicit publisher CLI only. No local Git discovery, generic config, resource probes or web setup. */
export async function executeSetupPublisherCommand(input: SetupPublisherCommandInput): Promise<void> {
  const { proposalPath, dryRun, resumeOperation, token: providedToken } = input;
  const explicitOptions = [...input.explicitOptions];
  const catalog = resolveStaticSetupPublisherCatalog(setupPublisherEnvironmentLocale(process.env));
  const write = (text: string) => process.stdout.write(text);
  const presenter = new SetupPublisherInstallationPresenter(catalog, write, process.stdout.columns);
  let installation: ReturnType<typeof createSetupPublisherInstallationCompositionRoot> | undefined;
  const operationLocation = async (id: string): Promise<string | undefined> => {
    try { return await installation?.operationLocation?.(id); }
    catch { return undefined; }
  };
  let terminal: ReturnType<typeof createInteractiveTerminalDriver>, active = true;
  const stop = () => { active = false; terminal?.close(); };
  try {
    try { assertSetupPublisherOptions(explicitOptions); }
    catch { throw new PublisherCommandError('invalid'); }
    if (typeof proposalPath !== 'string' || !proposalPath || typeof dryRun !== 'boolean') throw new PublisherCommandError('invalid');
    const proposal = readSetupPublisherProposalFile(proposalPath);
    const resume = explicitOptions.includes('resumeOperation');
    const operationId = resume ? resumeOperation : randomUUID();
    if (typeof operationId !== 'string') throw new PublisherCommandError('invalid');
    try { setupBatchBranch(operationId); }
    catch { throw new PublisherCommandError('invalid'); }
    terminal = createInteractiveTerminalDriver();
    if (!dryRun && !terminal) throw new PublisherCommandError('interactiveRequired');
    let token: unknown = explicitOptions.includes('token') ? providedToken : process.env.PERSONAL_ACCESS_TOKEN;
    // An explicit invalid/empty override never falls back to another credential.
    if (explicitOptions.includes('token') && (typeof token !== 'string' || !isSetupTokenValueValid(token))) throw new PublisherCommandError('tokenRequired');
    if (token === undefined || token === '') {
      if (!terminal) throw new PublisherCommandError('tokenRequired');
      const entered = await terminal.readSecret(catalog.message('tokenPrompt'));
      if (entered.kind !== 'value') { process.exitCode = 130; write(catalog.message('cancelled') + '\n'); return; }
      token = entered.value;
    }
    if (typeof token !== 'string' || !isSetupTokenValueValid(token)) throw new PublisherCommandError('tokenRequired');
    token = token.trim();
    process.on('SIGINT', stop);
    write(catalog.message('inspecting') + '\n');
    installation = createSetupPublisherInstallationCompositionRoot(token, {
      present: async (plan, retained) => presenter.preview(plan, retained,
        retained ? await operationLocation(retained.operationId) : undefined),
      active: () => active,
      confirm: async () => {
        const answer = await terminal!.readText(catalog.message('confirm', { approve: catalog.message('approve'), decline: catalog.message('decline') }));
        if (answer.kind !== 'value') { active = false; return 'cancel'; }
        if (answer.value.trim() === catalog.message('approve')) {
          write(catalog.message('applying') + '\n'); return 'approve';
        }
        return answer.value.trim() === catalog.message('decline') ? 'decline' : 'cancel';
      },
    }, catalog.locale);
    token = undefined;
    const result = await installation.execute({ proposal, operationId, dryRun, resume });
    if (result.stage === 'cancelled') process.exitCode = 130;
    if (result.stage === 'apply') presenter.delivered(result.result, await operationLocation(result.result.operationId));
    else write(catalog.message(result.stage === 'dry-run' ? 'dryRun' : result.stage === 'unchanged' ? 'unchanged'
      : result.stage === 'declined' ? 'declined' : 'cancelled') + '\n');
  } catch (error) {
    if (error instanceof SetupPublisherReviewError && error.reason === 'inventory' && error.blocked) {
      presenter.inventoryBlocked(error.blocked, error.retained,
        error.retained ? await operationLocation(error.retained.operationId) : undefined);
      process.exitCode = 1; return;
    }
    let message: SetupPublisherMessageId = 'blocked';
    if (error instanceof PublisherCommandError) message = error.reason;
    else if (error instanceof SetupPublisherProposalFileError) message = 'invalid';
    else if (error instanceof SetupPublisherCredentialError) message = 'tokenRequired';
    else if (error instanceof SetupPublisherPlanError) message = error.reason === 'destination-changed' ? 'stale'
      : error.reason === 'authority-unverified' ? 'authority' : error.reason === 'source-unverified' ? 'sourceUnverified' : 'unsupported';
    else if (error instanceof SetupPublisherReviewError) message = error.planFailure === 'destination-changed' ? 'stale'
      : error.planFailure === 'authority-unverified' ? 'authority' : error.planFailure === 'source-unverified' ? 'sourceUnverified'
        : error.planFailure === 'installation-unsupported' ? 'unsupported'
          : error.reason === 'cancelled' ? 'cancelled' : error.reason === 'stale' ? 'stale' : 'blocked';
    else if (error instanceof SetupPublisherApplyError) message = error.reason === 'cancelled' ? 'cancelled' : error.reason === 'stale' ? 'stale' : 'blocked';
    else if (error instanceof SetupPublisherInstallationError) message = error.reason === 'resume-missing' ? 'resumeMissing'
      : error.reason === 'resume-required' ? 'resumeRequired' : error.reason === 'invalid' ? 'invalid' : 'blocked';
    else if (error instanceof SetupBatchProviderError && error.code === 'forbidden') message = 'authority';
    write(catalog.message(message) + '\n');
    if (error instanceof SetupPublisherApplyError) presenter.operation(error.retained, error.reason === 'journal',
      await operationLocation(error.retained.operationId));
    else if (error instanceof SetupPublisherReviewError && error.retained) presenter.operation(error.retained, false,
      await operationLocation(error.retained.operationId));
    process.exitCode = message === 'cancelled' ? 130 : 1;
  } finally { process.off('SIGINT', stop); terminal?.close(); }
}
