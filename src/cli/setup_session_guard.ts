import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { closeSync, linkSync, openSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
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
  const stagedPath = `${lockPath}.${record.nonce}.tmp`;
  writeStagedLock(stagedPath, record);
  let published = false;
  let collision: unknown;
  try {
    linkSync(stagedPath, lockPath); // Atomic publication of a fully written record.
    published = true;
  } catch (cause) {
    collision = cause;
  } finally {
    try { unlinkSync(stagedPath); } catch { /* A staging-file cleanup failure does not invalidate the published lock. */ }
  }
  if (!published) {
    if (!collision || typeof collision !== 'object' || !('code' in collision) || collision.code !== 'EEXIST') throw collision;
    let existing: GuardRecord;
    try { existing = JSON.parse(readFileSync(lockPath, 'utf8')) as GuardRecord; }
    catch { throw new Error('A setup lock exists but cannot be verified. Inspect it before retrying.'); }
    if (!Number.isSafeInteger(existing.pid) || existing.pid <= 0 || existing.repository !== repository || !existing.nonce) {
      throw setupLockError('A setup lock has unexpected contents. Inspect it before retrying.', collision);
    }
    try {
      process.kill(existing.pid, 0);
      throw setupLockError(`Another setup process (${existing.pid}) is active for this checkout. Finish or stop it before starting a second setup.`, collision);
    } catch (checkError) {
      if (!checkError || typeof checkError !== 'object' || !('code' in checkError) || checkError.code !== 'ESRCH') throw checkError;
    }
    // Filesystem reads and unlink are not atomic. Never remove a dead owner's lock here.
    throw setupLockError(`A setup lock for a stopped process (${existing.pid}) remains at ${lockPath}. Verify no setup is running, remove only that file manually, then retry.`, collision);
  }
  return () => {
    try {
      const current = JSON.parse(readFileSync(lockPath, 'utf8')) as GuardRecord;
      if (current.pid === record.pid && current.nonce === record.nonce && current.repository === record.repository) unlinkSync(lockPath);
    } catch { /* Missing or replaced lock is not ours to remove. */ }
  };
}

function writeStagedLock(path: string, record: GuardRecord): void {
  const fd = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(fd, JSON.stringify(record));
    closeSync(fd);
  } catch (cause) {
    try { closeSync(fd); } catch { /* Already closed or unavailable. */ }
    try { unlinkSync(path); } catch { /* Preserve the write failure. */ }
    throw cause;
  }
}

function setupLockError(message: string, cause: unknown): Error {
  return Object.assign(new Error(message), { cause });
}
