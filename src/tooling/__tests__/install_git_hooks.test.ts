import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const installer = resolve('scripts/install-git-hooks.cjs');
const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'copilot-hook-install-')); roots.push(root); return root;
}
function runGit(root: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' } });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
function sources(root: string) {
  mkdirSync(join(root, 'scripts', 'git-hooks'), { recursive: true });
  copyFileSync(installer, join(root, 'scripts', 'install-git-hooks.cjs'));
  writeFileSync(join(root, 'scripts', 'git-hooks', 'pre-commit'), '#!/bin/sh\nROOT=$(git rev-parse --show-toplevel)\nexec node "$ROOT/scripts/git-hooks/pre-commit.cjs"\n');
  writeFileSync(join(root, 'scripts', 'git-hooks', 'pre-commit.cjs'), "require('node:fs').writeFileSync('hook-ran.txt', 'verified');\n");
}
function install(root: string) { return spawnSync(process.execPath, [join(root, 'scripts', 'install-git-hooks.cjs')], { cwd: root, encoding: 'utf8' }); }
function repository() {
  const root = fixture(); runGit(root, 'init');
  runGit(root, 'config', 'user.email', 'fixture@example.test'); runGit(root, 'config', 'user.name', 'Fixture');
  writeFileSync(join(root, 'seed.txt'), 'seed'); runGit(root, 'add', 'seed.txt');
  runGit(root, '-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', 'commit', '-m', 'seed'); return root;
}
function worktree(name = 'linked') {
  const main = repository(), linked = join(main, name);
  runGit(main, 'worktree', 'add', '--detach', linked, 'HEAD'); sources(linked);
  return { main, linked, metadata: runGit(linked, 'rev-parse', '--git-dir') };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe('repository hooks install in normal and linked checkouts', () => {
  it('does nothing in a packaged nongit directory', () => {
    const root = fixture(); sources(root);
    expect(install(root).status).toBe(0); expect(existsSync(join(root, '.git'))).toBe(false);
  });
  it('installs the source launchers in a normal repository with executable permissions where supported', () => {
    const root = repository(); sources(root); expect(install(root).status).toBe(0);
    const hook = join(root, '.git', 'hooks', 'pre-commit');
    expect(readFileSync(hook, 'utf8')).toContain('scripts/git-hooks/pre-commit.cjs');
    if (process.platform !== 'win32') expect(statSync(hook).mode & 0o111).toBe(0o111);
  });
  it('installs in both the worktree metadata and the shared Git metadata without changing hook configuration', () => {
    const { main, linked, metadata } = worktree();
    const before = spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd: linked, encoding: 'utf8' }).stdout;
    expect(install(linked).status).toBe(0);
    expect(readFileSync(join(metadata, 'hooks', 'pre-commit'), 'utf8')).toContain('scripts/git-hooks/pre-commit.cjs');
    expect(existsSync(join(main, '.git', 'hooks', 'pre-commit'))).toBe(true);
    expect(spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd: linked, encoding: 'utf8' }).stdout).toBe(before);
  });
  it('runs the installed worktree hook in a real isolated commit', () => {
    const { linked, metadata } = worktree(); expect(install(linked).status).toBe(0);
    writeFileSync(join(linked, 'change.txt'), 'change'); runGit(linked, 'add', 'change.txt');
    runGit(linked, '-c', `core.hooksPath=${join(metadata, 'hooks')}`, '-c', 'commit.gpgsign=false', 'commit', '-m', 'change');
    expect(readFileSync(join(linked, 'hook-ran.txt'), 'utf8')).toBe('verified');
  });
  it('resolves native metadata correctly with spaces in the worktree name', () => {
    const { linked, metadata } = worktree('linked with spaces');
    expect(install(linked).status).toBe(0);
    expect(existsSync(join(metadata, 'hooks', 'pre-commit'))).toBe(true);
  });
  it('preserves the no-op behavior when source hooks are missing', () => {
    const root = repository(); mkdirSync(join(root, 'scripts'));
    copyFileSync(installer, join(root, 'scripts', 'install-git-hooks.cjs'));
    expect(install(root).status).toBe(0); expect(existsSync(join(root, '.git', 'hooks', 'pre-commit'))).toBe(false);
  });
  it('does not create metadata or expose raw Git errors for a corrupt gitdir file', () => {
    const root = fixture(); sources(root); const foreign = join(root, 'absent-private-metadata');
    writeFileSync(join(root, '.git'), `gitdir: ${foreign}\n`);
    const result = install(root); expect(result.status).toBe(0);
    expect(existsSync(foreign)).toBe(false); expect(result.stderr).not.toContain(foreign);
  });
  it('copies only hook files and skips nested source directories', () => {
    const root = repository(); sources(root); mkdirSync(join(root, 'scripts', 'git-hooks', 'nested'));
    expect(install(root).status).toBe(0); expect(existsSync(join(root, '.git', 'hooks', 'nested'))).toBe(false);
  });
});
