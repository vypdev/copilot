import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitCommitAdapter } from '../../../infrastructure/git_commit_adapter';
import { BranchSyncWorkspaceAdapter } from '../../../infrastructure/branch_sync_workspace_adapter';
import { SyncBranchUseCase } from '../../../application/usecases/branch_sync/sync_branch_use_case';
export type PublicationFixtureScenario = 'workflow-denial' | 'generic-denial' | 'lost-acknowledgement' | 'observation-unavailable';
/** Local bare Git transport only; the hook models a provider message, not GitHub credential capability. */
export async function runPublicationFixture(scenario: PublicationFixtureScenario) {
  const dir = mkdtempSync(join(tmpdir(), 'copilot-publication-'));
  const remote = join(dir, 'remote.git'), seed = join(dir, 'seed'), managed = join(dir, 'managed'), user = join(dir, 'user');
  const home = join(dir, 'home'); mkdirSync(home); const config = join(home, 'gitconfig'); writeFileSync(config, '');
  const env = { PATH: process.env.PATH, HOME: home, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_DATE: '2026-11-03T00:00:00Z', GIT_COMMITTER_DATE: '2026-11-03T00:00:00Z',
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}), ...(process.env.TEMP ? { TEMP: process.env.TEMP } : {}) };
  const run = (cwd: string, args: string[]) => execFileSync('git', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  const commit = (message: string) => run(seed, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', message]);
  const trace: string[][] = [];
  try {
    run(dir, ['init', '--bare', remote]); run(dir, ['init', '--initial-branch=develop', seed]);
    writeFileSync(join(seed, 'base.txt'), 'base\n'); run(seed, ['add', '.']); commit('base'); run(seed, ['branch', 'feature/8']);
    mkdirSync(join(seed, '.github/workflows'), { recursive: true });
    writeFileSync(join(seed, '.github/workflows/fixture.yml'), 'name: Fixture\non: push\n'); run(seed, ['add', '.']); commit('parent workflow');
    const parent = run(seed, ['rev-parse', 'HEAD']); run(seed, ['checkout', 'feature/8']);
    writeFileSync(join(seed, 'child.txt'), 'child\n'); run(seed, ['add', '.']); commit('child'); const child = run(seed, ['rev-parse', 'HEAD']);
    run(seed, ['remote', 'add', 'origin', remote]); run(seed, ['push', 'origin', 'develop', 'feature/8']);
    run(dir, ['clone', '--branch', 'feature/8', remote, managed]); run(dir, ['clone', '--branch', 'feature/8', remote, user]);
    writeFileSync(join(user, 'authored-note.txt'), 'authored original\n');
    const userState = () => ({ head: run(user, ['rev-parse', 'HEAD']), status: run(user, ['status', '--porcelain']), note: readFileSync(join(user, 'authored-note.txt'), 'utf8') });
    const before = userState();
    if (scenario !== 'lost-acknowledgement') {
      const denial = scenario === 'generic-denial' ? 'PRIVATE unrelated server rejection'
        : 'refusing to allow a Personal Access Token to create or update workflow .github/workflows/fixture.yml without workflow scope';
      writeFileSync(join(remote, 'hooks/pre-receive'), '#!/bin/sh\nprintf \'%s\\n\' \'' + denial + '\' >&2\nexit 1\n', { mode: 0o755 });
    }
    let attempted = false, fixerCalls = 0;
    const git = new GitCommitAdapter(async (program, args, options) => {
      trace.push(args);
      if (scenario === 'observation-unavailable' && attempted && args[0] === 'fetch') throw Error('PRIVATE missing observation');
      const commandEnv = { ...env } as Record<string, string | undefined>;
      for (const [key, value] of Object.entries(options?.env ?? {})) if (/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/u.test(key)) commandEnv[key] = value;
      try {
        if (args[0] === 'push') attempted = true;
        const bytes = execFileSync(program, args, { cwd: managed, env: commandEnv, stdio: ['ignore', 'pipe', 'pipe'] }); options?.stdout?.(bytes);
        if (scenario === 'lost-acknowledgement' && args[0] === 'push') throw Error('PRIVATE lost transport acknowledgement');
        return 0;
      } catch (cause) {
        const stderr = (cause as { stderr?: Buffer }).stderr;
        if (stderr) options?.stderr?.(stderr);
        throw cause;
      }
    });
    const workspace = new BranchSyncWorkspaceAdapter(git, managed), token = 'fixture-not-a-real-credential';
    const bound = { prepare: (a: string, b: string) => workspace.prepare(a, b, token), validatePreparedMerge: (paths: readonly string[]) => workspace.validatePreparedMerge(paths),
      assertRemoteHeadsUnchanged: (a: string, b: string, c: string, d: string) => workspace.assertRemoteHeadsUnchanged(a, b, c, d, token),
      commitAndPush: (a: string, b: string, c: { name: string; email: string }) => workspace.commitAndPush(a, b, c, token), abort: () => workspace.abort() };
    const useCase = new SyncBranchUseCase({ resolveTarget: async () => ({ issueNumber: 8, conversationNumber: 15, parentBranch: 'develop', workingBranch: 'feature/8' }), listOpenDependencies: async () => [] }, bound,
      { fix: async () => { fixerCalls++; throw Error('No fixer belongs to the clean fixture.'); } },
      { getUserDetails: async () => ({ name: 'Fixture', email: 'fixture@example.invalid' }), getUser: async () => 'fixture' }, git);
    const [result] = await useCase.invoke({ context: { conversationNumber: 15, repository: { owner: 'fixture', name: 'repo' }, agentConfiguration: { provider: 'codex', model: 'unused' }, verifyCommands: [] }, options: { dryRun: false, useAgent: false } });
    const candidate = run(managed, ['rev-parse', 'HEAD']);
    return { result, child, parent, candidate, remote: run(seed, ['ls-remote', 'origin', 'refs/heads/feature/8']).split(/\s/u)[0],
      parents: run(managed, ['show', '-s', '--format=%P', 'HEAD']).split(' '),
      userUnchanged: JSON.stringify(before) === JSON.stringify(userState()), trace, fixerCalls };
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
