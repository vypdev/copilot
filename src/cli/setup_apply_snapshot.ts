import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';

/** Captures only the selected setup paths. Missing files are part of the snapshot. */
export function captureSetupApplySnapshot(repositoryRoot: string, selectedFiles: readonly string[]): Readonly<Record<string, string>> {
  const root = resolve(repositoryRoot);
  const result: Record<string, string> = {};
  for (const name of [...new Set(selectedFiles)].sort()) {
    const path = resolve(root, name);
    const inside = relative(root, path);
    if (isAbsolute(name) || !inside || inside === '..' || inside.startsWith(`..${sep}`)) {
      throw new Error('The setup plan contains a path outside the repository.');
    }
    // A lexically in-repository path can still escape through a parent symlink.
    let prefix = root;
    for (const segment of inside.split(sep)) {
      prefix = resolve(prefix, segment);
      try {
        if (lstatSync(prefix).isSymbolicLink()) throw new Error(`Setup path ${name} traverses a symbolic link.`);
      } catch (cause) {
        if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ENOENT') break;
        throw cause;
      }
    }
    try {
      const stat = lstatSync(path);
      if (stat.isFile() && stat.size <= 5 * 1024 * 1024) {
        result[name] = `file:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
      } else throw new Error(`Cannot safely snapshot setup file ${name}.`);
    } catch (cause) {
      if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ENOENT') result[name] = 'missing';
      else throw cause;
    }
  }
  return result;
}

export function setupApplySnapshotMatches(repositoryRoot: string, selectedFiles: readonly string[], expected: Readonly<Record<string, string>>): boolean {
  const current = captureSetupApplySnapshot(repositoryRoot, selectedFiles);
  return JSON.stringify(current) === JSON.stringify(expected);
}
