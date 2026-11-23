import { createHash } from 'node:crypto';
import { setupPublisherFixture as planningFixture } from '../../application/policies/__tests__/fixtures/setup_publisher_fixture';
import { planSetupPublisherInstallation } from '../../application/policies/setup_publisher_plan_policy';
import { setupPublisherGithubSourceFixture as fixture, sourceId, head, tree, digest } from './fixtures/setup_publisher_github_source_fixture';

it('derives exact source facts from an authenticated maintainer merge and equal complete reviewed trees', async () => {
  const f = fixture(); f.proposal.source.merged = false; f.proposal.source.maintainerApproval = 'still only untrusted prose';
  expect(await f.read()).toEqual({ repository: 'vypdev/copilot', repositoryId: sourceId,
    commit: f.proposal.source.commit, pullRequest: f.proposal.source.pullRequest,
    reviewedRevision: f.proposal.source.commit, mergedRevision: f.proposal.source.commit,
    workflow: f.files['.github/workflows/copilot_bugbot_status_card.yml'],
    actionManifestSha256: digest(f.files['action.yml']), actionBundleSha256: digest(f.files['build/github_action/index.js']) });
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
  expect(f.request.mock.calls.filter(([route]) => route.includes('/git/blobs/'))).toHaveLength(3);
  expect(JSON.stringify(f.adapter)).not.toContain('private-source-fixture');
});
it.each([{ repository: 'attacker/copilot' }, { commit: 'main' }, { pullRequest: 0 }])('rejects an invalid source selector without requests', async change => {
  const f = fixture(); Object.assign(f.proposal.source, change); await expect(f.read()).rejects.toMatchObject({ code: 'malformed' }); expect(f.request).not.toHaveBeenCalled();
});
it.each([{ id: 42 }, { full_name: 'attacker/copilot' }, { owner: { id: 42 } }, { archived: true }, { disabled: true }, { owner: null }])(
  'does not accept a renamed, replaced, unknown or disabled source repository', async change => {
    const f = fixture(); Object.assign(f.repository, change); await expect(f.read()).rejects.toMatchObject({ code: 'malformed' }); expect(f.request).toHaveBeenCalledTimes(1);
  });
it('rejects a missing source repository response', async () => {
  const f = fixture(); f.request.mockResolvedValue({ data: null }); await expect(f.read()).rejects.toMatchObject({ code: 'malformed' });
});
it.each([{ number: 1 }, { state: 'open' }, { merged: false }, { merge_commit_sha: head }, { base: { repo: { id: 42 } } },
  { base: null }, { head: null }, { head: { sha: 'main' } }, { merged_by: null },
  { merged_by: { id: 0, login: 'maintainer', type: 'User' } }, { merged_by: { id: 7, login: 'maintainer', type: 'Bot' } },
  { merged_by: { id: 7, login: 7, type: 'User' } }, { merged_by: { id: 7, login: '../admin', type: 'User' } }])(
  'never substitutes proposal approval flags for exact merged PR and merger evidence', async change => {
    const f = fixture(); f.proposal.source.merged = true; f.proposal.source.maintainerApproval = 'approved'; Object.assign(f.pull, change);
    await expect(f.read()).rejects.toMatchObject({ code: 'malformed' }); expect(f.request).toHaveBeenCalledTimes(2);
  });
it('rejects a missing PR response', async () => {
  const f = fixture(); f.request.mockResolvedValueOnce({ data: f.repository }).mockResolvedValueOnce({ data: [] }); await expect(f.read()).rejects.toMatchObject({ code: 'malformed' });
});
it.each([{ permission: 'read' }, { permission: undefined }, { user: { id: 8, login: 'maintainer' } },
  { user: { id: 7, login: 'other' } }, { user: { id: 7 } }, { user: null }])(
  'requires current source-maintainer authority paired to the actual merger identity', async change => {
    const f = fixture(); Object.assign(f.permission, change); await expect(f.read()).rejects.toMatchObject({ code: 'forbidden' }); expect(f.request).toHaveBeenCalledTimes(3);
  });
it('rejects unavailable source authority without reading source blobs', async () => {
  const f = fixture(); f.request.mockResolvedValueOnce({ data: f.repository }).mockResolvedValueOnce({ data: f.pull }).mockResolvedValueOnce({ data: null });
  await expect(f.read()).rejects.toMatchObject({ code: 'forbidden' }); expect(f.request).toHaveBeenCalledTimes(3);
});
it('accepts an authenticated administrator and case-normalized identity without changing the source', async () => {
  const f = fixture(); f.permission.permission = 'admin'; f.permission.user = { id: 7, login: 'Maintainer' }; expect((await f.read()).commit).toBe(f.proposal.source.commit);
});
it('rejects a merge whose complete tree differs from the selected reviewed PR head', async () => {
  const f = fixture(); f.commits[head].tree.sha = '6'.repeat(40); await expect(f.read()).rejects.toMatchObject({ code: 'malformed' });
  expect(f.request.mock.calls.some(([route]) => route.includes('/git/blobs/'))).toBe(false);
});
it('requires each canonical source asset and does not infer an absent blob from a successful PR lookup', async () => {
  const f = fixture(); f.trees[tree].tree = f.trees[tree].tree.filter(entry => entry.path !== 'action.yml');
  await expect(f.read()).rejects.toMatchObject({ code: 'malformed' });
});
it('rejects a nonregular or executable canonical workflow before loading its bytes', async () => {
  const f = fixture(); const entry = Object.values(f.trees).flatMap(t => t.tree).find(e => e.path === 'copilot_bugbot_status_card.yml')!;
  entry.mode = '100755'; await expect(f.read()).rejects.toMatchObject({ code: 'malformed' });
  expect(f.request.mock.calls.some(([route]) => route.includes('/git/blobs/'))).toBe(false);
});
it('reuses immutable bytes only within the same credential generation while rechecking source/PR/authority/commit metadata', async () => {
  const f = fixture(); const first = await f.read(); f.request.mockClear(); expect(await f.read()).toEqual(first);
  expect(f.request).toHaveBeenCalledTimes(5); expect(f.request.mock.calls.some(([route]) => /\/git\/(?:trees|blobs)\//u.test(route))).toBe(false);
  f.credentials.replace('new-private-source-fixture'); f.request.mockClear(); expect(await f.read()).toEqual(first);
  expect(f.request.mock.calls.filter(([route]) => route.includes('/git/blobs/'))).toHaveLength(3);
});
it('cached immutable files cannot mask revoked merger authority or changed merge identity', async () => {
  const f = fixture(); await f.read(); f.permission.permission = 'read'; await expect(f.read()).rejects.toMatchObject({ code: 'forbidden' });
  f.permission.permission = 'write'; f.pull.merge_commit_sha = head; await expect(f.read()).rejects.toMatchObject({ code: 'malformed' });
});
it('invalidates the file cache when the independently verified source tree changes', async () => {
  const f = fixture(); await f.read(); const replacement = '7'.repeat(40);
  f.commits[f.proposal.source.commit].tree.sha = replacement; f.commits[head].tree.sha = replacement;
  f.trees[replacement] = { ...f.trees[tree], sha: replacement }; f.request.mockClear(); await f.read();
  expect(f.request.mock.calls.filter(([route]) => route.includes('/git/blobs/'))).toHaveLength(3);
});
it('a provider denial remains a denial and cannot become a positive source observation', async () => {
  const f = fixture(); f.request.mockRejectedValue({ status: 403, response: { data: 'do not render this provider payload' } });
  await expect(f.read()).rejects.toMatchObject({ code: 'forbidden' }); expect(f.request).toHaveBeenCalledTimes(1);
});

function replaceActionManifest(f: ReturnType<typeof fixture>, manifest: string): void {
  const entry = f.trees[tree].tree.find(item => item.path === 'action.yml')!;
  const bytes = Buffer.from(manifest), sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  f.files['action.yml'] = manifest; entry.sha = sha; entry.size = bytes.length;
  f.blobs[sha] = { sha, size: bytes.length, encoding: 'base64', content: bytes.toString('base64') };
}
async function readAndPlanSource(f: ReturnType<typeof fixture>) {
  f.proposal.source.actionManifestSha256 = digest(f.files['action.yml']);
  f.proposal.source.actionBundleSha256 = digest(f.files['build/github_action/index.js']);
  const baseline = planningFixture(), source = await f.read();
  return planSetupPublisherInstallation(f.proposal, { ...baseline.inspection, source }, '11111111-1111-4111-8111-111111111111');
}
it.each(['main', 'pre', 'post'])(
  'publisher977-C112 composed: rejects redirected %s despite matching manifest and fixed-bundle pins', async role => {
    const valid = fixture(); expect((await readAndPlanSource(valid)).status).toBe('review');
    const f = fixture(), manifest = role === 'main'
      ? f.files['action.yml'].replace('main: build/github_action/index.js', 'main: unmeasured.js')
      : f.files['action.yml'] + `  ${role}: unmeasured.js\n`;
    replaceActionManifest(f, manifest);
    await expect(readAndPlanSource(f)).rejects.toMatchObject({ code: 'malformed' });
    expect(f.proposal.source.actionManifestSha256).toBe(digest(manifest));
    expect(f.proposal.source.actionBundleSha256).toBe(digest(f.files['build/github_action/index.js']));
    expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
    expect(f.request.mock.calls.filter(([route]) => route.includes('/git/blobs/'))).toHaveLength(2);
  });
