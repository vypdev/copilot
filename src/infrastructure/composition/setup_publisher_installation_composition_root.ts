import { DeliverSetupInstallationUseCase } from '../../application/usecases/setup/deliver_setup_installation_use_case';
import type { SetupPublisherReviewPorts } from '../../application/ports/setup_publisher_review_ports';
import { setupBatchMarker } from '../../application/policies/setup_batch_policy';
import { resolveStaticSetupPublisherCatalog } from '../../application/policies/setup_publisher_message_catalog';
import { ApplySetupPublisherUseCase } from '../../application/usecases/setup/apply_setup_publisher_use_case';
import { InstallSetupPublisherUseCase } from '../../application/usecases/setup/install_setup_publisher_use_case';
import { ReviewSetupPublisherUseCase } from '../../application/usecases/setup/review_setup_publisher_use_case';
import { getOctokitClient } from '../github/octokit_client_resolver';
import type { GithubSetupBatchClient } from '../github/ports/github_setup_batch_protocol';
import { SetupBatchGithubTransport } from '../setup_batch_github_read_adapter';
import { SetupInstallationGithubDeliveryAdapter } from '../setup_installation_github_delivery_adapter';
import { SetupPublisherCredentials } from '../setup_publisher_credentials';
import { SetupPublisherGithubReadAdapter } from '../setup_publisher_github_read_adapter';
import { SetupPublisherJournalAdapter } from '../setup_publisher_journal_adapter';

export type SetupPublisherInstallationRuntime = Pick<InstallSetupPublisherUseCase, 'execute'> & {
  readonly operationLocation?: (operationId: string) => Promise<string | undefined>;
};

/** No Variables, Secret/grant inventories, label/type writers, probes or broad Setup renderer. */
export function createSetupPublisherInstallationCompositionRoot(token: unknown, presentation: Omit<SetupPublisherReviewPorts, 'inspect'>,
  locale: string = 'en-US'): SetupPublisherInstallationRuntime {
  const catalog = resolveStaticSetupPublisherCatalog(locale);
  const credentials = new SetupPublisherCredentials(token);
  const transport = new SetupBatchGithubTransport({ getClient: value => getOctokitClient<GithubSetupBatchClient>(value) });
  const readTransport = new SetupBatchGithubTransport({ getClient: value => {
    if (!presentation.active()) throw new Error('Publisher inspection cancelled.');
    return getOctokitClient<GithubSetupBatchClient>(value);
  } });
  const read = new SetupPublisherGithubReadAdapter(readTransport, credentials), journal = new SetupPublisherJournalAdapter();
  const review = new ReviewSetupPublisherUseCase({ inspect: proposal => read.inspect(proposal),
    present: (plan, retained) => presentation.present(plan, retained), confirm: plan => presentation.confirm(plan),
    active: () => presentation.active() });
  const apply = new ApplySetupPublisherUseCase({ coordinator: new DeliverSetupInstallationUseCase(), journal, active: () => presentation.active(),
    delivery: (plan, session, fresh) => credentials.bind(session, value => new SetupInstallationGithubDeliveryAdapter(transport,
      { target: plan.target, operationId: plan.operationId, digest: plan.digest, files: plan.files,
        title: catalog.message('prTitle'), body: [
          catalog.message('prBody', { commit: plan.sourceCommit }),
          setupBatchMarker(plan.operationId, plan.target.id),
        ].join('\n\n') }, value, fresh, () => presentation.active())) });
  const installation = new InstallSetupPublisherUseCase(review, apply, journal);
  return Object.freeze({ execute: installation.execute.bind(installation),
    operationLocation: (id: string) => journal.recordLocation(id) });
}
