import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { canCreateFileSymlink } from '../../testing/file_symlink_capability';

const validatorFile = join(__dirname, '../../infrastructure/specification_catalog_validator.cjs');
const { main, renderCatalog } = require(validatorFile);
const symlinkIt = canCreateFileSymlink() ? it : it.skip;

describe('catalog publication through real filesystem boundaries', () => {
  let parent: string, root: string, target: string, external: string, previousCwd: string;
  let previousExitCode: typeof process.exitCode;
  const catalog = { version: 1, capabilities: [{
    id: 'payments', title: 'Payments', status: 'proposed', scope: 'Proposed payments',
    owner: 'Fixture', lastVerified: '2026-10-29', specs: ['specs/payments.md'],
    workflows: [], entrypoints: ['src/main.ts'], code: ['src/main.ts'],
    tests: ['test/main.test.ts'], documentation: ['docs/main.md'],
  }] };
  beforeEach(() => {
    previousCwd = fs.realpathSync('.');
    previousExitCode = process.exitCode;
    process.exitCode = undefined;
    parent = fs.mkdtempSync(join(tmpdir(), 'copilot-catalog-publication-'));
    root = join(parent, 'repo'); target = join(root, 'specs/CATALOG.md');
    external = join(parent, 'outside.md');
    for (const file of ['specs/payments.md', 'src/main.ts', 'test/main.test.ts', 'docs/main.md']) {
      fs.mkdirSync(dirname(join(root, file)), { recursive: true });
      fs.writeFileSync(join(root, file), '# Synthetic fixture\n');
    }
    fs.writeFileSync(join(root, 'specs/catalog.json'), JSON.stringify(catalog));
    fs.writeFileSync(external, 'SYNTHETIC_SENTINEL');
  });
  afterEach(() => {
    jest.restoreAllMocks();
    process.chdir(previousCwd);
    process.exitCode = previousExitCode;
    fs.rmSync(parent, { recursive: true, force: true });
  });
  function cli(write = true, module = validatorFile) {
    const env: NodeJS.ProcessEnv = {};
    for (const key of ['SystemRoot', 'NODE_V8_COVERAGE']) if (process.env[key]) env[key] = process.env[key];
    return spawnSync(process.execPath, ['-e',
      'require(process.argv[1]).main(process.argv[2] === "--write" ? ["--write"] : [], process.argv[3]);',
      module, write ? '--write' : '--check', root,
    ], { encoding: 'utf8', env, timeout: 10_000 });
  }
  function invoke(write = true) {
    const logs: string[] = [];
    jest.spyOn(console, 'log').mockImplementation((...values: unknown[]) => { logs.push(values.map(String).join(' ')); });
    jest.spyOn(console, 'error').mockImplementation((...values: unknown[]) => { logs.push(values.map(String).join(' ')); });
    main(write ? ['--write'] : [], root);
    return { code: process.exitCode ?? 0, logs: logs.join('\n') };
  }
  function failed(result: ReturnType<typeof invoke>) {
    expect(result.code).toBe(1);
    expect(result.logs).not.toContain('PASS');
    expect(fs.readFileSync(external, 'utf8')).toBe('SYNTHETIC_SENTINEL');
    expect(fs.realpathSync('.')).toBe(previousCwd);
  }
  function noTemps(directory = join(root, 'specs')) {
    expect(fs.readdirSync(directory).filter(name => name.startsWith('.copilot-catalog-'))).toEqual([]);
  }

  it('creates an absent regular catalog through the actual CLI', () => {
    const missing = cli(false);
    expect(missing.status).toBe(1); expect(missing.stderr).toContain('is stale');
    const result = cli();
    expect(result.status).toBe(0); expect(result.stdout).toContain('generation: PASS');
    expect(fs.lstatSync(target).isFile()).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe(renderCatalog(catalog)); noTemps();
    const validated = cli(false);
    expect(validated.status).toBe(0); expect(validated.stdout).toContain('validation: PASS');
  });
  it('regenerates a regular catalog atomically and preserves its permissions', () => {
    fs.writeFileSync(target, 'old catalog'); fs.chmodSync(target, 0o640);
    const mode = fs.statSync(target).mode & 0o777;
    const result = cli();
    expect(result.status).toBe(0);
    expect(fs.readFileSync(target, 'utf8')).toBe(renderCatalog(catalog));
    expect(fs.statSync(target).mode & 0o777).toBe(mode); noTemps();
  });
  it('runs the complete portable validator dependency set from an isolated copy', () => {
    const copy = join(parent, 'portable');
    for (const [file, source] of [
      ['infrastructure/specification_catalog_validator.cjs', validatorFile],
      ['infrastructure/specification_catalog_publication.cjs', join(dirname(validatorFile), 'specification_catalog_publication.cjs')],
      ['domain/specification_catalog_path_policy.cjs', join(dirname(validatorFile), '../domain/specification_catalog_path_policy.cjs')],
    ]) {
      fs.mkdirSync(dirname(join(copy, file)), { recursive: true });
      fs.copyFileSync(source, join(copy, file));
    }
    const module = join(copy, 'infrastructure/specification_catalog_validator.cjs');
    expect(cli(true, module).status).toBe(0);
    expect(cli(false, module).status).toBe(0);
    expect(fs.readFileSync(target, 'utf8')).toBe(renderCatalog(catalog)); noTemps();
  });
  symlinkIt.each(['external', 'internal', 'dangling'] as const)('rejects a pre-existing %s destination link without following it', kind => {
    const destination = kind === 'external' ? external : kind === 'internal'
      ? join(root, 'specs/payments.md') : join(parent, 'not-created.md');
    const before = kind === 'dangling' ? undefined : fs.readFileSync(destination);
    fs.symlinkSync(destination, target, 'file');
    const result = cli();
    expect(result.status).toBe(1); expect(result.stdout).not.toContain('PASS');
    expect(fs.lstatSync(target).isSymbolicLink()).toBe(true);
    if (before) expect(fs.readFileSync(destination)).toEqual(before);
    else expect(fs.existsSync(destination)).toBe(false);
    noTemps();
  });
  it('rejects a directory at the destination and preserves its contents', () => {
    fs.mkdirSync(target); fs.writeFileSync(join(target, 'keep'), 'retain');
    const result = cli();
    expect(result.status).toBe(1); expect(result.stdout).not.toContain('PASS');
    expect(fs.readFileSync(join(target, 'keep'), 'utf8')).toBe('retain'); noTemps();
  });
  it('rejects a symlinked specs parent before publication', () => {
    const moved = join(parent, 'outside-specs'); fs.renameSync(join(root, 'specs'), moved);
    fs.writeFileSync(join(moved, 'CATALOG.md'), 'retain');
    fs.symlinkSync(moved, join(root, 'specs'), process.platform === 'win32' ? 'junction' : 'dir');
    const result = cli();
    expect(result.status).toBe(1); expect(result.stdout).not.toContain('PASS');
    expect(fs.readFileSync(join(moved, 'CATALOG.md'), 'utf8')).toBe('retain'); noTemps(moved);
  });
  symlinkIt.each([false, true])('rejects a leaf swap before writing with existing=%s', exists => {
    if (exists) fs.writeFileSync(target, 'old catalog');
    const realWrite = fs.writeFileSync; let attacked = false;
    jest.spyOn(fs, 'writeFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, ...args: unknown[]) => {
      if (!attacked && (typeof file === 'number' || String(file) === target)) {
        attacked = true;
        if (exists) fs.unlinkSync(target);
        fs.symlinkSync(external, target, 'file');
      }
      return Reflect.apply(realWrite, fs, [file, ...args]);
    }) as typeof fs.writeFileSync);
    failed(invoke()); expect(attacked).toBe(true); noTemps();
    expect(fs.lstatSync(target).isSymbolicLink()).toBe(true);
  });
  it('detects a specs replacement between directory inspection and entry', () => {
    fs.writeFileSync(target, 'old catalog');
    const outside = join(parent, 'outside-specs'); fs.mkdirSync(outside);
    const realChdir = process.chdir; let attacked = false;
    jest.spyOn(process, 'chdir').mockImplementation(directory => {
      if (directory === 'specs' && !attacked) {
        attacked = true;
        fs.renameSync(join(root, 'specs'), join(parent, 'original-specs'));
        fs.symlinkSync(outside, join(root, 'specs'), process.platform === 'win32' ? 'junction' : 'dir');
      }
      realChdir(directory);
    });
    failed(invoke()); expect(attacked).toBe(true); expect(fs.readdirSync(outside)).toEqual([]);
  });
  it.each(['symlink', 'directory'] as const)('rejects a %s replacement between directory open and metadata read', kind => {
    fs.writeFileSync(target, 'old catalog');
    const outside = join(parent, 'outside-specs'); fs.mkdirSync(outside);
    const realOpen = fs.openSync; let attacked = false, swapped = false;
    jest.spyOn(fs, 'openSync').mockImplementation(((file: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
      const descriptor = realOpen(file, flags, mode);
      if (String(file) === 'specs' && !attacked) {
        attacked = true;
        try { fs.renameSync(join(root, 'specs'), join(parent, 'original-specs')); swapped = true; }
        catch (error) {
          if (process.platform !== 'win32' || !['EACCES', 'EPERM', 'EBUSY'].includes((error as NodeJS.ErrnoException).code!)) throw error;
        }
        if (swapped) {
          if (kind === 'symlink') fs.symlinkSync(outside, join(root, 'specs'), process.platform === 'win32' ? 'junction' : 'dir');
          else fs.mkdirSync(join(root, 'specs'));
        }
      }
      return descriptor;
    }) as typeof fs.openSync);
    const result = invoke();
    expect(attacked).toBe(true);
    if (swapped) failed(result); else expect(result.code).toBe(0);
    expect(fs.readdirSync(outside)).toEqual([]);
  });
  it.each(['directory', 'link'] as const)('fails closed for independently mismatched %s metadata before directory entry', kind => {
    const outside = join(parent, 'outside-specs'); fs.mkdirSync(outside);
    const link = join(parent, 'observed-link');
    fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    const observation = fs.lstatSync(kind === 'link' ? link : outside, { bigint: true });
    const realStat = fs.lstatSync; let injected = false;
    jest.spyOn(fs, 'lstatSync').mockImplementation(((file: fs.PathLike, ...args: unknown[]) => {
      if (String(file) === 'specs') { injected = true; return observation; }
      return Reflect.apply(realStat, fs, [file, ...args]);
    }) as typeof fs.lstatSync);
    failed(invoke()); expect(injected).toBe(true);
    expect(fs.existsSync(target)).toBe(false); expect(fs.readdirSync(outside)).toEqual([]);
  });
  it('pins the directory when a parent changes immediately before opening the output', () => {
    fs.writeFileSync(target, 'old catalog');
    const outside = join(parent, 'outside-specs'); fs.mkdirSync(outside);
    fs.writeFileSync(join(outside, 'CATALOG.md'), 'retain');
    const realOpen = fs.openSync; let attacked = false, swapped = false;
    jest.spyOn(fs, 'openSync').mockImplementation(((file: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
      if (!attacked && (String(file) === target || String(file).startsWith('.copilot-catalog-'))) {
        attacked = true;
        try { fs.renameSync(join(root, 'specs'), join(parent, 'original-specs')); swapped = true; }
        catch (error) {
          if (process.platform !== 'win32' || !['EACCES', 'EPERM', 'EBUSY'].includes((error as NodeJS.ErrnoException).code!)) throw error;
        }
        if (swapped) fs.symlinkSync(outside, join(root, 'specs'), process.platform === 'win32' ? 'junction' : 'dir');
      }
      return realOpen(file, flags, mode);
    }) as typeof fs.openSync);
    const result = invoke();
    expect(attacked).toBe(true);
    if (swapped) { failed(result); noTemps(join(parent, 'original-specs')); }
    else expect(result.code).toBe(0);
    expect(fs.readFileSync(join(outside, 'CATALOG.md'), 'utf8')).toBe('retain');
    noTemps(outside);
  });
  it('keeps the original caller directory when its old specs pathname becomes a link', () => {
    fs.writeFileSync(target, 'old catalog');
    const outside = join(parent, 'outside-specs'); fs.mkdirSync(outside);
    fs.writeFileSync(join(outside, 'CATALOG.md'), 'retain');
    process.chdir(join(root, 'specs'));
    const caller = fs.lstatSync('.', { bigint: true });
    const realOpen = fs.openSync; let attacked = false, swapped = false;
    jest.spyOn(fs, 'openSync').mockImplementation(((file: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
      if (!attacked && String(file).startsWith('.copilot-catalog-')) {
        attacked = true;
        try { fs.renameSync(join(root, 'specs'), join(parent, 'original-specs')); swapped = true; }
        catch (error) {
          if (process.platform !== 'win32' || !['EACCES', 'EPERM', 'EBUSY'].includes((error as NodeJS.ErrnoException).code!)) throw error;
        }
        if (swapped) fs.symlinkSync(outside, join(root, 'specs'), process.platform === 'win32' ? 'junction' : 'dir');
      }
      return realOpen(file, flags, mode);
    }) as typeof fs.openSync);
    const result = invoke();
    expect(attacked).toBe(true);
    expect(result.code).toBe(swapped ? 1 : 0);
    const retained = fs.lstatSync('.', { bigint: true });
    expect([retained.dev, retained.ino]).toEqual([caller.dev, caller.ino]);
    expect(fs.readFileSync(join(outside, 'CATALOG.md'), 'utf8')).toBe('retain');
    noTemps(swapped ? join(parent, 'original-specs') : join(root, 'specs'));
  });
  it('fails without entering a replacement at the original caller directory path', () => {
    const origin = join(parent, 'caller'); fs.mkdirSync(origin); process.chdir(origin);
    const realSync = fs.fsyncSync; let attacked = false;
    jest.spyOn(fs, 'fsyncSync').mockImplementation(descriptor => {
      realSync(descriptor); attacked = true;
      fs.renameSync(origin, join(parent, 'caller-moved')); fs.mkdirSync(origin);
    });
    const result = invoke();
    expect(attacked).toBe(true); expect(result.code).toBe(1); expect(result.logs).not.toContain('PASS');
    expect(fs.realpathSync('.')).not.toBe(fs.realpathSync(origin));
    expect(fs.readdirSync(origin)).toEqual([]);
    expect(fs.readFileSync(external, 'utf8')).toBe('SYNTHETIC_SENTINEL');
  });
  it('preserves a competing new catalog at the no-replace publication boundary', () => {
    const realLink = fs.linkSync; let attacked = false;
    jest.spyOn(fs, 'linkSync').mockImplementation((from, to) => {
      if (String(to) === 'CATALOG.md') { attacked = true; fs.writeFileSync(target, 'concurrent winner'); }
      return realLink(from, to);
    });
    failed(invoke()); expect(attacked).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe('concurrent winner'); noTemps();
  });
  it('preserves a regular catalog edited by another writer before publication', () => {
    fs.writeFileSync(target, 'old catalog');
    const realSync = fs.fsyncSync; let attacked = false;
    jest.spyOn(fs, 'fsyncSync').mockImplementation(descriptor => {
      realSync(descriptor); attacked = true; fs.writeFileSync(target, 'concurrent winner');
    });
    failed(invoke()); expect(attacked).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe('concurrent winner'); noTemps();
  });
  symlinkIt('cannot follow a leaf replaced at the final atomic rename boundary', () => {
    fs.writeFileSync(target, 'old catalog');
    const realRename = fs.renameSync; let attacked = false;
    jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (String(to) === 'CATALOG.md') {
        attacked = true; fs.unlinkSync(target); fs.symlinkSync(external, target, 'file');
      }
      return realRename(from, to);
    });
    const result = invoke();
    expect(attacked).toBe(true); expect(result.code).toBe(0);
    expect(fs.readFileSync(external, 'utf8')).toBe('SYNTHETIC_SENTINEL');
    expect(fs.lstatSync(target).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(target, 'utf8')).toBe(renderCatalog(catalog)); noTemps();
  });
  symlinkIt('rejects a substituted temporary link before publication and preserves the foreign link', () => {
    fs.writeFileSync(target, 'old catalog');
    const realOpen = fs.openSync, realWrite = fs.writeFileSync; let temporary = '';
    jest.spyOn(fs, 'openSync').mockImplementation(((file: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
      if (String(file).startsWith('.copilot-catalog-')) temporary = String(file);
      return realOpen(file, flags, mode);
    }) as typeof fs.openSync);
    jest.spyOn(fs, 'writeFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, ...args: unknown[]) => {
      const result = Reflect.apply(realWrite, fs, [file, ...args]);
      if (typeof file === 'number' && temporary) {
        fs.unlinkSync(temporary); fs.symlinkSync(external, temporary, 'file');
      }
      return result;
    }) as typeof fs.writeFileSync);
    failed(invoke()); expect(temporary).toMatch(/^\.copilot-catalog-/u);
    expect(fs.lstatSync(join(root, 'specs', temporary)).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe('old catalog');
  });
  it('does not claim success when a competing file replaces the published index', () => {
    fs.writeFileSync(target, 'old catalog');
    const realRename = fs.renameSync; let attacked = false;
    jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      realRename(from, to);
      if (String(to) === 'CATALOG.md') { attacked = true; fs.unlinkSync(target); fs.writeFileSync(target, 'concurrent winner'); }
    });
    failed(invoke()); expect(attacked).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe('concurrent winner'); noTemps();
  });
  it('cleans its temporary file and preserves the old catalog on write failure', () => {
    fs.writeFileSync(target, 'old catalog');
    const realWrite = fs.writeFileSync;
    jest.spyOn(fs, 'writeFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, ...args: unknown[]) => {
      if (typeof file === 'number' || String(file) === target) throw Object.assign(new Error('fixture write failure'), { code: 'ENOSPC' });
      return Reflect.apply(realWrite, fs, [file, ...args]);
    }) as typeof fs.writeFileSync);
    failed(invoke()); expect(fs.readFileSync(target, 'utf8')).toBe('old catalog'); noTemps();
  });
  it('preserves existing files when output metadata cannot be inspected', () => {
    fs.writeFileSync(target, 'old catalog');
    const realStat = fs.lstatSync; let rejected = false;
    jest.spyOn(fs, 'lstatSync').mockImplementation(((file: fs.PathLike, ...args: unknown[]) => {
      if (String(file) === 'CATALOG.md') { rejected = true; throw Object.assign(new Error('fixture metadata failure'), { code: 'EACCES' }); }
      return Reflect.apply(realStat, fs, [file, ...args]);
    }) as typeof fs.lstatSync);
    failed(invoke()); expect(rejected).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe('old catalog'); noTemps();
  });
  it('preserves a foreign temporary-file collision when exclusive opening fails', () => {
    fs.writeFileSync(target, 'old catalog');
    const realOpen = fs.openSync, realWrite = fs.writeFileSync; let foreign = '';
    jest.spyOn(fs, 'openSync').mockImplementation(((file: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
      if (!foreign && String(file).startsWith('.copilot-catalog-')) {
        foreign = String(file); realWrite(file, 'foreign bytes', { flag: 'wx' });
      }
      return realOpen(file, flags, mode);
    }) as typeof fs.openSync);
    failed(invoke()); expect(foreign).toMatch(/^\.copilot-catalog-/u);
    expect(fs.readFileSync(join(root, 'specs', foreign), 'utf8')).toBe('foreign bytes');
    expect(fs.readFileSync(target, 'utf8')).toBe('old catalog');
  });
  it('cleans its temporary file and preserves the old catalog on rename failure', () => {
    fs.writeFileSync(target, 'old catalog');
    jest.spyOn(fs, 'renameSync').mockImplementation(() => { throw Object.assign(new Error('fixture rename failure'), { code: 'EACCES' }); });
    failed(invoke()); expect(fs.readFileSync(target, 'utf8')).toBe('old catalog'); noTemps();
  });
  it('does not delete a foreign replacement at its temporary filename', () => {
    fs.writeFileSync(target, 'old catalog');
    let foreign = '';
    jest.spyOn(fs, 'renameSync').mockImplementation(from => {
      foreign = String(from); fs.unlinkSync(from); fs.writeFileSync(from, 'foreign bytes');
      throw new Error('fixture replacement');
    });
    failed(invoke()); expect(foreign).toMatch(/^\.copilot-catalog-/u);
    expect(fs.readFileSync(join(root, 'specs', foreign), 'utf8')).toBe('foreign bytes');
    expect(fs.readFileSync(target, 'utf8')).toBe('old catalog');
  });
  it('does not publish any file for an invalid catalog', () => {
    fs.unlinkSync(join(root, 'test/main.test.ts'));
    const result = cli();
    expect(result.status).toBe(1); expect(result.stdout).not.toContain('PASS');
    expect(fs.existsSync(target)).toBe(false); noTemps();
  });
  symlinkIt('rejects a linked index in read-only validation before reading its contents', () => {
    fs.symlinkSync(external, target, 'file');
    const read = jest.spyOn(fs, 'readFileSync'); const realRead = read.getMockImplementation()!;
    read.mockImplementation(((file: fs.PathOrFileDescriptor, ...args: unknown[]) => {
      if (String(file) === target) throw new Error('linked contents must not be read');
      return Reflect.apply(realRead, fs, [file, ...args]);
    }) as typeof fs.readFileSync);
    const result = invoke(false);
    expect(result.code).toBe(1); expect(result.logs).not.toContain('PASS');
    expect(read.mock.calls.some(([file]) => String(file) === target)).toBe(false);
  });
  it('does not read a different regular index substituted immediately before open', () => {
    fs.writeFileSync(target, 'old catalog');
    const realOpen = fs.openSync, realRead = fs.readFileSync; let attacked = false, readDescriptor = false;
    jest.spyOn(fs, 'openSync').mockImplementation(((file: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
      if (String(file) === 'CATALOG.md' && !attacked) {
        attacked = true; fs.unlinkSync(target); fs.writeFileSync(target, 'concurrent winner');
      }
      return realOpen(file, flags, mode);
    }) as typeof fs.openSync);
    jest.spyOn(fs, 'readFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, ...args: unknown[]) => {
      if (typeof file === 'number') readDescriptor = true;
      return Reflect.apply(realRead, fs, [file, ...args]);
    }) as typeof fs.readFileSync);
    failed(invoke(false)); expect(attacked).toBe(true); expect(readDescriptor).toBe(false);
    expect(fs.readFileSync(target, 'utf8')).toBe('concurrent winner');
  });
  it('does not consume data changed immediately after the opened file was inspected', () => {
    fs.writeFileSync(target, 'old catalog');
    const realStat = fs.fstatSync, realRead = fs.readFileSync; let attacked = false, readDescriptor = false;
    jest.spyOn(fs, 'fstatSync').mockImplementation(((descriptor: number, ...args: unknown[]) => {
      const info = Reflect.apply(realStat, fs, [descriptor, ...args]) as fs.Stats;
      if (info.isFile() && !attacked) { attacked = true; fs.writeFileSync(target, 'concurrent winner'); }
      return info;
    }) as typeof fs.fstatSync);
    jest.spyOn(fs, 'readFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, ...args: unknown[]) => {
      if (typeof file === 'number') readDescriptor = true;
      return Reflect.apply(realRead, fs, [file, ...args]);
    }) as typeof fs.readFileSync);
    failed(invoke(false)); expect(attacked).toBe(true); expect(readDescriptor).toBe(false);
    expect(fs.readFileSync(target, 'utf8')).toBe('concurrent winner');
  });
  it('rejects an index that changes after its data was read', () => {
    fs.writeFileSync(target, 'old catalog');
    const realRead = fs.readFileSync; let attacked = false;
    jest.spyOn(fs, 'readFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, ...args: unknown[]) => {
      const content = Reflect.apply(realRead, fs, [file, ...args]);
      if (typeof file === 'number') { attacked = true; fs.writeFileSync(target, 'concurrent winner'); }
      return content;
    }) as typeof fs.readFileSync);
    failed(invoke(false)); expect(attacked).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toBe('concurrent winner');
  });
  symlinkIt('rejects a link substituted after readonly open before consuming data', () => {
    fs.writeFileSync(target, 'old catalog');
    const realOpen = fs.openSync, realRead = fs.readFileSync; let attacked = false, readDescriptor = false;
    jest.spyOn(fs, 'openSync').mockImplementation(((file: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
      const descriptor = realOpen(file, flags, mode);
      if (String(file) === 'CATALOG.md' && !attacked) {
        attacked = true; fs.unlinkSync(target); fs.symlinkSync(external, target, 'file');
      }
      return descriptor;
    }) as typeof fs.openSync);
    jest.spyOn(fs, 'readFileSync').mockImplementation(((file: fs.PathOrFileDescriptor, ...args: unknown[]) => {
      if (typeof file === 'number') readDescriptor = true;
      return Reflect.apply(realRead, fs, [file, ...args]);
    }) as typeof fs.readFileSync);
    failed(invoke(false)); expect(attacked).toBe(true); expect(readDescriptor).toBe(false);
  });
  it('regenerates a regular file without modifying an external hard-link alias', () => {
    fs.writeFileSync(target, 'old shared bytes'); fs.unlinkSync(external); fs.linkSync(target, external);
    const result = cli();
    expect(result.status).toBe(0);
    expect(fs.readFileSync(target, 'utf8')).toBe(renderCatalog(catalog));
    expect(fs.readFileSync(external, 'utf8')).toBe('old shared bytes'); noTemps();
  });
});
