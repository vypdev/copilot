import { setupInstallationTreeFixture } from './setup_installation_tree_fixture';
import { createHash } from 'node:crypto';
import { setupPublisherFixture } from '../../../application/policies/__tests__/fixtures/setup_publisher_fixture';
import { SetupBatchGithubTransport } from '../../setup_batch_github_read_adapter';
import { SetupPublisherGithubReadAdapter } from '../../setup_publisher_github_read_adapter';
import { setupPublisherGithubSourceFixture } from './setup_publisher_github_source_fixture';

export const operation = '11111111-1111-4111-8111-111111111111';
export function setupPublisherGithubFixture() {
  const f = setupPublisherGithubSourceFixture(), baseline = setupPublisherFixture();
  const files = [baseline.inspection.installation.manifest!, ...baseline.inspection.installation.guidance,
    { path: '.github/workflows/ci.yml', mode: '100755', content: 'name: CI\non: push\njobs:\n  ci:\n    steps: []\n' }];
  const baseFiles = new Map(files.map(file => [file.path, file.content]));
  const modes = new Map(files.map(file => [file.path, file.mode as '100644' | '100755']));
  const actual = setupInstallationTreeFixture(baseFiles, modes), root = actual.root;
  const blobs: Record<string, { sha: string; size: number; encoding: string; content: string }> = {};
  for (const content of baseFiles.values()) {
    const bytes = Buffer.from(content), sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    blobs[sha] = { sha, size: bytes.length, encoding: 'base64', content: bytes.toString('base64') };
  }
  const trees = Object.fromEntries([...actual.trees].map(([sha, value]) => [sha, { ...value,
    tree: value.tree.map(entry => ({ ...entry, ...(entry.type === 'blob' ? { size: blobs[entry.sha].size } : {}) })) as Record<string, unknown>[] }]));
  const repository: Record<string, unknown> = { id: 42, name: 'project', full_name: 'owner/project',
    owner: { id: 9, login: 'owner', type: 'Organization' }, default_branch: 'main', private: true, archived: false, disabled: false, permissions: { push: true } };
  const ref: Record<string, unknown> = { ref: 'refs/heads/main', object: { sha: f.proposal.destination.head, type: 'commit' } };
  const identity: { data: unknown; headers?: Record<string, unknown> } = { data: { id: 7 }, headers: { 'x-oauth-scopes': 'repo, workflow' } };
  const original = f.request.getMockImplementation()!;
  f.request.mockImplementation(async (route, p) => {
    if (route === 'GET /user') return identity;
    if (p.owner === 'vypdev') return original(route, p);
    if (!route.startsWith('GET ') || p.owner !== 'owner' || p.repo !== 'project') throw new Error('outside destination scope');
    if (route === 'GET /repos/{owner}/{repo}') return { data: repository };
    if (route.endsWith('/git/ref/{ref}')) return { data: ref };
    if (route.endsWith('/git/commits/{commit_sha}')) return { data: { sha: f.proposal.destination.head, tree: { sha: root } } };
    if (route.endsWith('/git/trees/{tree_sha}')) return { data: trees[String(p.tree_sha)] };
    if (route.endsWith('/git/blobs/{file_sha}')) return { data: blobs[String(p.file_sha)] };
    throw new Error('unexpected destination route');
  });
  const reader = new SetupPublisherGithubReadAdapter(new SetupBatchGithubTransport({ getClient: () => ({ request: f.request }) }), f.credentials);
  const entries = () => Object.values(trees).flatMap(tree => tree.tree);
  const replace = (path: string, content: string) => {
    const entry = entries().find(e => e.path === path)!, bytes = Buffer.from(content);
    const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'); entry.sha = sha; entry.size = bytes.length;
    blobs[sha] = { sha, size: bytes.length, encoding: 'base64', content: bytes.toString('base64') };
  };
  return { ...f, reader, repository, ref, identity, trees, blobs, entries, replace, baseline, baseFiles, modes };
}
