import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface GuardRecord { pid: number; nonce: string; repository: string }

/** One cooperative setup process per canonical checkout; no credential is stored in the lock. */
export function acquireSetupSessionGuard(cwd: string): () => void {
  const top = execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const repository = realpathSync(top);
  const hash = createHash('sha256').update(repository).digest('hex').slice(0, 32);
  const lockPath = join(tmpdir(), `copilot-setup-${hash}.lock`);
  const record: GuardRecord = { pid: process.pid, nonce: randomBytes(16).toString('hex'), repository };
  try {
    const fd = openSync(lockPath, 'wx', 0o600);
    try { writeFileSync(fd, JSON.stringify(record)); } finally { closeSync(fd); }
    return () => {
      try {
        const current = JSON.parse(readFileSync(lockPath, 'utf8')) as GuardRecord;
        if (current.pid === record.pid && current.nonce === record.nonce && current.repository === record.repository) unlinkSync(lockPath);
      } catch { /* Missing or replaced lock is not ours to remove. */ }
    };
  } catch (cause) {
    if (!cause || typeof cause !== 'object' || !('code' in cause) || cause.code !== 'EEXIST') throw cause;
    let existing: GuardRecord;
    try { existing = JSON.parse(readFileSync(lockPath, 'utf8')) as GuardRecord; }
    catch { throw new Error('A setup lock exists but cannot be verified. Inspect it before retrying.'); }
    if (!Number.isSafeInteger(existing.pid) || existing.pid <= 0 || existing.repository !== repository || !existing.nonce) {
      throw setupLockError('A setup lock has unexpected contents. Inspect it before retrying.', cause);
    }
    try {
      process.kill(existing.pid, 0);
      throw setupLockError(`Another setup process (${existing.pid}) is active for this checkout. Finish or stop it before starting a second setup.`, cause);
    } catch (checkError) {
      if (!checkError || typeof checkError !== 'object' || !('code' in checkError) || checkError.code !== 'ESRCH') throw checkError;
    }
    // Filesystem reads and unlink are not atomic. Never remove a dead owner's lock here:
    // another setup process may already have replaced it after our read.
    throw setupLockError(`A setup lock for a stopped process (${existing.pid}) remains at ${lockPath}. Verify no setup is running, remove only that file manually, then retry.`, cause);
  }
}

function setupLockError(message: string, cause: unknown): Error {
  return Object.assign(new Error(message), { cause });
}
