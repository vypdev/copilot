import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { load } from 'js-yaml';
import { buildAgentTasks } from '../../actions/agent_configuration_builder';

const unixTest = process.platform === 'win32' ? test.skip : test;
const paths = ['setup/workflows/agent-cli-provisioning.yml', '.github/workflows/agent-cli-provisioning.yml'];
for (const file of paths) {
  describe(`${file} headless contract`, () => {
    unixTest.each(['findings', 'fixer', 'planner', 'reviewer', 'tester'] as const)(
      '%s inherits the selected generic executable for the same provider', (role) => {
        const fixture = executableFixture(file);
        try {
          const selected = fixture.binary('explicit/codex');
          const unwanted = fixture.binary('codex', 42);
          const tasks = buildAgentTasks({ provider: 'codex', modelProvider: 'openai', model: 'fixture',
            executable: selected, [role]: { provider: 'codex' } }, {});
          expect(tasks[role]?.executable).toBe(selected);
          const result = fixture.run({ AGENT_EXECUTABLE: selected, [`${role.toUpperCase()}_PROVIDER`]: 'codex' });
          expect(result.error).toBeUndefined();
          expect(result.status).toBe(0);
          expect(fixture.calls()).toEqual([`${selected}:--version`, `${selected}:exec --help`,
            `${selected}:--version`, `${selected}:exec --help`]);
          expect(fixture.calls().some(call => call.startsWith(`${unwanted}:`))).toBe(false);
        } finally { fixture.cleanup(); }
      },
    );
    unixTest('an explicit same-provider role executable takes precedence over the generic selection', () => {
      const fixture = executableFixture(file);
      try {
        const generic = fixture.binary('generic/codex');
        const selected = fixture.binary('explicit/codex');
        fixture.binary('codex', 42);
        const result = fixture.run({ AGENT_EXECUTABLE: generic, FINDINGS_PROVIDER: 'codex', FINDINGS_EXECUTABLE: selected });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(0);
        expect(fixture.calls()).toEqual([`${generic}:--version`, `${generic}:exec --help`,
          `${selected}:--version`, `${selected}:exec --help`]);
      } finally { fixture.cleanup(); }
    });
    unixTest.each(['missing', 'invalid-basename', 'broken-headless'] as const)(
      'a %s explicit role executable fails without falling back or installing', (failure) => {
        const fixture = executableFixture(file);
        try {
          const generic = fixture.binary('generic/codex');
          fixture.binary('codex');
          const selected = failure === 'missing' ? join(fixture.root, 'missing/codex')
            : fixture.binary(failure === 'invalid-basename' ? 'explicit/wrapper' : 'explicit/codex', 42);
          const result = fixture.run({ AGENT_EXECUTABLE: generic, FINDINGS_PROVIDER: 'codex', FINDINGS_EXECUTABLE: selected });
          expect(result.error).toBeUndefined();
          expect(result.status).toBe(failure === 'broken-headless' ? 42 : 1);
          expect(fixture.calls()).toEqual([`${generic}:--version`, `${generic}:exec --help`,
            ...(failure === 'broken-headless' ? [`${selected}:--version`, `${selected}:exec --help`] : [])]);
        } finally { fixture.cleanup(); }
      },
    );
    unixTest('same-provider roles use the provider default when no executable is configured', () => {
      const fixture = executableFixture(file);
      try {
        const selected = fixture.binary('codex');
        const result = fixture.run({ FINDINGS_PROVIDER: 'codex' });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(0);
        expect(fixture.calls()).toEqual([`${selected}:--version`, `${selected}:exec --help`,
          `${selected}:--version`, `${selected}:exec --help`]);
      } finally { fixture.cleanup(); }
    });
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

function executableFixture(file: string) {
  const root = mkdtempSync(join(tmpdir(), 'copilot executable inheritance-'));
  const calls = join(root, 'calls.txt');
  const workflow = load(readFileSync(resolve(__dirname, '../../..', file), 'utf8')) as {
    jobs: { 'verify-agent-clis': { steps: { run?: string }[] } };
  };
  const script = workflow.jobs['verify-agent-clis'].steps.find(step => step.run)!.run!;
  writeFileSync(calls, '');
  // Any unintended installer invocation is intercepted rather than reaching the network.
  writeFileSync(join(root, 'curl'), '#!/bin/bash\nprintf "installer\\n" >> "$CALLS_FILE"\nexit 91\n');
  chmodSync(join(root, 'curl'), 0o700);
  return {
    root,
    binary(name: string, headlessExit = 0) {
      const executable = join(root, name);
      mkdirSync(resolve(executable, '..'), { recursive: true });
      writeFileSync(executable, `#!/bin/bash\nprintf '%s:%s\\n' "$0" "$*" >> "$CALLS_FILE"\nif [[ "$*" == '--version' ]]; then echo fixture-1.0; exit 0; fi\nif [[ "$*" == 'exec --help' ]]; then exit ${headlessExit}; fi\nexit 91\n`);
      chmodSync(executable, 0o700);
      return executable;
    },
    run(overrides: Record<string, string>) {
      return spawnSync('/bin/bash', ['-c', script], { encoding: 'utf8', timeout: 10_000,
        env: { ...process.env, PATH: `${root}:${process.env.PATH}`, CALLS_FILE: calls,
          RUNNER_TEMP: join(root, 'runner-temp'), GITHUB_RUN_ID: '583', GITHUB_RUN_ATTEMPT: '1',
          AGENT_PROVIDER: 'codex', AGENT_EXECUTABLE: '',
          FINDINGS_PROVIDER: '', FIXER_PROVIDER: '', PLANNER_PROVIDER: '', REVIEWER_PROVIDER: '', TESTER_PROVIDER: '',
          FINDINGS_EXECUTABLE: '', FIXER_EXECUTABLE: '', PLANNER_EXECUTABLE: '', REVIEWER_EXECUTABLE: '', TESTER_EXECUTABLE: '', ...overrides } });
    },
    calls: () => readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
