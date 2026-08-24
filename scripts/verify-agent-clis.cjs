#!/usr/bin/env node
/* Verify provider CLIs without printing credentials or executing agent work. */
const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');

const checks = [
  { name: 'opencode', command: 'opencode', args: ['run', '--help'], credential: ['OPENCODE_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY'] },
  { name: 'codex', command: 'codex', args: ['exec', '--help'], credential: ['CODEX_ACCESS_TOKEN', 'OPENAI_API_KEY'], localSession: true },
  { name: 'cursor', command: 'agent', args: ['--help'], credential: ['CURSOR_API_KEY'] },
];

function hasLocalCodexSession() {
  const authPath = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'auth.json');
  if (!existsSync(authPath)) return false;
  try {
    const auth = JSON.parse(readFileSync(authPath, 'utf8'));
    return auth.auth_mode === 'chatgpt'
      && auth.OPENAI_API_KEY == null
      && typeof auth.tokens?.access_token === 'string'
      && typeof auth.tokens?.refresh_token === 'string';
  } catch {
    return false;
  }
}

let failed = false;
for (const check of checks) {
  try {
    const output = execFileSync('which', [check.command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    execFileSync(check.command, check.args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
    const credentialState = check.localSession && hasLocalCodexSession()
      ? 'local-chatgpt-session-present'
      : check.credential.some((name) => Boolean(process.env[name]))
        ? 'credential-reference-present'
        : 'credential-reference-missing';
    console.log(`${check.name}: available (${output}); headless-help: pass; ${credentialState}`);
    if (credentialState === 'credential-reference-missing') failed = true;
  } catch (error) {
    failed = true;
    const code = error?.status ?? 'unavailable';
    console.log(`${check.name}: NOT_READY (${code}); install the official CLI and configure credentials by environment reference`);
  }
}

if (failed) process.exitCode = 1;
