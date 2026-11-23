import { createHash } from 'node:crypto';

interface FixtureEntry { readonly path: string; readonly mode: string; readonly type: 'blob' | 'tree'; readonly sha: string }
/** Real Git object hashing over deterministic files; no provider or installation acceptance is implied. */
export function setupInstallationTreeFixture(files: ReadonlyMap<string, string>, modes: ReadonlyMap<string, '100644' | '100755'> = new Map()) {
  const trees = new Map<string, { sha: string; tree: FixtureEntry[]; truncated: false }>();
  const hash = (kind: string, bytes: Buffer) => createHash('sha1').update(`${kind} ${bytes.length}\0`).update(bytes).digest('hex');
  const visit = (prefix: string): string => {
    const names = new Map<string, { content?: string; directory: boolean }>();
    for (const [path, content] of files) {
      if (!path.startsWith(prefix)) continue;
      const relative = path.slice(prefix.length), separator = relative.indexOf('/');
      names.set(separator < 0 ? relative : relative.slice(0, separator), separator < 0 ? { content, directory: false } : { directory: true });
    }
    const entries = [...names].map(([name, value]): FixtureEntry => ({ path: name,
      mode: value.directory ? '040000' : modes.get(prefix + name) ?? '100644', type: value.directory ? 'tree' : 'blob',
      sha: value.directory ? visit(prefix + name + '/') : hash('blob', Buffer.from(value.content!, 'utf8')) }));
    entries.sort((a, b) => Buffer.compare(Buffer.from(a.path + (a.type === 'tree' ? '/' : '')), Buffer.from(b.path + (b.type === 'tree' ? '/' : ''))));
    const bytes = Buffer.concat(entries.flatMap(entry => [Buffer.from(`${entry.type === 'tree' ? '40000' : entry.mode} ${entry.path}\0`), Buffer.from(entry.sha, 'hex')]));
    const sha = hash('tree', bytes); trees.set(sha, { sha, tree: entries, truncated: false }); return sha;
  };
  return { root: visit(''), trees };
}
