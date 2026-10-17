import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import type { SetupBatchOperation } from '../domain/setup_batch';
import type { SetupBatchJournalPort } from '../application/ports/setup_batch_ports';
import { parseSetupBatchOperation, setupBatchBranch } from '../application/policies/setup_batch_policy';

/** A private durable receipt store. Credentials, configuration values and file contents are excluded by the parser. */
export class SetupBatchJournalAdapter implements SetupBatchJournalPort {
  constructor(private readonly root = join(homedir(), '.copilot', 'setup-operations')) {}
  private path(id: string): string { setupBatchBranch(id); return join(this.root, `${id}.json`); }
  private async ensureRoot(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const info = await lstat(this.root);
    if (!info.isDirectory() || info.isSymbolicLink() || process.platform !== 'win32' && (info.mode & 0o077) !== 0) throw new Error('Setup operation journal directory must be private.');
  }
  async load(id: string): Promise<SetupBatchOperation | undefined> {
    const path = this.path(id);
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 40_000) throw new Error('Invalid setup operation journal file.');
      return parseSetupBatchOperation(JSON.parse(await readFile(path, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
  async save(operation: SetupBatchOperation): Promise<void> {
    const validated = parseSetupBatchOperation(operation);
    await this.ensureRoot();
    const destination = this.path(validated.operationId);
    const temporary = `${destination}.${randomBytes(8).toString('hex')}.tmp`;
    const file = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    try { await file.writeFile(JSON.stringify(validated)); await file.sync(); }
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
    try { await file.writeFile(JSON.stringify({ pid: process.pid, nonce })); await file.sync(); }
    finally { await file.close(); }
    return async () => { await readFile(destination, 'utf8').then(content => {
      const current = JSON.parse(content) as { pid: number; nonce: string };
      if (current.pid === process.pid && current.nonce === nonce) return unlink(destination);
    }).catch(() => undefined); };
  }
}
