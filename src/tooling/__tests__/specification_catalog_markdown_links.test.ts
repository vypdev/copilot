import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Node, Parser } from 'commonmark';
import { capability, catalog } from './fixtures/proposed_sdd_catalog';

const validator = require('../../infrastructure/specification_catalog_validator.cjs');
const upstream = resolve(__dirname, '../../..');

describe('catalog Markdown navigation to accepted repository files', () => {
  let root: string;
  let previousExit: typeof process.exitCode;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'catalog-markdown-links-'));
    previousExit = process.exitCode;
    process.exitCode = 0;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.exitCode = previousExit;
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  function fixture(stem: string, codePath = `lib/${stem}.cpp`) {
    const item = capability('navigation');
    item.specs = [`specs/${stem}.md`, `specs/companion/${stem}.md`];
    item.workflows = [`.github/workflows/${stem}.yml`];
    item.entrypoints = [`app/${stem}.ts`];
    item.code = [codePath];
    item.tests = [`tests/${stem}.test.cpp`];
    item.documentation = [`docs/${stem}.md`];
    const paths = [...item.specs, ...item.workflows, ...item.entrypoints,
      ...item.code, ...item.tests, ...item.documentation];
    for (const relative of paths) {
      mkdirSync(dirname(join(root, relative)), { recursive: true });
      writeFileSync(join(root, relative), '# Prospective evidence\n\n- Status: Draft\n');
    }
    const value = catalog([item]);
    writeFileSync(join(root, 'specs/catalog.json'), JSON.stringify(value));
    expect(validator.validateCatalog(root, value)).toEqual([]);
    return { value, paths, primary: item.specs[0] };
  }

  function assertNavigation(markdown: string, sample: ReturnType<typeof fixture>) {
    const walker = new Parser().parse(markdown).walker();
    const links: Node[] = [];
    let event;
    while ((event = walker.next())) {
      if (event.entering && event.node.type === 'link') links.push(event.node);
    }
    const targets = ['specs/catalog.json', sample.primary, ...sample.paths];
    expect(links).toHaveLength(targets.length);
    links.forEach((link, index) => {
      expect(link.destination).toMatch(/^\.\.?\//u);
      const destination = resolve(root, 'specs', decodeURIComponent(link.destination!));
      expect(statSync(destination).isFile()).toBe(true);
      expect(realpathSync(destination, { encoding: 'buffer' }))
        .toEqual(realpathSync(join(root, targets[index]), { encoding: 'buffer' }));
      if (index >= 2) {
        expect(link.firstChild?.type).toBe('code');
        expect(link.firstChild?.literal).toBe(targets[index]);
        expect(link.firstChild?.next).toBeNull();
      }
    });
  }

  it.each([
    ['unmatched closing parenthesis', 'foo)'],
    ['unmatched opening parenthesis', '(foo'],
    ['balanced parentheses', '(foo)'],
    ['nested paths', 'group)/child('],
    ['spaces', 'with space'],
    ['Unicode', 'café 東京'],
    ['fragment-like names', 'hash#fragment'],
    ['literal percent escapes', 'literal%2F20'],
    ['brackets', 'brackets[one]'],
    ['a backtick', 'back`tick'],
    ['a backtick run', 'back``tick'],
    ['apostrophes and exclamation marks', "!single'quote"],
  ])('navigates primary, companion and every evidence role with %s', (_name, stem) => {
    const sample = fixture(stem);
    const source = readFileSync(join(root, 'specs/catalog.json'), 'utf8');
    assertNavigation(validator.renderCatalog(sample.value), sample);
    expect(readFileSync(join(root, 'specs/catalog.json'), 'utf8')).toBe(source);
  });

  it.each(['`', 'tail`'])('preserves the literal code label for the accepted file %s', codePath => {
    const sample = fixture('ordinary', codePath);
    assertNavigation(validator.renderCatalog(sample.value), sample);
  });

  it('uses filesystem UTF-8 replacement for an accepted unpaired-surrogate evidence name', () => {
    const sample = fixture('ordinary', 'lib/bad\uD800.ts');
    assertNavigation(validator.renderCatalog(sample.value), sample);
  });

  it('generates navigable links and validates them through the instrumented entrypoint', () => {
    const sample = fixture('group)/name #é%20');
    const source = readFileSync(join(root, 'specs/catalog.json'), 'utf8');
    validator.main(['--write'], root);
    expect(process.exitCode).toBe(0);
    assertNavigation(readFileSync(join(root, 'specs/CATALOG.md'), 'utf8'), sample);
    validator.main([], root);
    expect(process.exitCode).toBe(0);
    expect(console.log).toHaveBeenLastCalledWith('specification catalog validation: PASS (1 capabilities)');
    expect(readFileSync(join(root, 'specs/catalog.json'), 'utf8')).toBe(source);
  });

  it('generates and validates navigable links in the matching standalone three-file SDK', () => {
    const sample = fixture('group)/name #é%20');
    for (const relative of ['src/infrastructure/specification_catalog_validator.cjs',
      'src/infrastructure/specification_catalog_publication.cjs', 'src/domain/specification_catalog_path_policy.cjs']) {
      mkdirSync(dirname(join(root, relative)), { recursive: true });
      copyFileSync(join(upstream, relative), join(root, relative));
    }
    const source = readFileSync(join(root, 'specs/catalog.json'), 'utf8');
    expect(execFileSync(process.execPath, ['src/infrastructure/specification_catalog_validator.cjs', '--write'],
      { cwd: root, encoding: 'utf8' })).toContain('generation: PASS');
    assertNavigation(readFileSync(join(root, 'specs/CATALOG.md'), 'utf8'), sample);
    expect(execFileSync(process.execPath, ['src/infrastructure/specification_catalog_validator.cjs'],
      { cwd: root, encoding: 'utf8' })).toContain('validation: PASS');
    expect(existsSync(join(root, 'package.json'))).toBe(false);
    expect(readFileSync(join(root, 'specs/catalog.json'), 'utf8')).toBe(source);
  });
});
