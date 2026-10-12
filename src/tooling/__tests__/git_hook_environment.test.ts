import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const { createVerificationEnvironment } = require('../../../scripts/git-hooks/verification-environment.cjs') as {
  createVerificationEnvironment(environment: Readonly<NodeJS.ProcessEnv>, localGitVariables: readonly string[]): NodeJS.ProcessEnv;
};
const localVariables = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT'];
describe('hook validation environment', () => {
  it('removes every native repository binding supplied by Git', () => {
    const environment = Object.fromEntries(localVariables.map(name => [name, 'fixture-binding']));
    expect(createVerificationEnvironment(environment, localVariables)).toEqual({});
  });
  it('honors additional native local variables without hardcoding the Git version', () => {
    expect(createVerificationEnvironment({ GIT_NAMESPACE: 'fixture', PATH: 'runtime' }, ['GIT_NAMESPACE'])).toEqual({ PATH: 'runtime' });
  });
  it('removes paired config keys and values even after the count is cleared', () => {
    expect(createVerificationEnvironment({ GIT_CONFIG_KEY_0: 'core.bare', GIT_CONFIG_VALUE_0: 'true', GIT_CONFIG_COUNT: '1' }, ['GIT_CONFIG_COUNT'])).toEqual({});
  });
  it('retains the existing isolation from all agent override fields', () => {
    const environment = Object.fromEntries(['AGENT_PROVIDER', 'AGENT_MODEL', 'AGENT_EXECUTABLE', 'AGENT_MODEL_PROVIDER', 'AGENT_ALLOWED_MODEL_PROVIDERS', 'AGENT_ALLOWED_MODELS'].map(name => [name, 'fixture-agent']));
    expect(createVerificationEnvironment(environment, [])).toEqual({});
  });
  it('preserves Node, Windows and global Git runtime settings', () => {
    const environment = { PATH: 'runtime', SYSTEMROOT: 'windows-runtime', TEMP: 'temporary', GIT_CONFIG_GLOBAL: 'global-policy', CI: 'true', COPILOT_PACKAGE_MANAGER: 'pnpm' };
    expect(createVerificationEnvironment(environment, localVariables)).toEqual(environment);
  });
  it('does not mutate the hook environment', () => {
    const environment = Object.freeze({ GIT_DIR: 'fixture', PATH: 'runtime' });
    expect(createVerificationEnvironment(environment, localVariables)).toEqual({ PATH: 'runtime' });
    expect(environment).toEqual({ GIT_DIR: 'fixture', PATH: 'runtime' });
  });
  it('keeps a real linked checkout intact when its commit hook initializes another bare fixture', () => {
    const directory = mkdtempSync(join(tmpdir(), 'copilot-hook-env-'));
    const main = join(directory, 'main'), linked = join(directory, 'linked'), other = join(directory, 'other.git');
    const nativeVariables = spawnSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).stdout!.trim().split(/\r?\n/u);
    const environment = createVerificationEnvironment(process.env, nativeVariables);
    const git = (cwd: string, ...args: string[]) => {
      const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: environment });
      if (result.status !== 0) throw new Error(result.stderr);
      return result.stdout.trim();
    };
    try {
      mkdirSync(main); git(main, 'init'); git(main, 'config', 'user.name', 'Fixture'); git(main, 'config', 'user.email', 'fixture@example.test');
      writeFileSync(join(main, 'seed'), 'seed'); git(main, 'add', 'seed'); git(main, '-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', 'commit', '-m', 'seed');
      git(main, 'worktree', 'add', '--detach', linked, 'HEAD');
      const hooks = join(directory, 'hooks'); mkdirSync(hooks);
      const program = join(directory, 'probe.cjs'), receipt = join(directory, 'receipt.json');
      writeFileSync(program, `const {spawnSync}=require('node:child_process');
const {createVerificationEnvironment}=require(${JSON.stringify(resolve('scripts/git-hooks/verification-environment.cjs'))});
const names=spawnSync('git',['rev-parse','--local-env-vars'],{encoding:'utf8'}).stdout.trim().split(/\\r?\\n/u);
const env=createVerificationEnvironment(process.env,names);
const result=spawnSync('git',['init','--bare',${JSON.stringify(other)}],{env,encoding:'utf8'});
require('node:fs').writeFileSync(${JSON.stringify(receipt)},JSON.stringify({status:result.status,hadBindings:Boolean(process.env.GIT_DIR||process.env.GIT_INDEX_FILE),cleared:!env.GIT_DIR&&!env.GIT_INDEX_FILE}));
process.exit(result.status??1);`);
      writeFileSync(join(hooks, 'pre-commit'), `#!/bin/sh\nexec node "${program.replace(/\\/gu, '/')}"\n`); chmodSync(join(hooks, 'pre-commit'), 0o755);
      writeFileSync(join(linked, 'change'), 'change'); git(linked, 'add', 'change');
      git(linked, '-c', `core.hooksPath=${hooks}`, '-c', 'commit.gpgsign=false', 'commit', '-m', 'change');
      expect(JSON.parse(readFileSync(receipt, 'utf8'))).toEqual({ status: 0, hadBindings: true, cleared: true });
      expect(git(main, 'config', '--get', 'core.bare')).toBe('false');
      expect(git(linked, 'status', '--porcelain')).toBe('');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
