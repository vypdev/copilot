import { createHash } from 'node:crypto';
import { setupPublisherFixture } from '../../../application/policies/__tests__/fixtures/setup_publisher_fixture';
import { SetupBatchGithubTransport } from '../../setup_batch_github_read_adapter';
import { SetupPublisherGithubSourceAdapter } from '../../setup_publisher_github_source_adapter';
import { SetupPublisherCredentials } from '../../setup_publisher_credentials';
import type { GithubSetupBatchClient } from '../../github/ports/github_setup_batch_protocol';

export const sourceId = 891781467, ownerId = 63705403, head = '4'.repeat(40), tree = '5'.repeat(40);
export const digest = (text: string) => createHash('sha256').update(text).digest('hex');
export function setupPublisherGithubSourceFixture() {
  const { proposal, inspection } = setupPublisherFixture();
  const repository: Record<string, unknown> = { id: sourceId, full_name: 'vypdev/copilot', owner: { id: ownerId }, archived: false, disabled: false };
  const pull: Record<string, unknown> = { number: proposal.source.pullRequest, state: 'closed', merged: true,
    merge_commit_sha: proposal.source.commit, merged_by: { id: 7, login: 'maintainer', type: 'User' },
    base: { repo: { id: sourceId } }, head: { sha: head } };
  const permission: Record<string, unknown> = { permission: 'write', user: { id: 7, login: 'maintainer' } };
  const files: Record<string, string> = { '.github/workflows/copilot_bugbot_status_card.yml': inspection.source.workflow,
    'action.yml': 'name: Copilot\nruns:\n  using: node24\n  main: build/github_action/index.js\n',
    'build/github_action/index.js': 'module.exports = Object.freeze({ reviewed: true });\n' };
  const trees: Record<string, { sha: string; truncated: boolean; tree: Record<string, unknown>[] }> = {};
  const blobs: Record<string, { sha: string; size: number; encoding: string; content: string }> = {};
  const treeSha = (path: string) => path ? createHash('sha1').update(path).digest('hex') : tree;
  for (const [path, content] of Object.entries(files)) {
    const segments = path.split('/');
    for (let index = 0; index < segments.length; index++) {
      const parent = treeSha(segments.slice(0, index).join('/'));
      trees[parent] ??= { sha: parent, truncated: false, tree: [] };
      if (trees[parent].tree.some(entry => entry.path === segments[index])) continue;
      if (index < segments.length - 1) trees[parent].tree.push({ path: segments[index], type: 'tree', mode: '040000', sha: treeSha(segments.slice(0, index + 1).join('/')) });
      else {
        const bytes = Buffer.from(content), sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
        trees[parent].tree.push({ path: segments[index], type: 'blob', mode: '100644', sha, size: bytes.length });
        blobs[sha] = { sha, size: bytes.length, encoding: 'base64', content: bytes.toString('base64') };
      }
    }
  }
  const commits: Record<string, { sha: string; tree: { sha: string } }> = {
    [proposal.source.commit]: { sha: proposal.source.commit, tree: { sha: tree } }, [head]: { sha: head, tree: { sha: tree } },
  };
  const request = jest.fn<ReturnType<GithubSetupBatchClient['request']>, Parameters<GithubSetupBatchClient['request']>>(async (route, p) => {
    if (!route.startsWith('GET ') || p.owner !== 'vypdev' || p.repo !== 'copilot') throw new Error('not a fixed source read');
    if (route === 'GET /repos/{owner}/{repo}') return { data: repository };
    if (route.endsWith('/pulls/{pull_number}')) return { data: pull };
    if (route.endsWith('/permission')) return { data: permission };
    if (route.endsWith('/git/commits/{commit_sha}')) return { data: commits[String(p.commit_sha)] };
    if (route.endsWith('/git/trees/{tree_sha}')) return { data: trees[String(p.tree_sha)] };
    if (route.endsWith('/git/blobs/{file_sha}')) return { data: blobs[String(p.file_sha)] };
    throw new Error('unexpected source read');
  });
  const credentials = new SetupPublisherCredentials('private-source-fixture');
  const adapter = new SetupPublisherGithubSourceAdapter(new SetupBatchGithubTransport({ getClient: () => ({ request }) }));
  const read = () => credentials.read((token, session) => adapter.read(proposal, token, session));
  return { proposal, repository, pull, permission, files, trees, blobs, commits, request, credentials, adapter, read };
}
