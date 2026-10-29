import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { capability, documents, implementation, catalog } from './fixtures/proposed_sdd_catalog';

const validator = require('../../infrastructure/specification_catalog_validator.cjs');
const upstream = resolve(__dirname, '../../..');

describe('standalone SDK catalog bootstrap entrypoint', () => {
  let root: string; let previousExit: typeof process.exitCode;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'proposed-sdk-cli-')); previousExit = process.exitCode; process.exitCode = 0;
    const item = capability(); documents(root, item);
    writeFileSync(join(root, 'specs/catalog.json'), JSON.stringify(catalog([item])));
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => { process.exitCode = previousExit; jest.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });

  it('generates and validates a truthful index through the instrumented library entrypoint', () => {
    const source = readFileSync(join(root, 'specs/catalog.json'), 'utf8');
    validator.main(['--write'], root);
    expect(process.exitCode).toBe(0);
    expect(readFileSync(join(root, 'specs/CATALOG.md'), 'utf8')).toContain('Not yet implemented (proposed capability).');
    validator.main([], root);
    expect(console.log).toHaveBeenLastCalledWith('specification catalog validation: PASS (1 capabilities)');
    expect(readFileSync(join(root, 'specs/catalog.json'), 'utf8')).toBe(source);
  });

  it('runs the matching three-file portable SDK with no consumer package or fake product code', () => {
    for (const relative of ['src/infrastructure/specification_catalog_validator.cjs',
      'src/infrastructure/specification_catalog_publication.cjs', 'src/domain/specification_catalog_path_policy.cjs']) {
      mkdirSync(dirname(join(root, relative)), { recursive: true }); copyFileSync(join(upstream, relative), join(root, relative));
    }
    const guide = readFileSync(join(upstream, 'docs/development/specifications.mdx'), 'utf8');
    const block = [...guide.matchAll(/```bash\r?\n([\s\S]*?)```/gu)].find(match => match[1].includes('node src/infrastructure/specification_catalog_validator.cjs --write'));
    const commands = block![1].trim().split(/\r?\n/u);
    expect(commands).toEqual(['node src/infrastructure/specification_catalog_validator.cjs --write', 'node src/infrastructure/specification_catalog_validator.cjs']);
    expect(execFileSync(process.execPath, commands[0].split(' ').slice(1), { cwd: root, encoding: 'utf8' })).toContain('generation: PASS');
    expect(execFileSync(process.execPath, commands[1].split(' ').slice(1), { cwd: root, encoding: 'utf8' })).toContain('validation: PASS');
    expect(existsSync(join(root, 'package.json'))).toBe(false);
    expect(readFileSync(join(root, 'specs/CATALOG.md'), 'utf8')).toContain('Not yet implemented (proposed capability).');
  });

  it('rejects a stale index without claiming validation or changing its bytes', () => {
    writeFileSync(join(root, 'specs/CATALOG.md'), '# Stale\n');
    validator.main([], root);
    expect(process.exitCode).toBe(1); expect(console.log).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('specs/CATALOG.md is stale; run pnpm run generate:specifications.');
    expect(readFileSync(join(root, 'specs/CATALOG.md'), 'utf8')).toBe('# Stale\n');
  });

  it('preserves a foreign parent directory alias during generation failure', () => {
    const outside = mkdtempSync(join(tmpdir(), 'proposed-sdk-cli-outside-'));
    try {
      rmSync(join(root, 'specs'), { recursive: true });
      const item = capability(); documents(outside, item);
      writeFileSync(join(outside, 'specs/catalog.json'), JSON.stringify(catalog([item])));
      symlinkSync(join(outside, 'specs'), join(root, 'specs'), process.platform === 'win32' ? 'junction' : 'dir');
      expect(() => validator.main(['--write'], root)).toThrow('without symlinks');
      expect(existsSync(join(outside, 'specs/CATALOG.md'))).toBe(false); expect(console.log).not.toHaveBeenCalled();
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });

  it('reports a nonregular index with the existing actionable recovery', () => {
    mkdirSync(join(root, 'specs/CATALOG.md'));
    validator.main([], root);
    expect(process.exitCode).toBe(1); expect(console.log).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('could not be safely accessed'));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('then regenerate the catalog'));
  });

  it('does not generate output when a proposed supplied evidence file is missing', () => {
    const item = capability(); item.tests = ['checks/not-created.cjs'];
    writeFileSync(join(root, 'specs/catalog.json'), JSON.stringify(catalog([item])));
    validator.main(['--write'], root);
    expect(process.exitCode).toBe(1); expect(console.log).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('does not resolve to an existing file'));
    expect(existsSync(join(root, 'specs/CATALOG.md'))).toBe(false);
  });

  it.each([
    ['non-object root', null], ['array root', []], ['wrong version', { version: 2, capabilities: [] }],
    ['missing capabilities', { version: 1 }], ['non-object capability', { version: 1, capabilities: [null] }],
    ['missing metadata', { version: 1, capabilities: [{}] }],
  ])('reports %s through the real validator entrypoint', (_name, value) => {
    writeFileSync(join(root, 'specs/catalog.json'), JSON.stringify(value));
    validator.main(['--write'], root);
    expect(process.exitCode).toBe(1); expect(console.error).toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled(); expect(existsSync(join(root, 'specs/CATALOG.md'))).toBe(false);
  });

  it('renders partially supplied proposed implementation without losing real evidence links', () => {
    const item = capability(); implementation(root, item); item.tests = [];
    writeFileSync(join(root, 'specs/catalog.json'), JSON.stringify(catalog([item])));
    validator.main(['--write'], root);
    const rendered = readFileSync(join(root, 'specs/CATALOG.md'), 'utf8');
    expect(rendered).toContain('../lib/quote.cjs'); expect(rendered.split('Not yet implemented (proposed capability).')).toHaveLength(2);
    expect(process.exitCode).toBe(0);
  });

  it('validates the published greenfield catalog example without creating implementation evidence', () => {
    const guide = readFileSync(join(upstream, 'docs/issues/pre-branch-sdds.mdx'), 'utf8');
    const block = [...guide.matchAll(/```json\r?\n([\s\S]*?)```/gu)].find(match => match[1].includes('"version": 1') && match[1].includes('"capabilities"'));
    const example = JSON.parse(block![1]);
    rmSync(join(root, 'specs'), { recursive: true });
    for (const item of example.capabilities) {
      expect(item.status).toBe('proposed');
      for (const field of ['entrypoints', 'code', 'tests']) expect(item[field]).toEqual([]);
      for (const file of [...item.specs, ...item.documentation]) {
        expect(validator.isSafeRelativePath(file)).toBe(true);
        mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), '# Prospective document\n\n- Status: Draft\n');
      }
    }
    expect(validator.validateCatalog(root, example)).toEqual([]);
    expect(existsSync(join(root, 'lib'))).toBe(false); expect(existsSync(join(root, 'checks'))).toBe(false);
  });
});
