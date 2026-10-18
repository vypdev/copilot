import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { load } from 'js-yaml';

const unixTest = process.platform === 'win32' ? test.skip : test;
const paths = ['setup/workflows/agent-cli-provisioning.yml', '.github/workflows/agent-cli-provisioning.yml'];
for (const file of paths) {
  describe(`${file} headless contract`, () => {
    unixTest.each([
      ['FINDINGS', false], ['FIXER', false], ['PLANNER', false], ['REVIEWER', false], ['TESTER', false], ['FINDINGS', true],
    ] as const)('%s uses its own provider executable with a generic override present (role override=%s)', (role, explicit) => {
      const root = mkdtempSync(join(tmpdir(), 'copilot mixed cli contract-'));
      try {
        const calls = join(root, 'calls.txt'); mkdirSync(join(root, 'explicit'));
        const fake = (path: string, headless: string) => {
          writeFileSync(path, `#!/bin/bash\nprintf '%s:%s\\n' "$0" "$*" >> "$CALLS_FILE"\nif [[ "$*" == '--version' ]]; then echo fixture-1.0; exit 0; fi\nif [[ "$*" == '${headless}' ]]; then exit 0; fi\nexit 91\n`);
          chmodSync(path, 0o700);
        };
        const agent = join(root, 'codex'); const defaultRole = join(root, 'opencode'); const selectedRole = explicit ? join(root, 'explicit/opencode') : defaultRole;
        fake(agent, 'exec --help'); fake(defaultRole, 'run --help'); if (explicit) fake(selectedRole, 'run --help');
        const workflow = load(readFileSync(resolve(__dirname, '../../..', file), 'utf8')) as { jobs: { 'verify-agent-clis': { steps: { run?: string }[] } } };
        const script = workflow.jobs['verify-agent-clis'].steps.find(step => step.run)!.run!;
        const env = { ...process.env, PATH: `${root}:${process.env.PATH}`, CALLS_FILE: calls, AGENT_PROVIDER: 'codex', AGENT_EXECUTABLE: agent,
          FINDINGS_PROVIDER: '', FIXER_PROVIDER: '', PLANNER_PROVIDER: '', REVIEWER_PROVIDER: '', TESTER_PROVIDER: '',
          FINDINGS_EXECUTABLE: '', FIXER_EXECUTABLE: '', PLANNER_EXECUTABLE: '', REVIEWER_EXECUTABLE: '', TESTER_EXECUTABLE: '',
          [`${role}_PROVIDER`]: 'opencode', [`${role}_EXECUTABLE`]: explicit ? selectedRole : '' };
        const result = spawnSync('/bin/bash', ['-c', script], { env, encoding: 'utf8', timeout: 10_000 });
        expect(result.error).toBeUndefined(); expect(result.status).toBe(0);
        const observed = readFileSync(calls, 'utf8');
        expect(observed).toContain(`${agent}:exec --help`); expect(observed).toContain(`${selectedRole}:run --help`);
        if (explicit) expect(observed).not.toContain(`${defaultRole}:`);
      } finally { rmSync(root, { recursive: true, force: true }); }
    });
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
