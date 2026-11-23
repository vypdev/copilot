import { createHash } from 'node:crypto';
import { SetupBatchGithubTransport } from '../setup_batch_github_read_adapter';
import { SetupPublisherGitReader, type SetupPublisherGitEntry } from '../setup_publisher_git_reader';
import type { GithubSetupBatchClient } from '../github/ports/github_setup_batch_protocol';

const root = '1'.repeat(40), nested = '2'.repeat(40), commit = '3'.repeat(40);
const treeEntry = { path: 'directory', type: 'tree', mode: '040000', sha: nested };
function fixture(bytes = Buffer.from('Readable UTF-8: año\n')) {
  const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  const entry: SetupPublisherGitEntry = { path: 'file.yml', type: 'blob', mode: '100644', sha, size: bytes.length };
  const blob: Record<string, unknown> = { sha, size: bytes.length, encoding: 'base64', content: bytes.toString('base64') };
  const trees: Record<string, Record<string, unknown>> = {
    [root]: { sha: root, truncated: false, tree: [treeEntry] },
    [nested]: { sha: nested, truncated: false, tree: [entry] },
  };
  const object: Record<string, unknown> = { sha: commit, tree: { sha: root } };
  const request = jest.fn<ReturnType<GithubSetupBatchClient['request']>, Parameters<GithubSetupBatchClient['request']>>(
    async (route, parameters) => {
      if (route === 'GET /repos/{owner}/{repo}/git/commits/{commit_sha}') return { data: object };
      if (route === 'GET /repos/{owner}/{repo}/git/trees/{tree_sha}') return { data: trees[String(parameters.tree_sha)] };
      if (route === 'GET /repos/{owner}/{repo}/git/blobs/{file_sha}') return { data: blob };
      throw new Error('unexpected route');
    });
  const reader = new SetupPublisherGitReader(new SetupBatchGithubTransport({ getClient: () => ({ request }) }),
    'private-fixture-credential', { owner: 'owner', repo: 'project' });
  return { reader, request, entry, blob, trees, object, bytes };
}

it('reads an exact pinned commit and complete nonrecursive ancestors with immutable cached entries', async () => {
  const f = fixture();
  expect(await f.reader.commitTree(commit)).toBe(root);
  expect(await f.reader.find(root, 'directory/file.yml')).toEqual(f.entry);
  expect(await f.reader.text(f.entry, 100_000)).toBe(f.bytes.toString('utf8'));
  const tree = await f.reader.tree(nested); expect(Object.isFrozen(tree)).toBe(true); expect(Object.isFrozen(tree[0])).toBe(true);
  expect(await f.reader.find(root, 'directory/file.yml')).toBe(tree[0]);
  expect(f.request.mock.calls.filter(([route]) => route.includes('/git/trees/'))).toHaveLength(2);
  expect(f.request.mock.calls.every(([route, parameters]) => route.startsWith('GET ') && parameters.owner === 'owner'
    && parameters.repo === 'project' && !('recursive' in parameters))).toBe(true);
  expect(JSON.stringify(f.reader)).not.toContain('private-fixture-credential');
});
it.each(['short', 'A'.repeat(40), '../main'])('rejects an unpinned commit before transport', async sha => {
  const f = fixture(); await expect(f.reader.commitTree(sha)).rejects.toMatchObject({ code: 'malformed' }); expect(f.request).not.toHaveBeenCalled();
});
it.each([{ sha: root }, { tree: null }, { tree: { sha: 'main' } }, { sha: undefined }])('rejects missing or mismatched commit identity', async change => {
  const f = fixture(); Object.assign(f.object, change); await expect(f.reader.commitTree(commit)).rejects.toMatchObject({ code: 'malformed' });
});
it('rejects a non-object commit response', async () => {
  const f = fixture(); f.request.mockResolvedValue({ data: null }); await expect(f.reader.commitTree(commit)).rejects.toMatchObject({ code: 'malformed' });
});
it('rejects an unpinned tree before transport', async () => {
  const f = fixture(); await expect(f.reader.tree('main')).rejects.toMatchObject({ code: 'malformed' }); expect(f.request).not.toHaveBeenCalled();
});
it.each([{ sha: nested }, { truncated: true }, { truncated: undefined }, { tree: null }, { tree: Array(100_001).fill(treeEntry) }])(
  'cannot treat an incomplete or malformed tree as absence', async change => {
    const f = fixture(); Object.assign(f.trees[root], change); await expect(f.reader.find(root, 'missing')).rejects.toMatchObject({ code: 'malformed' });
  });
it('rejects a non-object tree response', async () => {
  const f = fixture(); f.request.mockResolvedValue({ data: [] }); await expect(f.reader.tree(root)).rejects.toMatchObject({ code: 'malformed' });
});
it.each([null, {}, { ...treeEntry, path: '' }, { ...treeEntry, path: '.' }, { ...treeEntry, path: '..' },
  { ...treeEntry, path: 'a/b' }, { ...treeEntry, path: 'a\0b' }, { ...treeEntry, path: 'a\n' }, { ...treeEntry, path: 'a\u202e' },
  { ...treeEntry, sha: 'bad' }, { ...treeEntry, type: 'blob' }, { ...treeEntry, mode: '100644' },
  { ...treeEntry, type: 'unknown' }, { path: 'f', type: 'blob', mode: '100644', sha: nested, size: -1 },
  { path: 'f', type: 'blob', mode: '100644', sha: nested, size: 1.5 }, { path: 'f', type: 'commit', mode: '100644', sha: nested }])(
  'checks every tree entry even when the selected path is absent (case %#)', async invalid => {
    const f = fixture(); f.trees[root].tree = [treeEntry, invalid]; await expect(f.reader.find(root, 'absent')).rejects.toMatchObject({ code: 'malformed' });
  });
it('rejects duplicate sibling names instead of choosing a convenient entry', async () => {
  const f = fixture(); f.trees[root].tree = [treeEntry, treeEntry]; await expect(f.reader.tree(root)).rejects.toMatchObject({ code: 'malformed' });
});
it.each(['', '/a', 'a/', 'a//b', '.', '..', 'a/../b', 'a\\b', 'a/\u202e'])('rejects unsafe lookup paths before transport (case %#)', async path => {
  const f = fixture(); await expect(f.reader.find(root, path)).rejects.toMatchObject({ code: 'malformed' }); expect(f.request).not.toHaveBeenCalled();
});
it('distinguishes complete absence of an ancestor and leaf from an unavailable read', async () => {
  const f = fixture(); expect(await f.reader.find(root, 'missing/file')).toBeNull(); expect(await f.reader.find(root, 'directory/missing')).toBeNull();
  f.request.mockRejectedValue({ status: 404 }); await expect(f.reader.tree(commit)).rejects.toMatchObject({ code: 'not-found' });
});
it.each([{ entries: [{ ...treeEntry, path: 'Directory' }] }, { entries: [treeEntry, { ...treeEntry, path: 'DIRECTORY' }] }])(
  'rejects case aliases and case collisions in relevant ancestors', async ({ entries }) => {
    const f = fixture(); f.trees[root].tree = entries; await expect(f.reader.find(root, 'directory/file.yml')).rejects.toMatchObject({ code: 'malformed' });
  });
it('never follows a relevant symbolic link as a directory or regular file', async () => {
  const f = fixture(); f.trees[root].tree = [{ ...f.entry, path: 'directory', mode: '120000' }];
  await expect(f.reader.find(root, 'directory/file.yml')).rejects.toMatchObject({ code: 'malformed' });
  const link = (await f.reader.find(root, 'directory'))!;
  await expect(f.reader.text(link, 100_000)).rejects.toMatchObject({ code: 'malformed' });
});
it('preserves unrelated symlinks, gitlinks and executable file identities without reading their blobs', async () => {
  const f = fixture(); f.trees[root].tree = [treeEntry, { ...f.entry, path: 'link', mode: '120000' },
    { path: 'submodule', type: 'commit', mode: '160000', sha: commit }, { ...f.entry, path: 'executable', mode: '100755' }];
  expect(await f.reader.tree(root)).toHaveLength(4); expect(f.request).toHaveBeenCalledTimes(1);
});
it.each([root, nested])('publisher977-C99: unrelated backslash names in tree %s do not block a fixed-path read', async tree => {
  const f = fixture();
  (f.trees[tree].tree as unknown[]).push({ ...f.entry, path: 'literal\\name.txt' });
  expect(await f.reader.find(root, 'directory/file.yml')).toEqual(f.entry);
  expect(await f.reader.text(f.entry, 100_000)).toBe(f.bytes.toString('utf8'));
  expect(f.request.mock.calls.filter(([route]) => route.includes('/git/blobs/'))).toHaveLength(1);
});
it.each([{ type: 'tree' }, { mode: '120000' }, { sha: 'main' }, { size: undefined }, { size: -1 }, { size: 100_001 }])(
  'rejects a nonregular, invalid or oversized asset before reading its blob', async change => {
    const f = fixture(); await expect(f.reader.text({ ...f.entry, ...change }, 100_000)).rejects.toMatchObject({ code: 'malformed' }); expect(f.request).not.toHaveBeenCalled();
  });
it.each([-1, 1.5, 100_000_001])('does not accept an invalid or above-provider byte limit', async limit => {
  const f = fixture(); await expect(f.reader.text(f.entry, limit)).rejects.toMatchObject({ code: 'malformed' }); expect(f.request).not.toHaveBeenCalled();
});
it.each([{ sha: root }, { size: 0 }, { encoding: 'utf-8' }, { content: null }, { content: '#bad' },
  { content: 'A'.repeat(140_000) }, { content: 'YQ' }, { content: 'YQ===' }, { content: 'YR==' }, { content: 'AA==' }])(
  'refuses malformed encoding, changed bytes or mismatched blob metadata', async change => {
    const f = fixture(); Object.assign(f.blob, change); await expect(f.reader.text(f.entry, 100_000)).rejects.toMatchObject({ code: 'malformed' });
  });
it('rejects a non-object blob response', async () => {
  const f = fixture(); f.request.mockResolvedValue({ data: null }); await expect(f.reader.text(f.entry, 100_000)).rejects.toMatchObject({ code: 'malformed' });
});
it('verifies actual Git blob identity even when size and strict UTF-8 are unchanged', async () => {
  const f = fixture(); f.blob.content = Buffer.from('X'.repeat(f.bytes.length)).toString('base64');
  await expect(f.reader.text(f.entry, 100_000)).rejects.toMatchObject({ code: 'malformed' });
});
it('rejects non-UTF-8 bytes even with a correct Git object identity', async () => {
  const f = fixture(Buffer.from([0xff])); await expect(f.reader.text(f.entry, 100_000)).rejects.toMatchObject({ code: 'malformed' });
});
it('supports empty and executable regular files without inventing missing content', async () => {
  const f = fixture(Buffer.alloc(0)); expect(await f.reader.text({ ...f.entry, mode: '100755' }, 0)).toBe('');
});
it('accepts documented GitHub base64 line wrapping without altering decoded bytes', async () => {
  const f = fixture(Buffer.from('This repeats for multiple wrapped lines. '.repeat(8)));
  f.blob.content = String(f.blob.content).match(/.{1,60}/gu)!.join('\r\n') + '\n';
  expect(await f.reader.text(f.entry, 100_000)).toBe(f.bytes.toString('utf8'));
});
it('reads an actual-size source bundle above destination asset bounds without a recursive-regex stack failure', async () => {
  const f = fixture(Buffer.from('x'.repeat(11_109_171)));
  await expect(f.reader.text(f.entry, 100_000)).rejects.toMatchObject({ code: 'malformed' });
  expect(await f.reader.text(f.entry, 100_000_000)).toHaveLength(11_109_171);
});
