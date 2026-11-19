import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

it('rebuilds canonical LF bundles independently of Git checkout conversion and remains stable on a second pass', () => {
  const root = mkdtempSync(join(tmpdir(), 'copilot-bundle-lf-'));
  const source = resolve(__dirname, '../../..');
  const bundles = ['github_action', 'deployment_recovery', 'cli', 'api'];
  const canonical = '// café\nconst record = "\\r\\n";\n';
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  const validate = () => spawnSync(process.execPath, [join(root, 'scripts/validate-build.cjs')], { cwd: root, encoding: 'utf8' });
  const prepare = () => execFileSync(process.execPath, [join(root, 'scripts/prepare-generated-bundles.cjs')], { cwd: root });
  try {
    mkdirSync(join(root, 'scripts'));
    for (const file of ['prepare-generated-bundles.cjs', 'validate-build.cjs']) {
      copyFileSync(join(source, 'scripts', file), join(root, 'scripts', file));
    }
    for (const bundle of bundles) {
      mkdirSync(join(root, 'build', bundle), { recursive: true });
      writeFileSync(join(root, 'build', bundle, 'index.js'), canonical);
    }
    mkdirSync(join(root, 'build/api/src'));
    writeFileSync(join(root, 'build/api/src/api.d.ts'), 'export {};\n');
    git('init', '--quiet', '--template=');
    git('config', 'core.autocrlf', 'false');
    git('add', 'build');
    expect(validate().status).toBe(0);

    // ncc preserves vendor CRLF even on Unix; a local autocrlf=input can hide it.
    for (const bundle of bundles) {
      writeFileSync(join(root, 'build', bundle, 'index.js'), '// café\r\nconst record = "\\r\\n"; \t\r\n');
    }
    expect(validate().status).toBe(1);
    prepare();
    for (const bundle of bundles) expect(readFileSync(join(root, 'build', bundle, 'index.js'), 'utf8')).toBe(canonical);
    expect(validate().status).toBe(0);
    prepare();
    expect(validate().status).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
