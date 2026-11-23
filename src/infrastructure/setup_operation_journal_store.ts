import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { setupBatchBranch } from '../application/policies/setup_batch_policy';

/** Shared private UUID/store/lock primitives. Typed facades own their closed journal schemas. */
export class SetupOperationJournalStore {
  constructor(private readonly validate: (value: unknown) => unknown,
    private readonly root = join(homedir(), '.copilot', 'setup-operations')) {}
  private path(id: string): string { setupBatchBranch(id); return join(this.root, `${id}.json`); }
  private async ensureRoot(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const info = await lstat(this.root);
    if (!info.isDirectory() || info.isSymbolicLink() || process.platform !== 'win32' && (info.mode & 0o077) !== 0) throw new Error('Setup operation journal directory must be private.');
  }
  async load(id: string): Promise<unknown | undefined> {
    const path = this.path(id);
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 40_000) throw new Error('Invalid setup operation journal file.');
      return this.validate(JSON.parse(await readFile(path, 'utf8')) as unknown);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
  /** Navigation only after the existing reader validates the exact saved ID. */
  async location(id: string): Promise<string | undefined> {
    const record = await this.load(id) as { readonly operationId?: unknown } | undefined;
    return record?.operationId === id ? pathToFileURL(this.path(id)).href : undefined;
  }
  async save(id: string, value: unknown): Promise<void> {
    const serialized = JSON.stringify(value);
    if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > 40_000) throw new Error('Invalid setup operation journal size.');
    this.validate(value);
    const destination = this.path(id);
    await this.ensureRoot();
    // The operation's exclusive lock is held by the application. Preserve a
    // foreign, future or malformed prior record rather than migrating it.
    await this.load(id);
    const temporary = `${destination}.${randomBytes(8).toString('hex')}.tmp`;
    const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    try { await file.writeFile(serialized); await file.sync(); }
    finally { await file.close(); }
    try { await rename(temporary, destination); }
    catch (error) { await unlink(temporary).catch(() => undefined); throw error; }
  }
  async lock(id: string): Promise<() => Promise<void>> {
    await this.ensureRoot();
    const destination = `${this.path(id)}.lock`;
    const nonce = randomBytes(16).toString('hex');
    const file = await open(destination, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600).catch(error => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      throw Object.assign(new Error(`Setup operation ${id} is locked at ${destination}. Stop all setup processes and verify the recorded owner before orphan-lock recovery. See https://github.com/vypdev/copilot/blob/master/docs/security-operations/operations/troubleshooting.mdx#recover-an-orphaned-batch-operation-lock`), { code: 'EEXIST' });
    });
    let identity: Awaited<ReturnType<typeof file.stat>> | undefined;
    let failure: { cause: unknown } | undefined;
    try { identity = await file.stat(); await file.writeFile(JSON.stringify({ pid: process.pid, nonce })); await file.sync(); }
    catch (cause) { failure = { cause }; }
    try { await file.close(); }
    catch (cause) { failure ??= { cause }; }
    if (failure) {
      // A failed acquisition has no release callback. Reclaim only the exact
      // inode created here; a replacement or unverified owner must remain.
      if (identity) await lstat(destination).then(current => {
        if (current.isFile() && !current.isSymbolicLink() && current.dev === identity.dev && current.ino === identity.ino) return unlink(destination);
      }).catch(() => undefined);
      throw failure.cause;
    }
    return async () => {
      const content = await readFile(destination, 'utf8').catch(error => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
      });
      if (content === undefined) return;
      let owned: boolean;
      try {
        const current = JSON.parse(content) as { pid: number; nonce: string };
        owned = current.pid === process.pid && current.nonce === nonce;
      } catch { return; } // Unverified replacement contents never grant removal.
      if (owned) await unlink(destination).catch(error => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      });
    };
  }
}
