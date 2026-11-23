import { assertSetupPublisherActionManifest } from '../application/policies/setup_publisher_installation_policy';
import { createHash } from 'node:crypto';
import type { SetupPublisherInspection, SetupPublisherProposal } from '../domain/setup_publisher_installation';
import { SETUP_PUBLISHER_WORKFLOW_PATH } from '../domain/setup_publisher_installation';
import { batchObject, batchPositive, batchSha, SetupBatchGithubTransport, SetupBatchProviderError } from './setup_batch_github_read_adapter';
import { SetupPublisherGitReader } from './setup_publisher_git_reader';

const source = Object.freeze({ owner: 'vypdev', repo: 'copilot' });
const sourceId = 891781467, ownerId = 63705403;
type SourceFiles = Pick<SetupPublisherInspection['source'], 'workflow' | 'actionManifestSha256' | 'actionBundleSha256'>;

/** Source selection is authenticated provider evidence, never proposal approval flags. */
export class SetupPublisherGithubSourceAdapter {
  #cache: { readonly session: object; readonly tree: string; readonly files: SourceFiles } | undefined;
  constructor(private readonly transport: SetupBatchGithubTransport) {}

  async read(proposal: SetupPublisherProposal, token: string, session: object): Promise<SetupPublisherInspection['source']> {
    if (proposal.source.repository !== 'vypdev/copilot' || !batchSha(proposal.source.commit)
      || !batchPositive(proposal.source.pullRequest)) throw new SetupBatchProviderError('malformed');
    const repository = batchObject(await this.transport.call(token, 'GET /repos/{owner}/{repo}', source));
    if (repository?.id !== sourceId || repository.full_name !== 'vypdev/copilot'
      || batchObject(repository.owner)?.id !== ownerId || repository.archived !== false || repository.disabled !== false) {
      throw new SetupBatchProviderError('malformed');
    }
    const pull = batchObject(await this.transport.call(token, 'GET /repos/{owner}/{repo}/pulls/{pull_number}',
      { ...source, pull_number: proposal.source.pullRequest }));
    const merger = batchObject(pull?.merged_by), head = batchObject(pull?.head), base = batchObject(pull?.base);
    if (pull?.number !== proposal.source.pullRequest || pull.state !== 'closed' || pull.merged !== true
      || pull.merge_commit_sha !== proposal.source.commit || batchObject(base?.repo)?.id !== sourceId
      || !batchSha(head?.sha) || !batchPositive(merger?.id) || merger.type !== 'User'
      || typeof merger.login !== 'string' || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u.test(merger.login)) {
      throw new SetupBatchProviderError('malformed');
    }
    const permission = batchObject(await this.transport.call(token, 'GET /repos/{owner}/{repo}/collaborators/{username}/permission',
      { ...source, username: merger.login }));
    const user = batchObject(permission?.user);
    if (user?.id !== merger.id || typeof user.login !== 'string' || user.login.toLowerCase() !== merger.login.toLowerCase()
      || !['admin', 'write'].includes(String(permission?.permission))) throw new SetupBatchProviderError('forbidden');

    // An authenticated maintainer merge is the source review decision. Prove
    // its complete tree equals the selected PR head, including generated code.
    // This is not independent producer-code attestation or a human UX observation.
    const reader = new SetupPublisherGitReader(this.transport, token, source);
    const tree = await reader.commitTree(proposal.source.commit), reviewedTree = await reader.commitTree(head.sha);
    if (tree !== reviewedTree) throw new SetupBatchProviderError('malformed');
    let files = this.#cache?.session === session && this.#cache.tree === tree ? this.#cache.files : undefined;
    if (!files) {
      const read = async (path: string, maximum: number): Promise<string> => {
        const entry = await reader.find(tree, path);
        if (!entry || entry.mode !== '100644') throw new SetupBatchProviderError('malformed');
        return reader.text(entry, maximum);
      };
      const workflow = await read(SETUP_PUBLISHER_WORKFLOW_PATH, 100_000);
      const manifest = await read('action.yml', 100_000);
      try { assertSetupPublisherActionManifest(manifest); }
      catch { throw new SetupBatchProviderError('malformed'); }
      // https://docs.github.com/en/rest/git/blobs#get-a-blob: provider ceiling.
      // This bound applies only to the fixed source bundle, never destination assets.
      const bundle = await read('build/github_action/index.js', 100_000_000);
      const hash = (content: string) => createHash('sha256').update(content, 'utf8').digest('hex');
      files = Object.freeze({ workflow, actionManifestSha256: hash(manifest), actionBundleSha256: hash(bundle) });
      this.#cache = { session, tree, files };
    }
    return { repository: 'vypdev/copilot', repositoryId: sourceId, commit: proposal.source.commit,
      pullRequest: proposal.source.pullRequest, reviewedRevision: proposal.source.commit, mergedRevision: proposal.source.commit, ...files };
  }
}
