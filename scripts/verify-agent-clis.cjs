#!/usr/bin/env node
/* Verify provider CLIs without printing credentials or executing agent work. */
const { execFileSync } = require('node:child_process');
const { accessSync, constants, existsSync, readFileSync, realpathSync, statSync } = require('node:fs');
const { homedir } = require('node:os');
const { basename, delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep, win32 } = require('node:path');
const { verifyWindowsAgentExecutableAcl } = require('../src/infrastructure/agents/windows_executable_trust.cjs');

const checksByProvider = {
  opencode: { name: 'opencode', command: 'opencode', package: 'opencode-ai', args: ['run', '--help'], credential: ['OPENCODE_API_KEY'], localSession: true },
  codex: { name: 'codex', command: 'codex', package: '@openai/codex', args: ['exec', '--help'], credential: ['CODEX_API_KEY'], localSession: true },
  cursor: { name: 'cursor', command: 'agent', args: ['--help'], credential: ['CURSOR_API_KEY'] },
};

function resolveOnPath(command) {
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';') : [''];
  for (const directory of (process.env.PATH || process.env.Path || '').split(delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = join(directory, `${command}${extension}`);
      try {
        accessSync(candidate, constants.X_OK);
        return realpathSync(candidate);
      } catch {
        // Continue through configured PATH candidates without running a lookup command.
      }
    }
  }
  throw new Error('Agent executable not found.');
}

function resolveCommand(check) {
  const path = resolveOnPath(check.command);
  if (process.platform !== 'win32') return { path, executable: path, prefix: [] };
  if (/\.bat$/iu.test(path)) throw new Error('Batch agent wrappers are unsupported.');
  if (!/\.cmd$/iu.test(path)) return { path, executable: path, prefix: [] };
  if (!check.package || basename(path).toLowerCase() !== `${check.command}.cmd`) {
    throw new Error('Unrecognized npm agent shim.');
  }
  const shimDirectory = dirname(path);
  const localBin = basename(shimDirectory).toLowerCase() === '.bin'
    && basename(dirname(shimDirectory)).toLowerCase() === 'node_modules';
  const modulesDirectory = localBin ? dirname(shimDirectory) : join(shimDirectory, 'node_modules');
  const packageRoot = realpathSync(join(modulesDirectory, ...check.package.split('/')));
  const metadata = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  if (metadata.name !== check.package) throw new Error('Mismatched npm agent package.');
  const bin = typeof metadata.bin === 'string' ? metadata.bin : metadata.bin?.[check.command];
  if (typeof bin !== 'string' || !bin || isAbsolute(bin) || win32.isAbsolute(bin)) {
    throw new Error('Unsafe npm agent bin.');
  }
  const target = realpathSync(resolve(packageRoot, bin));
  const relation = relative(packageRoot, target);
  if (!relation || relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation) || !statSync(target).isFile()) {
    throw new Error('Npm agent bin escaped its package.');
  }
  if (extname(target).toLowerCase() === '.js') return { path, executable: resolveOnPath('node'), prefix: [target] };
  if (extname(target).toLowerCase() === '.exe') return { path, executable: target, prefix: [] };
  throw new Error('Unsupported npm agent bin.');
}

function assertCommandTrust(command, reportTarget = () => undefined) {
  const targets = [
    ['selected', command.path],
    ['interpreter', command.executable],
    ...command.prefix.map((path) => ['launcher', path]),
  ];
  const checked = new Set();
  for (const [role, path] of targets) {
    if (checked.has(path)) continue;
    checked.add(path);
    reportTarget(role);
    const stats = statSync(path);
    if (!stats.isFile()) throw new Error('Agent executable must be a regular file.');
    accessSync(path, constants.X_OK);
    if (process.platform === 'win32') {
      try {
        verifyWindowsAgentExecutableAcl(path);
      } catch (error) {
        if (error?.code !== 'ETIMEDOUT') throw error;
        verifyWindowsAgentExecutableAcl(path);
      }
    } else if ((stats.mode & 0o022) !== 0
      || (typeof process.getuid === 'function' && stats.uid !== process.getuid() && stats.uid !== 0)) {
      throw new Error('Agent executable owner or permissions are unsafe.');
    }
  }
}

function invokeCommand(command, args, options) {
  return execFileSync(command.executable, [...command.prefix, ...args], options);
}

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

function hasLocalSession(check, command) {
  if (check.name === 'codex') {
    if (hasLocalCodexSession()) return true;
    try {
      invokeCommand(command, ['login', 'status'], { stdio: ['ignore', 'ignore', 'ignore'], timeout: 15000 });
      return true;
    } catch {
      return false;
    }
  }
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

function safeFailureCode(error) {
  if (Number.isInteger(error?.status) && error.status >= 0 && error.status <= 255) return error.status;
  if (error?.code === 'ETIMEDOUT' && ['identity', 'descriptor'].includes(error.aclProbeStage)) {
    return `acl-${error.aclProbeStage}-timeout`;
  }
  if (['EACCES', 'ENOENT', 'EPERM', 'ETIMEDOUT'].includes(error?.code)) return error.code.toLowerCase();
  const message = typeof error?.message === 'string' ? error.message : '';
  if (message.startsWith('Agent executable is writable by another principal')) return 'acl-writable';
  if (message.startsWith('Unsafe executable ACL owner') || message.includes(': Unsafe executable ACL owner')) return 'acl-owner';
  if (message.startsWith('Unrecognized executable ACL')) return 'acl-format';
  if (message.startsWith('Could not identify the Windows runtime owner')) return 'identity';
  if (message.startsWith('Agent executable owner or permissions are unsafe')) return 'unsafe-permissions';
  return 'unavailable';
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
  let phase = 'resolve';
  try {
    const command = resolveCommand(check);
    assertCommandTrust(command, (role) => { phase = `help-trust-${role}`; });
    phase = 'help-execute';
    invokeCommand(command, check.args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
    phase = 'version-execute';
    const version = invokeCommand(command, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 })
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 200);
    phase = 'credential';
    const credentialNamesForCheck = credentialNames(check);
    const credentialState = credentialNamesForCheck.length === 0
      ? 'credential-resolution-deferred-to-cli'
      : check.localSession && hasLocalSession(check, command)
      ? 'local-session-present'
        : credentialNamesForCheck.some((name) => Boolean(process.env[name]))
        ? 'credential-reference-present'
        : 'credential-reference-missing';
    console.log(`${check.name}: available (${command.path}); version: ${version || 'unknown'}; headless-help: pass; ${credentialState}`);
    if (credentialState === 'credential-reference-missing' && authIsRequired()) failed = true;
  } catch (error) {
    failed = true;
    const code = safeFailureCode(error);
    console.log(`${check.name}: NOT_READY (${phase}/${code}); install the official CLI and configure credentials by environment reference`);
  }
}

if (failed) process.exitCode = 1;
