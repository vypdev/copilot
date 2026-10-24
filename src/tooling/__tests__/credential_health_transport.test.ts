import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { load } from 'js-yaml';

type HealthStep = { env: Record<string, string>; run: string };
type HealthJob = { if: string; steps: HealthStep[] };
type HealthWorkflow = {
    on: { workflow_dispatch: { inputs: Record<string, { default: boolean }> } };
    permissions: Record<string, string>;
    jobs: Record<string, HealthJob>;
};
type RequestTrace = { args: string[]; input: string };
const root = resolve(__dirname, '../../..');
const unixIt = process.platform === 'win32' ? it.skip : it;
const endpoints: Record<string, string[]> = {
    'verify-pat': ['https://api.github.com/user', 'https://api.github.com/repos/fixture/credential-health'],
    'verify-openai': ['https://api.openai.com/v1/models'],
    'verify-anthropic': ['https://api.anthropic.com/v1/models'],
    'verify-google': ['https://generativelanguage.googleapis.com/v1beta/models'],
    'verify-openrouter': ['https://openrouter.ai/api/v1/models'],
    'verify-cursor': ['https://api.cursor.com/analytics/ai-code/changes?startDate=30d&page=1&pageSize=1'],
    'verify-opencode': ['https://opencode.ai/zen/v1/models'],
    'verify-codex-api-key': ['https://api.openai.com/v1/models'],
};
const fixtures = [
    ['verify-pat', 'PAT', 'check_pat'],
    ['verify-openai', 'OPENAI_API_KEY', 'check_openai'],
    ['verify-anthropic', 'ANTHROPIC_API_KEY', 'check_anthropic'],
    ['verify-google', 'GOOGLE_API_KEY', 'check_google'],
    ['verify-openrouter', 'OPENROUTER_API_KEY', 'check_openrouter'],
    ['verify-cursor', 'CURSOR_API_KEY', 'check_cursor'],
    ['verify-opencode', 'OPENCODE_API_KEY', 'check_opencode'],
    ['verify-codex-api-key', 'CODEX_API_KEY', 'check_codex_api_key'],
] as const;

function execute(script: string, key: string, value: string, status = 0) {
    const directory = mkdtempSync(join(tmpdir(), 'credential-health-transport-'));
    const trace = join(directory, 'trace.jsonl');
    const curl = join(directory, 'curl');
    writeFileSync(curl, `#!/usr/bin/env node
const fs = require('node:fs');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  fs.appendFileSync(process.env.CURL_TRACE, JSON.stringify({args: process.argv.slice(2), input}) + '\\n');
  process.exitCode = Number(process.env.CURL_STATUS);
});
`);
    chmodSync(curl, 0o700);
    try {
        const result = spawnSync('/bin/bash', ['--noprofile', '--norc', '-c', script], {
            encoding: 'utf8', timeout: 5_000,
            env: {
                PATH: [directory, dirname(process.execPath), '/usr/bin', '/bin'].join(delimiter),
                HOME: directory, GITHUB_REPOSITORY: 'fixture/credential-health',
                CURL_TRACE: trace, CURL_STATUS: String(status), [key]: value,
            },
        });
        const requests: RequestTrace[] = existsSync(trace)
            ? readFileSync(trace, 'utf8').trim().split('\n').map(line => JSON.parse(line) as RequestTrace) : [];
        return { ...result, requests };
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}

describe.each([
    'setup/workflows/copilot_credential_health.yml',
    '.github/workflows/copilot_credential_health.yml',
])('credential transport in %s', file => {
    const workflow = load(readFileSync(join(root, file), 'utf8')) as HealthWorkflow;

    it('keeps every credential check explicit, disabled by default and scoped to its requested secret', () => {
        expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch']);
        expect(workflow.permissions).toEqual({ contents: 'read' });
        expect(Object.keys(workflow.jobs).sort()).toEqual(fixtures.map(([id]) => id).sort());
        for (const [id, key, input] of fixtures) {
            expect(workflow.on.workflow_dispatch.inputs[input].default).toBe(false);
            expect(workflow.jobs[id].if).toBe(`\${{ inputs.${input} }}`);
            expect(workflow.jobs[id].steps).toHaveLength(1);
            expect(workflow.jobs[id].steps[0].env).toEqual({ [key]: `\${{ secrets.${key} }}` });
        }
    });

    unixIt.each(fixtures)('%s authenticates over stdin without raw or Basic secrets in argv', (id, key) => {
        const value = 'synthetic-value-with:quotes"and\\slashes';
        const encoded = Buffer.from(`${value}:`).toString('base64');
        const result = execute(workflow.jobs[id].steps[0].run, key, value);
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(0);
        expect(result.stdout + result.stderr).not.toContain(value);
        expect(result.stdout + result.stderr).not.toContain(encoded);
        expect(result.requests.map(request => request.args.at(-1))).toEqual(endpoints[id]);
        expect(result.requests).toHaveLength(key === 'PAT' ? 2 : 1);
        for (const request of result.requests) {
            expect(request.args.join(' ')).not.toContain(value);
            expect(request.args.join(' ')).not.toContain(encoded);
            expect(request.args[0]).toBe('-q');
            expect(request.args).toEqual(expect.arrayContaining([
                '--fail', '--max-time', '20', '--header', '@-',
                '--location', '--max-redirs', '0', '--proto', '=https', '--proto-redir', '=https',
            ]));
            const header = key === 'GOOGLE_API_KEY' ? `x-goog-api-key: ${value}\n`
                : key === 'ANTHROPIC_API_KEY' ? `x-api-key: ${value}\n`
                    : key === 'CURSOR_API_KEY' ? `Authorization: Basic ${encoded}\n`
                        : `Authorization: Bearer ${value}\n`;
            expect(request.input).toBe(header);
            expect(request.args.at(-1)).toMatch(/^https:\/\//u);
            expect(request.args.at(-1)).not.toContain('?key=');
        }
    });

    unixIt.each(fixtures)('%s stops before HTTP when its required credential is missing', (id, key) => {
        const result = execute(workflow.jobs[id].steps[0].run, key, '');
        expect(result.status).toBe(1);
        expect(result.requests).toEqual([]);
        expect(result.stderr).toContain('Required credential is missing.');
    });

    unixIt.each(fixtures.flatMap(([id, key]) => [
        [id, key, 'CR', '\r'], [id, key, 'LF', '\n'],
    ]))('%s rejects %s credential header injection (%s) before HTTP', (id, key, _name, control) => {
        const value = `synthetic${control}injected-header`;
        const result = execute(workflow.jobs[id].steps[0].run, key, value);
        expect(result.status).toBe(1);
        expect(result.requests).toEqual([]);
        expect(result.stderr).toContain('Credential contains invalid line breaks.');
        expect(result.stdout + result.stderr).not.toContain(value);
    });

    unixIt.each(fixtures)('%s propagates the curl failure without retrying or claiming success', (id, key) => {
        const result = execute(workflow.jobs[id].steps[0].run, key, 'synthetic-failure-value', 22);
        expect(result.status).toBe(22);
        expect(result.requests).toHaveLength(1);
    });
});
