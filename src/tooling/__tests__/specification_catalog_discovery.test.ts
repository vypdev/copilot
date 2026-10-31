import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { canCreateFileSymlink } from '../../testing/file_symlink_capability';

const validatorFile = join(__dirname, '../../infrastructure/specification_catalog_validator.cjs');
const { validateCatalog, discoverSpecificationFiles, renderCatalog } = require(validatorFile);
const symlinkIt = canCreateFileSymlink() ? it : it.skip;
const diagnostic = (relative: string) => `${relative} is an unsupported symbolic link. Replace it with ordinary repository files before retrying specification catalog validation.`;

describe('complete specification discovery', () => {
  let parent: string, root: string, outside: string;
  const catalog = { version: 1, capabilities: [{
    id: 'example', title: 'Example', status: 'proposed', scope: 'Owned discovery fixture',
    owner: 'Maintainers', lastVerified: '2026-10-30', specs: ['specs/example.md'],
    workflows: [], entrypoints: ['source/entry.py'], code: ['source/entry.py'],
    tests: ['checks/example.py'], documentation: ['docs/guide.md'],
  }] };
  function write(relative: string, contents = '# Owned fixture\n') {
    const target = join(root, relative);
    fs.mkdirSync(dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  function directoryLink(target: string, relative: string) {
    fs.mkdirSync(dirname(join(root, relative)), { recursive: true });
    fs.symlinkSync(target, join(root, relative), process.platform === 'win32' ? 'junction' : 'dir');
  }
  function cli(writeOutput: boolean, module = validatorFile, standalone = false) {
    const env: NodeJS.ProcessEnv = {};
    for (const key of ['SystemRoot', 'NODE_V8_COVERAGE']) if (process.env[key]) env[key] = process.env[key];
    const args = standalone ? [module, ...(writeOutput ? ['--write'] : [])] : ['-e',
      'require(process.argv[1]).main(process.argv[2] === "--write" ? ["--write"] : [], process.argv[3]);',
      module, writeOutput ? '--write' : '--check', root];
    return spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', env, timeout: 10_000 });
  }
  function assertRejectedCli(writeOutput: boolean, module = validatorFile, standalone = false) {
    const before = fs.readFileSync(join(root, 'specs/CATALOG.md'));
    const result = cli(writeOutput, module, standalone);
    expect(result.error).toBeUndefined(); expect(result.status).toBe(1);
    expect(result.stdout).not.toContain('PASS'); expect(result.stderr).toContain('unsupported symbolic link');
    expect(fs.readFileSync(join(root, 'specs/CATALOG.md'))).toEqual(before);
    expect(fs.readFileSync(join(outside, 'hidden.md'), 'utf8')).toBe('OWNED_TARGET_SENTINEL');
    expect(fs.readdirSync(join(root, 'specs')).some(name => name.startsWith('.copilot-catalog-'))).toBe(false);
  }
  beforeEach(() => {
    parent = fs.mkdtempSync(join(tmpdir(), 'copilot-discovery-804-'));
    root = join(parent, 'repo'); outside = join(parent, 'owned-outside');
    for (const file of ['specs/example.md', 'source/entry.py', 'checks/example.py', 'docs/guide.md']) write(file);
    write('specs/catalog.json', JSON.stringify(catalog));
    write('specs/CATALOG.md', renderCatalog(catalog));
    fs.mkdirSync(outside); fs.writeFileSync(join(outside, 'hidden.md'), 'OWNED_TARGET_SENTINEL');
  });
  afterEach(() => { jest.restoreAllMocks(); fs.rmSync(parent, { recursive: true, force: true }); });

  symlinkIt.each(['specs/alias.md', 'specs/nested/alias.md'].flatMap(relative =>
    ['internal', 'external', 'dangling'].map(kind => ({ relative, kind })),
  ))('rejects $kind file link at $relative without reading its target', ({ relative, kind }) => {
    const target = kind === 'internal' ? join(root, 'specs/example.md')
      : join(outside, kind === 'external' ? 'hidden.md' : 'missing.md');
    fs.mkdirSync(dirname(join(root, relative)), { recursive: true });
    fs.symlinkSync(target, join(root, relative), 'file');
    const read = jest.spyOn(fs, 'readFileSync');
    expect(validateCatalog(root, catalog)).toEqual([diagnostic(relative)]);
    expect(read.mock.calls.some(([file]) => String(file) === target || String(file) === join(root, relative))).toBe(false);
    expect(fs.lstatSync(join(root, relative)).isSymbolicLink()).toBe(true);
  });

  it.each(['internal', 'external', 'cyclic', 'dangling'])('rejects a %s directory link without traversing it', kind => {
    const target = kind === 'internal' ? join(root, 'docs') : kind === 'cyclic' ? join(root, 'specs')
      : kind === 'external' ? outside : join(parent, 'missing-directory');
    const relative = 'specs/nested/alias-directory';
    directoryLink(target, relative);
    const readDirectory = jest.spyOn(fs, 'readdirSync');
    expect(validateCatalog(root, catalog)).toEqual([diagnostic(relative)]);
    expect(readDirectory.mock.calls.some(([file]) => String(file) === join(root, relative))).toBe(false);
    expect(readDirectory.mock.calls.filter(([file]) => String(file) === target)).toHaveLength(kind === 'cyclic' ? 1 : 0);
    expect(fs.lstatSync(join(root, relative)).isSymbolicLink()).toBe(true);
  });

  symlinkIt.each(['README.md', '_template.md', 'CATALOG.md'])('rejects a link using reserved root name %s', name => {
    const relative = `specs/${name}`;
    fs.rmSync(join(root, relative), { force: true });
    fs.symlinkSync(join(outside, 'hidden.md'), join(root, relative), 'file');
    expect(validateCatalog(root, catalog)).toEqual([diagnostic(relative)]);
    expect(fs.readFileSync(join(outside, 'hidden.md'), 'utf8')).toBe('OWNED_TARGET_SENTINEL');
  });

  it('preserves ordinary root standard files and non-Markdown exclusions', () => {
    for (const relative of ['specs/README.md', 'specs/_template.md', 'specs/notes.txt', 'specs/nested/data.json']) write(relative);
    expect(discoverSpecificationFiles(root)).toEqual(['specs/example.md']);
    expect(validateCatalog(root, catalog)).toEqual([]);
  });

  it('keeps registered nested SDDs and rejects an ordinary unregistered nested SDD', () => {
    write('specs/nested/registered.md');
    const registered = structuredClone(catalog);
    registered.capabilities[0].specs.push('specs/nested/registered.md');
    expect(validateCatalog(root, registered)).toEqual([]);
    write('specs/nested/unregistered.md');
    expect(validateCatalog(root, registered)).toEqual(['specs/nested/unregistered.md is not registered in the specification catalog.']);
  });

  for (const kind of ['file', 'directory'] as const) {
    (kind === 'file' ? symlinkIt : it)(`blocks both actual CLI commands on an unregistered ${kind} link`, () => {
      const relative = 'specs/alias.md';
      if (kind === 'file') fs.symlinkSync(join(outside, 'hidden.md'), join(root, relative), 'file');
      else directoryLink(outside, relative);
      assertRejectedCli(true); assertRejectedCli(false);
    });
  }

  it('does not return an apparently complete partial list from the exported discovery helper', () => {
    expect(discoverSpecificationFiles(root)).toEqual(['specs/example.md']);
    directoryLink(outside, 'specs/hidden');
    expect(() => discoverSpecificationFiles(root)).toThrow(diagnostic('specs/hidden'));
  });

  it.each([true, false])('rejects discovery in the actual copied standalone SDK with write=%s', writeOutput => {
    const files = ['src/infrastructure/specification_catalog_validator.cjs',
      'src/infrastructure/specification_catalog_publication.cjs', 'src/domain/specification_catalog_path_policy.cjs'];
    for (const relative of files) {
      const source = join(__dirname, '../../..', relative);
      fs.mkdirSync(dirname(join(root, relative)), { recursive: true });
      fs.copyFileSync(source, join(root, relative));
      expect(fs.readFileSync(join(root, relative))).toEqual(fs.readFileSync(source));
    }
    expect(cli(true, join(root, files[0]), true).status).toBe(0);
    expect(cli(false, join(root, files[0]), true).status).toBe(0);
    directoryLink(outside, 'specs/disguised.txt');
    assertRejectedCli(writeOutput, join(root, files[0]), true);
  });
});
