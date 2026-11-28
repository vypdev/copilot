import type { SetupPublisherReadSnapshot } from '../application/ports/setup_publisher_review_ports';
import type { SetupBatchTarget } from '../domain/setup_batch';
import { SETUP_PUBLISHER_WORKFLOW_PATH, type SetupPublisherObservedFile, type SetupPublisherProposal } from '../domain/setup_publisher_installation';
import { parseSetupPublisherProposal, setupPublisherWorkflow } from '../application/policies/setup_publisher_installation_policy';
import { parseRepositoryAgentGuidanceManifest } from '../application/policies/repository_agent_guidance_policy';
import { SETUP_INSTALLATION_MANIFEST_PATH } from '../application/policies/setup_installation_receipt_policy';
import { validateSetupBatchTargets } from '../application/policies/setup_batch_policy';
import { batchObject, batchPositive, batchSha, SetupBatchGithubTransport, SetupBatchProviderError } from './setup_batch_github_read_adapter';
import { SetupPublisherCredentials } from './setup_publisher_credentials';
import { SetupPublisherGitReader, type SetupPublisherGitEntry } from './setup_publisher_git_reader';
import { SetupPublisherGithubSourceAdapter } from './setup_publisher_github_source_adapter';
import { inspectSetupPublisherWorkflows } from './setup_publisher_workflow_inventory';
import { SetupPublisherInventoryReviewAdapter } from './setup_publisher_inventory_review_adapter';

/** One relevant authenticated snapshot, paired to a private credential generation. */
export class SetupPublisherGithubReadAdapter {
  private readonly source: SetupPublisherGithubSourceAdapter;
  private readonly inventory: SetupPublisherInventoryReviewAdapter;
  constructor(private readonly transport: SetupBatchGithubTransport, private readonly credentials: SetupPublisherCredentials) {
    this.source = new SetupPublisherGithubSourceAdapter(transport);
    this.inventory = new SetupPublisherInventoryReviewAdapter(transport);
  }

  async inspect(input: SetupPublisherProposal): Promise<SetupPublisherReadSnapshot> {
    const proposal = parseSetupPublisherProposal(input);
    return this.credentials.read(async (token, session) => {
      const identity = await this.transport.identity(token), actor = batchObject(identity.user);
      if (!batchPositive(actor?.id)) throw new SetupBatchProviderError('malformed');
      const [owner, repo] = proposal.destination.repository.split('/'), coordinate = { owner, repo };
      const data = batchObject(await this.transport.call(token, 'GET /repos/{owner}/{repo}', coordinate));
      const account = batchObject(data?.owner), permissions = batchObject(data?.permissions);
      if (!data || !batchPositive(data.id) || !batchPositive(account?.id) || typeof account.login !== 'string'
        || account.login.toLowerCase() !== owner.toLowerCase() || typeof data.name !== 'string' || data.name.toLowerCase() !== repo.toLowerCase()
        || typeof data.full_name !== 'string' || data.full_name.toLowerCase() !== proposal.destination.repository.toLowerCase()
        || typeof data.default_branch !== 'string' || typeof data.private !== 'boolean'
        || typeof data.archived !== 'boolean' || typeof data.disabled !== 'boolean') throw new SetupBatchProviderError('malformed');
      const ref = batchObject(await this.transport.call(token, 'GET /repos/{owner}/{repo}/git/ref/{ref}',
        { ...coordinate, ref: `heads/${data.default_branch}` })), object = batchObject(ref?.object);
      if (ref?.ref !== `refs/heads/${data.default_branch}` || object?.type !== 'commit' || !batchSha(object.sha)) {
        throw new SetupBatchProviderError('malformed');
      }
      const target: SetupBatchTarget = { id: data.id, ownerId: account.id, owner: account.login, name: data.name,
        defaultBranch: data.default_branch, baseSha: object.sha, private: data.private, archived: data.archived,
        disabled: data.disabled, canPush: permissions?.push === true || permissions?.admin === true };
      // Validate provider-selected names/refs before any tree or file lookup.
      if (validateSetupBatchTargets(target.owner, [target]).length) throw new SetupBatchProviderError('forbidden');
      const scopes = identity.oauthScopes;
      const repositoryGrant = scopes?.includes('repo') || !target.private && scopes?.includes('public_repo');
      const authority = { actorId: actor.id, repositoryId: target.id,
        contents: scopes === null ? 'unknown' as const : repositoryGrant ? 'write' as const : 'denied' as const,
        pullRequests: scopes === null ? 'unknown' as const : repositoryGrant ? 'write' as const : 'denied' as const,
        workflows: scopes === null ? 'unknown' as const : repositoryGrant && scopes.includes('workflow') ? 'write' as const : 'denied' as const };
      const source = await this.source.read(proposal, token, session);
      const expected = setupPublisherWorkflow(source.workflow, source.commit);
      const reader = new SetupPublisherGitReader(this.transport, token, coordinate), root = await reader.commitTree(target.baseSha);
      let bytes = 0, count = 0;
      const load = async (path: string, entry: SetupPublisherGitEntry): Promise<SetupPublisherObservedFile> => {
        bytes += entry.size ?? 0;
        if (++count > 300 || bytes > 2_000_000) throw new SetupBatchProviderError('malformed');
        return { path, mode: entry.mode, content: await reader.text(entry, 100_000) };
      };
      const file = async (path: string): Promise<SetupPublisherObservedFile | null> => {
        const entry = await reader.find(root, path); return entry ? load(path, entry) : null;
      };
      const manifest = await file(SETUP_INSTALLATION_MANIFEST_PATH);
      const parsed = manifest && parseRepositoryAgentGuidanceManifest(manifest.content);
      if (!parsed) throw new SetupBatchProviderError('malformed');
      const guidance: SetupPublisherObservedFile[] = [];
      for (const path of Object.keys(parsed.artifacts)) {
        const observed = await file(path); if (!observed) throw new SetupBatchProviderError('malformed'); guidance.push(observed);
      }
      const directory = await reader.find(root, '.github/workflows');
      if (directory && (directory.type !== 'tree' || directory.mode !== '040000')) throw new SetupBatchProviderError('malformed');
      const workflows: SetupPublisherObservedFile[] = [];
      for (const entry of directory ? await reader.tree(directory.sha) : []) {
        const path = `.github/workflows/${entry.path}`;
        if ((entry.type === 'tree' || entry.type === 'commit') && path !== SETUP_PUBLISHER_WORKFLOW_PATH || !/\.ya?ml$/iu.test(entry.path)) continue;
        workflows.push(await load(path, entry));
      }
      const inventoryReview = proposal.schemaVersion === 2 ? await this.inventory.inspect(proposal, { target, source, tree: root, workflows }, token) : undefined;
      return { session, inspection: { target, authority, source, installation: { complete: true, manifest,
        guidance, workflows, publisher: inspectSetupPublisherWorkflows(workflows, expected, inventoryReview),
        ...(inventoryReview ? { inventoryReview } : {}) } } };
    });
  }
}
