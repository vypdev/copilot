import { mkdtempSync, realpathSync, rmSync, readFileSync, writeFileSync, renameSync, mkdirSync, symlinkSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const filesystem = jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');
import { SetupOperationJournalStore } from '../setup_operation_journal_store';

const id = '12345678-1234-4234-8234-123456789abc';
describe('private operation lock initialization', () => {
  let root: string;
  beforeEach(() => { root = realpathSync(mkdtempSync(join(tmpdir(), 'copilot-lock-init-'))); });
  afterEach(() => { jest.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });
  const store = (directory: string) => new SetupOperationJournalStore(value => value, directory);

  it.each(['writeFile', 'sync', 'close', 'writeFile-and-close', 'sync-and-close'] as const)(
    'removes only its own uninitialized lock after %s failure and preserves the first error', async phase => {
      const actual = filesystem.open, failure = new Error('component initialization failure');
      const open = jest.spyOn(filesystem, 'open').mockImplementationOnce(async (...args) => {
        const file = await actual(...args), close = file.close.bind(file);
        if (phase.startsWith('writeFile')) jest.spyOn(file, 'writeFile').mockRejectedValueOnce(failure);
        if (phase.startsWith('sync')) jest.spyOn(file, 'sync').mockRejectedValueOnce(failure);
        if (phase.includes('close')) jest.spyOn(file, 'close').mockImplementationOnce(async () => {
          await close(); throw phase === 'close' ? failure : new Error('component later close failure');
        });
        return file;
      });
      const journal = store(root); await expect(journal.lock(id)).rejects.toBe(failure);
      expect(readdirSync(root)).toEqual([]); open.mockRestore();
      const release = await journal.lock(id); expect(JSON.parse(readFileSync(join(root, `${id}.json.lock`), 'utf8')).pid).toBe(process.pid);
      await release(); expect(readdirSync(root)).toEqual([]);
    },
  );

  it.each(['file', 'directory', 'symlink', 'absent'] as const)(
    'never removes a %s replacement after failed initialization', async replacement => {
      const actual = filesystem.open, failure = new Error('component interrupted initialization'), destination = join(root, `${id}.json.lock`);
      jest.spyOn(filesystem, 'open').mockImplementationOnce(async (...args) => {
        const file = await actual(...args);
        jest.spyOn(file, 'writeFile').mockImplementationOnce(async () => {
          renameSync(destination, join(root, 'original-owned-lock'));
          if (replacement === 'file') writeFileSync(destination, 'foreign owner');
          if (replacement === 'directory') mkdirSync(destination);
          if (replacement === 'symlink') symlinkSync(join(root, 'original-owned-lock'), destination);
          throw failure;
        }); return file;
      });
      await expect(store(root).lock(id)).rejects.toBe(failure);
      expect(existsSync(join(root, 'original-owned-lock'))).toBe(true);
      expect(existsSync(destination)).toBe(replacement !== 'absent');
      if (replacement === 'file') expect(readFileSync(destination, 'utf8')).toBe('foreign owner');
    },
  );

  it('retains an unverified lock if its created descriptor identity cannot be read', async () => {
    const actual = filesystem.open, failure = new Error('component identity unavailable');
    jest.spyOn(filesystem, 'open').mockImplementationOnce(async (...args) => {
      const file = await actual(...args); jest.spyOn(file, 'stat').mockRejectedValueOnce(failure); return file;
    });
    await expect(store(root).lock(id)).rejects.toBe(failure);
    expect(readdirSync(root)).toEqual([`${id}.json.lock`]);
  });

  it.each(['lstat', 'unlink'] as const)('preserves the initialization error when %s cleanup fails', async phase => {
    const actual = filesystem.open, stat = filesystem.lstat, failure = new Error('component initial write failed');
    jest.spyOn(filesystem, 'open').mockImplementationOnce(async (...args) => {
      const file = await actual(...args); jest.spyOn(file, 'writeFile').mockRejectedValueOnce(failure);
      if (phase === 'lstat') jest.spyOn(filesystem, 'lstat').mockImplementation(async (...paths) => {
        if (paths[0] === join(root, `${id}.json.lock`)) throw new Error('component cleanup denied'); return stat(...paths);
      });
      else jest.spyOn(filesystem, 'unlink').mockRejectedValueOnce(new Error('component cleanup denied'));
      return file;
    });
    await expect(store(root).lock(id)).rejects.toBe(failure);
    expect(readdirSync(root)).toEqual([`${id}.json.lock`]);
  });

  it.each([
    ['readFile', 'EACCES'], ['readFile', 'EIO'], ['unlink', 'EACCES'], ['unlink', 'EIO'],
  ] as const)('publisher977-C125 propagates %s %s while retaining the owned lock', async (phase, code) => {
    const journal = store(root), release = await journal.lock(id), destination = join(root, `${id}.json.lock`);
    const original = readFileSync(destination, 'utf8');
    const failure = Object.assign(new Error('component release failure'), { code });
    const fault = phase === 'readFile' ? jest.spyOn(filesystem, 'readFile').mockRejectedValueOnce(failure)
      : jest.spyOn(filesystem, 'unlink').mockRejectedValueOnce(failure);
    await expect(release()).rejects.toBe(failure);
    expect(readFileSync(destination, 'utf8')).toBe(original);
    await expect(journal.lock(id)).rejects.toMatchObject({ code: 'EEXIST' });
    fault.mockRestore(); await release();
    const next = await journal.lock(id); await next(); expect(readdirSync(root)).toEqual([]);
  });

  it('publisher977-C125 treats an already absent lock as released without unlinking another path', async () => {
    const journal = store(root), release = await journal.lock(id), destination = join(root, `${id}.json.lock`);
    rmSync(destination); const unlink = jest.spyOn(filesystem, 'unlink');
    await expect(release()).resolves.toBeUndefined(); expect(unlink).not.toHaveBeenCalled();
    expect(readdirSync(root)).toEqual([]);
  });

  it('publisher977-C125 tolerates lock disappearance between its read and unlink', async () => {
    const journal = store(root), release = await journal.lock(id), destination = join(root, `${id}.json.lock`);
    const original = filesystem.unlink;
    jest.spyOn(filesystem, 'unlink').mockImplementationOnce(async path => {
      expect(path).toBe(destination); await original(path);
      throw Object.assign(new Error('component concurrent disappearance'), { code: 'ENOENT' });
    });
    await expect(release()).resolves.toBeUndefined(); expect(readdirSync(root)).toEqual([]);
  });
});
