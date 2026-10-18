import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { load } from 'js-yaml';

const unixTest = process.platform === 'win32' ? test.skip : test;
const paths = ['setup/workflows/agent-cli-provisioning.yml', '.github/workflows/agent-cli-provisioning.yml'];
for (const file of paths) {
  describe(`${file} headless contract`, () => {
    unixTest.each([
      ['codex', 'codex', 'exec --help', false], ['opencode', 'opencode', 'run --help', false], ['cursor', 'agent', '--help', false],
      ['codex', 'codex', 'exec --help', true], ['opencode', 'opencode', 'run --help', true],
    ] as const)('%s checks its non-interactive surface and rejects a broken one (%s, %s, broken=%s)', (provider, binary, expected, broken) => {
      const root = mkdtempSync(join(tmpdir(), 'copilot-headless-contract-'));
      try {
        const executable = join(root, binary);
        writeFileSync(executable, `#!/bin/bash\nif [[ "$*" == '--version' ]]; then echo fixture-1.0; exit 0; fi\nif [[ "$*" == '${expected}' ]]; then exit ${broken ? 42 : 0}; fi\nexit 91\n`);
        chmodSync(executable, 0o700);
        const workflow = load(readFileSync(resolve(__dirname, '../../..', file), 'utf8')) as {
          jobs: { 'verify-agent-clis': { steps: { run?: string }[] } };
        };
        const script = workflow.jobs['verify-agent-clis'].steps.find(step => step.run)!.run!;
        const env = { ...process.env, AGENT_PROVIDER: provider, AGENT_EXECUTABLE: executable,
          FINDINGS_PROVIDER: '', FIXER_PROVIDER: '', PLANNER_PROVIDER: '', REVIEWER_PROVIDER: '', TESTER_PROVIDER: '',
          FINDINGS_EXECUTABLE: '', FIXER_EXECUTABLE: '', PLANNER_EXECUTABLE: '', REVIEWER_EXECUTABLE: '', TESTER_EXECUTABLE: '' };
        const result = spawnSync('/bin/bash', ['-c', script], { env, encoding: 'utf8', timeout: 10_000 });
        expect(result.error).toBeUndefined(); expect(result.status).toBe(broken ? 42 : 0);
        if (!broken) expect(result.stdout).toContain(`Agent CLI contract passed for:  ${provider}.`);
      } finally { rmSync(root, { recursive: true, force: true }); }
    });
  });
}
