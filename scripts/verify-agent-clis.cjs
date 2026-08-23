#!/usr/bin/env node
/* Verify provider CLIs without printing credentials or executing agent work. */
const { execFileSync } = require('node:child_process');

const checks = [
  { name: 'opencode', command: 'opencode', args: ['run', '--help'], credential: ['OPENCODE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY'] },
  { name: 'codex', command: 'codex', args: ['exec', '--help'], credential: ['CODEX_ACCESS_TOKEN', 'OPENAI_API_KEY'] },
  { name: 'cursor', command: 'agent', args: ['--help'], credential: ['CURSOR_API_KEY'] },
];

let failed = false;
for (const check of checks) {
  let output = '';
  try {
    output = execFileSync('sh', ['-lc', `command -v ${check.command}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    execFileSync(check.command, check.args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
    const credentialState = check.credential.some((name) => Boolean(process.env[name])) ? 'credential-reference-present' : 'credential-reference-missing';
    console.log(`${check.name}: available (${output}); headless-help: pass; ${credentialState}`);
  } catch (error) {
    failed = true;
    const code = error?.status ?? 'unavailable';
    console.log(`${check.name}: NOT_READY (${code}); install the official CLI and configure credentials by environment reference`);
  }
}

if (failed) process.exitCode = 1;
