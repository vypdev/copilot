import type { SetupInstallationApprovedBlob, SetupInstallationSubtree, SetupInstallationTree,
  SetupInstallationTreeEntry } from '../contracts/setup_installation_delivery';

const sha = /^[a-f0-9]{40}$/u;
const modes: Readonly<Record<string, SetupInstallationTreeEntry['type']>> = {
  '040000': 'tree', '100644': 'blob', '100755': 'blob', '120000': 'blob', '160000': 'commit',
};

/** Compare every sibling; descend only through ancestors of approved leaves. */
export function setupInstallationTreeLevel(prefix: string, base: SetupInstallationTree, prepared: SetupInstallationTree,
  approved: readonly SetupInstallationApprovedBlob[]): readonly SetupInstallationSubtree[] {
  if (prefix && !safePath(prefix)) throw invalid();
  assertSetupInstallationApprovedBlobs(approved);
  const before = index(base), after = index(prepared), descend: SetupInstallationSubtree[] = [];
  const start = prefix ? prefix + '/' : '';
  const relevant = approved.filter(file => file.path.startsWith(start));
  if (!relevant.length) throw invalid();
  const names = new Set([...before.keys(), ...after.keys(), ...relevant.map(file => file.path.slice(start.length).split('/')[0])]);
  for (const name of names) {
    const path = start + name, oldEntry = before.get(name), newEntry = after.get(name);
    const leaf = relevant.find(file => file.path === path);
    const children = relevant.filter(file => file.path.startsWith(path + '/'));
    if (leaf) {
      if (leaf.sha === null ? newEntry !== undefined : !newEntry || newEntry.type !== 'blob'
        || newEntry.mode !== leaf.mode || newEntry.sha !== leaf.sha) throw invalid();
      // Replacing a tree or symlink with a regular file was never approved.
      if (oldEntry && (oldEntry.type !== 'blob' || !['100644', '100755'].includes(oldEntry.mode))) throw invalid();
    } else if (children.length) {
      if (oldEntry && oldEntry.type !== 'tree' || newEntry && newEntry.type !== 'tree') throw invalid();
      descend.push({ path, ...(oldEntry ? { baseSha: oldEntry.sha } : {}), ...(newEntry ? { preparedSha: newEntry.sha } : {}) });
    } else if (!oldEntry || !newEntry || oldEntry.mode !== newEntry.mode || oldEntry.type !== newEntry.type || oldEntry.sha !== newEntry.sha) {
      throw invalid();
    }
  }
  return descend;
}

export function assertSetupInstallationApprovedBlobs(approved: readonly SetupInstallationApprovedBlob[]): void {
  if (!approved.length) throw invalid();
  const paths = new Set<string>();
  for (const file of approved) {
    if (!safePath(file.path) || paths.has(file.path) || file.mode !== '100644'
      || file.sha !== null && !sha.test(file.sha)) throw invalid();
    paths.add(file.path);
  }
  for (const file of approved) {
    if (approved.some(other => other.path !== file.path && other.path.startsWith(file.path + '/'))) throw invalid();
  }
}

function index(tree: SetupInstallationTree): ReadonlyMap<string, SetupInstallationTreeEntry> {
  if (tree.truncated) throw invalid();
  const entries = new Map<string, SetupInstallationTreeEntry>();
  for (const entry of tree.entries) {
    if (!entry.path || entry.path === '.' || entry.path === '..' || /[\0/]/u.test(entry.path)
      || entries.has(entry.path) || !sha.test(entry.sha)
      || !Object.prototype.hasOwnProperty.call(modes, entry.mode) || modes[entry.mode] !== entry.type) throw invalid();
    entries.set(entry.path, entry);
  }
  return entries;
}
function safePath(path: string): boolean {
  return path.length > 0 && path.length <= 240 && !/[^A-Za-z0-9_.@+/-]/u.test(path)
    && !path.split('/').some(part => !part || part === '.' || part === '..');
}
function invalid(): Error { return new Error('The prepared Setup tree does not match the complete approved file scope.'); }
