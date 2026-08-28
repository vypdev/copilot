#!/usr/bin/env node
/* Verify provider CLIs without printing credentials or executing agent work. */
const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');

const checksByProvider = {
  opencode: { name: 'opencode', command: 'opencode', args: ['run', '--help'], credential: ['OPENCODE_API_KEY'], localSession: true },
  codex: { name: 'codex', command: 'codex', args: ['exec', '--help'], credential: ['CODEX_ACCESS_TOKEN', 'OPENAI_API_KEY'], localSession: true },
  cursor: { name: 'cursor', command: 'agent', args: ['--help'], credential: ['CURSOR_API_KEY'] },
};

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

function hasLocalOpenCodeSession() {
  const dataDirectory = process.env.OPENCODE_DATA_DIR || process.env.XDG_DATA_HOME
    || (process.env.HOME ? join(process.env.HOME, '.local', 'share') : null);
  if (!dataDirectory) return false;
  const authPath = process.env.OPENCODE_AUTH_FILE || join(dataDirectory, 'opencode', 'auth.json');
  if (!existsSync(authPath)) return false;
  try {
    const auth = JSON.parse(readFileSync(authPath, 'utf8'));
    const hasMaterial = (value, property = '') => typeof value === 'string'
      ? /(?:api[_-]?key|access|refresh|token|secret)/i.test(property) && value.trim().length > 0
      : value && typeof value === 'object' && Object.entries(value).some(([key, nested]) => hasMaterial(nested, key));
    return hasMaterial(auth);
  } catch {
    return false;
  }
}

function hasLocalSession(check) {
  if (check.name === 'codex') return hasLocalCodexSession();
  if (check.name === 'opencode') return hasLocalOpenCodeSession();
  return false;
}

function authIsRequired() {
  return (process.env.AGENT_AUTH_PREFLIGHT || 'required').toLowerCase() === 'required';
}

function credentialNames(check) {
  if (check.name !== 'opencode') return check.credential;
  const modelProvider = (process.env.AGENT_MODEL_PROVIDER || 'openai').toLowerCase();
  if (['local', 'ollama', 'lmstudio'].includes(modelProvider)) return [];
  const providerVariable = {
    opencode: 'OPENCODE_API_KEY',
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    google: 'GOOGLE_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    mistral: 'MISTRAL_API_KEY',
    groq: 'GROQ_API_KEY',
    deepseek: 'DEEPSEEK_API_KEY',
    xai: 'XAI_API_KEY',
    togetherai: 'TOGETHERAI_API_KEY',
    fireworks: 'FIREWORKS_API_KEY',
    perplexity: 'PERPLEXITY_API_KEY',
    cerebras: 'CEREBRAS_API_KEY',
    cohere: 'COHERE_API_KEY',
    zai: 'ZAI_API_KEY',
    moonshot: 'MOONSHOT_API_KEY',
    minimax: 'MINIMAX_API_KEY',
    cursor: 'CURSOR_API_KEY',
  }[modelProvider];
  return providerVariable ? [providerVariable, 'OPENCODE_API_KEY'] : [];
}

const selectedProvider = (process.env.AGENT_PROVIDER || 'codex').toLowerCase();
const verifyAll = process.env.VERIFY_ALL_AGENT_CLIS === 'true';
const checks = verifyAll ? Object.values(checksByProvider) : [checksByProvider[selectedProvider]];
if (!checks[0]) {
  console.error(`Unsupported AGENT_PROVIDER: ${selectedProvider}`);
  process.exit(1);
}

let failed = false;
for (const check of checks) {
  try {
    const output = execFileSync('which', [check.command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    execFileSync(check.command, check.args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
    const version = execFileSync(check.command, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 })
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 200);
    const credentialNamesForCheck = credentialNames(check);
    const credentialState = credentialNamesForCheck.length === 0
      ? 'credential-resolution-deferred-to-cli'
      : check.localSession && hasLocalSession(check)
      ? 'local-session-present'
        : credentialNamesForCheck.some((name) => Boolean(process.env[name]))
        ? 'credential-reference-present'
        : check.name === 'codex'
          ? 'credential-preflight-deferred-to-cli'
          : 'credential-reference-missing';
    console.log(`${check.name}: available (${output}); version: ${version || 'unknown'}; headless-help: pass; ${credentialState}`);
    if (credentialState === 'credential-reference-missing' && authIsRequired()) failed = true;
  } catch (error) {
    failed = true;
    const code = error?.status ?? 'unavailable';
    console.log(`${check.name}: NOT_READY (${code}); install the official CLI and configure credentials by environment reference`);
  }
}

if (failed) process.exitCode = 1;
