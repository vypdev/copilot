import { runInNewContext } from 'node:vm';
import type { BugbotBenchmarkCase } from '../../bugbot_benchmark';

const assertion = 'assert.match(authorization, /^Bearer [A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$/);';
const definitions = [
  { name: 'signed-bootstrap', setup: 'signed.setup.ts', clock: 1_000, prefix: 'Bearer ', defect: false },
  { name: 'storage-alias', setup: 'alias.setup.ts', clock: 1_000, prefix: 'Bearer ', defect: false },
  { name: 'opaque-bootstrap', setup: 'opaque.setup.ts', clock: 1_000, prefix: 'Bearer ', defect: true },
  { name: 'expired-refresh', setup: 'signed.setup.ts', clock: 20_000, prefix: 'Bearer ', defect: true },
  { name: 'prefix-gap', setup: 'signed.setup.ts', clock: 1_000, prefix: 'Bearer', defect: true },
] as const;

function source(setup: string, clock: number, prefix: string): string[] {
  return [
    'const assert = require("node:assert/strict");',
    'const { createHmac } = require("node:crypto");',
    'const persistedFiles = new Map();',
    'const statePath = ".auth/owned-user.json";',
    'let tokenEndpointCalls = 0;',
    'const fakeAuthResponse = { access_token: "opaque-token-response" };',
    'function mockedTokenEndpoint() { tokenEndpointCalls++; return fakeAuthResponse; }',
    'function persistSession(session) {',
    '  const state = { cookies: [], origins: [{ origin: "http://owned.invalid", localStorage: [{ name: "owned-session", value: JSON.stringify(session) }] }] };',
    '  persistedFiles.set(statePath, JSON.stringify(state));',
    '}',
    'function signedSetup() {',
    '  const header = Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url");',
    '  const payload = Buffer.from(JSON.stringify({sub:"owned-synthetic-user"})).toString("base64url");',
    '  const unsigned = header + "." + payload;',
    '  const signature = createHmac("sha256", "owned-synthetic-fixture-key").update(unsigned).digest("base64url");',
    '  persistSession({ access_token: unsigned + "." + signature, expires_at: 10000 });',
    '}',
    'function opaqueSetup() { persistSession({ ...mockedTokenEndpoint(), expires_at: 10000 }); }',
    'function aliasSetup() { return signedSetup(); }',
    'const setupModules = { "signed.setup.ts": signedSetup, "alias.setup.ts": aliasSetup, "opaque.setup.ts": opaqueSetup };',
    `const projectConfig = { globalSetup: ${JSON.stringify(setup)}, storageState: statePath };`,
    'setupModules[projectConfig.globalSetup]();',
    'const browserState = JSON.parse(persistedFiles.get(projectConfig.storageState));',
    'const storedSession = JSON.parse(browserState.origins[0].localStorage.find(item => item.name === "owned-session").value);',
    `const testClock = ${clock};`,
    'let accessToken = storedSession.access_token;',
    'if (storedSession.expires_at <= testClock) accessToken = mockedTokenEndpoint().access_token;',
    `const authorization = ${JSON.stringify(prefix)} + accessToken;`,
    assertion,
  ];
}

const cases: BugbotBenchmarkCase[] = [
  ...definitions.map(definition => {
    const lines = source(definition.setup, definition.clock, definition.prefix);
    const id = 'session-source-' + definition.name;
    const headerDefect = definition.prefix === 'Bearer';
    const line = headerDefect ? lines.length - 1 : lines.length;
    return {
      id, language: 'typescript', category: definition.defect ? 'correctness' : 'negative',
      description: 'Owned synthetic harness dispatches configuration-selected setup, persists the storageState JSON shape and reads its localStorage session. Real Node HMAC/base64url creates compact tokens. The token endpoint supplies only the explicitly selected initial or expiry path. The assertion checks the selected header under a fixed test clock; no browser, private consumer or external auth provider is executed.',
      file: 'e2e/owned-session.spec.ts', startLine: 1,
      diff: lines.map((value, index) => (index === lines.length - 1 || (headerDefect && index === lines.length - 2) ? '+' : ' ') + value).join('\n'),
      expected: definition.defect ? [{ id, title: headerDefect ? 'The changed header omits the bearer separator' : 'The selected session supplies an opaque token to the compact-token assertion',
        file: 'e2e/owned-session.spec.ts', line, severity: 'medium', category: 'correctness', codeSnippet: lines[line - 1] }] : [],
    };
  }),
  {
    id: 'session-source-setup-unavailable', language: 'typescript', category: 'negative',
    description: 'Bounded source excerpt: the configured setup and persisted initial session producer are not supplied. A separate token endpoint stub is visible. No execution outcome is provided; review only supported defects in the changed assertion.',
    file: 'e2e/owned-session.spec.ts', startLine: 1,
    diff: ' const fakeAuthResponse = { access_token: "opaque-token-response" };\n function tokenEndpoint() { return fakeAuthResponse; }\n const initialSession = loadConfiguredStorageState();\n+assert.equal(initialSession.access_token.split(".").length, 3);',
    expected: [],
  },
];

export const INITIAL_SESSION_CASES: readonly BugbotBenchmarkCase[] = Object.freeze(cases.map(item => Object.freeze({
  ...item, expected: Object.freeze(item.expected.map(finding => Object.freeze({ ...finding }))),
})));

export type InitialSessionObservation = { readonly kind: 'unavailable' } | {
  readonly kind: 'observed'; readonly setup: string; readonly tokenEndpointCalls: number;
  readonly initialSegments: number; readonly selectedSegments: number; readonly assertionPassed: boolean;
};

/** Execute only immutable owned fixtures, never caller-provided source or private consumer code. */
export function observeInitialSessionSource(input: Pick<BugbotBenchmarkCase, 'id' | 'diff'>): InitialSessionObservation {
  const trusted = INITIAL_SESSION_CASES.find(item => item.id === input.id);
  if (!trusted || input.diff !== trusted.diff) throw new Error('Unknown or modified initial-session fixture.');
  if (trusted.id === 'session-source-setup-unavailable') return { kind: 'unavailable' };
  const program = trusted.diff.split('\n').map(line => line.slice(1)).join('\n').replace(assertion,
    'let assertionPassed = true; try { ' + assertion + ' } catch { assertionPassed = false; }\n'
      + 'module.exports = { kind: "observed", setup: projectConfig.globalSetup, tokenEndpointCalls, initialSegments: storedSession.access_token.split(".").length, selectedSegments: accessToken.split(".").length, assertionPassed };');
  const sandbox = { Buffer, module: { exports: {} }, require: (name: string) => {
    if (name !== 'node:assert/strict' && name !== 'node:crypto') throw new Error('Unexpected fixture dependency.');
    return require(name);
  } };
  runInNewContext(program, sandbox, { timeout: 2_000 });
  return sandbox.module.exports as InitialSessionObservation;
}
