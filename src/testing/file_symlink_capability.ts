import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Distinguishes an unprivileged Windows service from a failed symlink assertion. */
export function canCreateFileSymlink(): boolean {
  if (process.platform !== 'win32') return true;
  const root = mkdtempSync(join(tmpdir(), 'copilot-file-symlink-probe-'));
  try {
    const target = join(root, 'target');
    writeFileSync(target, 'fixture');
    try {
      symlinkSync(target, join(root, 'link'), 'file');
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return false;
      throw error;
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
