import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { GitCommitPort } from '../../application/ports/git_ports';
import { BranchSyncWorkspaceAdapter } from '../branch_sync_workspace_adapter';

const bundles = ['build/cli/index.js', 'build/api/index.js', 'build/github_action/index.js'];
const cases = [
  ...bundles.map(path => ({ name: `preserves generated whitespace in ${path}`, path, phase: 'whitespace', valid: true })),
  { name: 'rejects whitespace in a generated-looking unregistered path', path: 'build/other/index.js', phase: 'whitespace', valid: false },
  { name: 'rejects whitespace in source', path: 'src/index.ts', phase: 'whitespace', valid: false },
  { name: 'rejects unstaged conflict markers in a canonical bundle', path: bundles[0], phase: 'markers', valid: false },
  { name: 'rejects staged conflict markers in a canonical bundle', path: bundles[0], phase: 'staged-markers', valid: false },
  { name: 'rejects staged source whitespace after resolution', path: 'src/index.ts', phase: 'staged-whitespace', valid: false },
  { name: 'retains protected bundle index authority', path: bundles[0], phase: 'protected-index', valid: false },
  { name: 'rejects verification mutation of a resolved bundle', path: bundles[0], phase: 'verification-mutation', valid: false },
];

describe('real Git branch sync generated-bundle validation', () => {
  it.each(cases)('$name', async scenario => {
    const root = mkdtempSync(join(tmpdir(), 'copilot-sync-bundle-'));
    const remote = join(root, 'remote.git');
    const workspace = join(root, 'workspace');
    const globalConfig = join(root, 'empty-config');
    writeFileSync(globalConfig, '');
    const env = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' };
    const gitAt = (cwd: string, args: readonly string[]) => execFileSync('git', [...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const write = (path: string, content: string) => {
      mkdirSync(dirname(join(workspace, path)), { recursive: true });
      writeFileSync(join(workspace, path), content);
    };
    try {
      gitAt(root, ['init', '--bare', remote]);
      gitAt(root, ['init', '--initial-branch=develop', workspace]);
      const commit = (message: string) => {
        gitAt(workspace, ['add', '.']);
        gitAt(workspace, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-m', message]);
      };
      const protectedPath = scenario.path === bundles[1] ? bundles[0] : bundles[1];
      write(scenario.path, 'base\n');
      write(protectedPath, 'base protected\n');
      commit('base');
      gitAt(workspace, ['branch', 'feature/42']);
      write(scenario.path, 'parent\n');
      write(protectedPath, 'parent protected\n');
      commit('parent');
      gitAt(workspace, ['checkout', 'feature/42']);
      write(scenario.path, 'child\n');
      commit('child');
      gitAt(workspace, ['remote', 'add', 'origin', remote]);
      gitAt(workspace, ['push', 'origin', 'develop', 'feature/42']);
      const git = {
        execute: jest.fn(async (program, args, options) => {
          const output = execFileSync(program, [...args], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] });
          options?.stdout?.(output);
          return 0;
        }),
        fetch: jest.fn(async branch => { gitAt(workspace, ['fetch', 'origin', branch]); }),
        stagePaths: jest.fn(async paths => { gitAt(workspace, ['add', '--', ...paths]); }),
        stageAll: jest.fn(), commit: jest.fn(), push: jest.fn(), configureAuthor: jest.fn(),
      } as unknown as jest.Mocked<GitCommitPort>;
      const adapter = new BranchSyncWorkspaceAdapter(git, workspace);
      await expect(adapter.prepare('develop', 'feature/42', 'fixture')).resolves.toMatchObject({
        kind: 'conflicted', conflictPaths: [scenario.path],
      });
      const clean = 'const resolved = "child and parent";\n';
      const whitespace = 'const resolved = "child and parent"; \n';
      const markers = '<<<<<<< child\nchild\n=======\nparent\n>>>>>>> parent\n';
      write(scenario.path, scenario.phase === 'whitespace' ? whitespace : scenario.phase === 'markers' ? markers : clean);
      if (scenario.phase === 'protected-index') {
        write(protectedPath, 'unauthorized replacement\n');
        gitAt(workspace, ['add', '--', protectedPath]);
      }
      if (['staged-markers', 'staged-whitespace', 'verification-mutation'].includes(scenario.phase)) {
        await expect(adapter.validatePreparedMerge([scenario.path])).resolves.toEqual({ valid: true });
        write(scenario.path, scenario.phase === 'staged-markers' ? markers : scenario.phase === 'staged-whitespace' ? whitespace : 'verification changed bundle\n');
        if (scenario.phase !== 'verification-mutation') gitAt(workspace, ['add', '--', scenario.path]);
      }
      const result = await adapter.validatePreparedMerge([scenario.path]);
      if (scenario.valid) {
        expect(result).toEqual({ valid: true });
        expect(readFileSync(join(workspace, scenario.path), 'utf8')).toBe(whitespace);
        expect(git.stagePaths).toHaveBeenCalledWith([scenario.path]);
      } else {
        expect(result).toMatchObject({ valid: false, code: scenario.phase === 'protected-index' ? 'protected-index-changed'
          : scenario.phase === 'verification-mutation' ? 'unstaged-changes' : 'whitespace-or-conflict-markers' });
      }
      expect(git.stageAll).not.toHaveBeenCalled();
      expect(git.commit).not.toHaveBeenCalled();
      expect(git.push).not.toHaveBeenCalled();
      if (scenario.phase === 'verification-mutation') gitAt(workspace, ['checkout', '--', scenario.path]);
      await adapter.abort();
      expect(gitAt(workspace, ['status', '--porcelain']).toString()).toBe('');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
