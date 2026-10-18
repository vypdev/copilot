const fs = require('node:fs');
const ts = require(process.cwd() + '/node_modules/typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, filename);

async function main() {
  const github = require('@actions/github');
  const originalGetOctokit = github.getOctokit;
  const requests = [];
  const sha = 'a'.repeat(40);
  const path = '.github/workflows/copilot_credential_health.yml';
  const content = fs.readFileSync('setup/workflows/copilot_credential_health.yml', 'utf8');
  const names = ['PAT', 'OPENAI_API_KEY'];
  const run = { id: 19, run_attempt: 1, workflow_id: 9, repository: { id: 7 }, head_branch: 'master', head_sha: sha,
    event: 'workflow_dispatch', status: 'completed', run_started_at: '2026-10-17T13:59:30Z', updated_at: '2026-10-17T13:59:40Z' };
  const fetcher = async (url, options) => {
    const parsed = new URL(url);
    const pathname = decodeURIComponent(parsed.pathname);
    requests.push({ method: options.method, path: pathname, query: Object.fromEntries(parsed.searchParams) });
    if (options.method !== 'GET' || parsed.origin !== 'https://api.github.com') throw new Error('Evidence must use fixed read-only GitHub routes');
    let data;
    if (pathname === '/repos/owner/repo') data = { id: 7, default_branch: 'master' };
    else if (pathname.endsWith('/git/ref/heads/master')) data = { object: { sha } };
    else if (pathname.endsWith('/contents/' + path)) {
      if (parsed.searchParams.get('ref') !== sha) throw new Error('Workflow reads must use the immutable default SHA');
      data = { path, encoding: 'base64', content: Buffer.from(content).toString('base64') };
    } else if (pathname.endsWith('/actions/workflows/copilot_credential_health.yml')) data = { id: 9, path, state: 'active' };
    else if (pathname.endsWith('/actions/workflows/9/runs')) data = { workflow_runs: [run] };
    else if (pathname.endsWith('/actions/organization-secrets')) data = { total_count: 2,
      secrets: names.map(name => ({ name, updated_at: '2026-10-17T13:00:00Z' })) };
    else if (pathname.endsWith('/actions/secrets')) data = { total_count: 0, secrets: [] };
    else if (pathname.endsWith('/actions/runs/19/jobs')) data = { total_count: 2, jobs: names.map(name => ({ name: `Verify ${name}`,
      run_id: 19, head_sha: sha, status: 'completed', conclusion: 'success', completed_at: '2026-10-17T13:59:40Z' })) };
    else if (pathname.endsWith('/actions/runs/19')) data = run;
    else throw new Error('Unexpected SDK evidence route');
    const response = new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
    Object.defineProperty(response, 'url', { value: String(url) });
    return response;
  };
  github.getOctokit = token => originalGetOctokit(token, { request: { fetch: fetcher } });
  const { OctokitTrustedCredentialHealthClientAdapter } = require(process.cwd() + '/src/infrastructure/github/octokit_credential_health_adapter.ts');
  const { SetupTrustedCredentialHealthAdapter } = require(process.cwd() + '/src/infrastructure/setup_trusted_credential_health_adapter.ts');
  const result = await new SetupTrustedCredentialHealthAdapter(new OctokitTrustedCredentialHealthClientAdapter(),
    { now: () => Date.parse('2026-10-17T14:00:00Z') }).validateTrustedDefault('owner', 'repo', 'fixture-only', [
    { name: 'PAT', kind: 'workflowPat', description: 'Runtime' },
    { name: 'OPENAI_API_KEY', kind: 'apiKey', description: 'Provider' },
  ]);
  console.log(JSON.stringify({ result, requests }));
}
main().catch(() => { console.error('Trusted credential evidence SDK fixture failed'); process.exitCode = 1; });
