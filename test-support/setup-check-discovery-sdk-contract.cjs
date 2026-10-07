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
  Date.now = () => Date.parse('2026-10-07T12:00:00Z');
  const fetcher = async (url, options) => {
    const parsed = new URL(url);
    requests.push({ method: options.method, path: parsed.pathname, query: Object.fromEntries(parsed.searchParams) });
    if (options.method !== 'GET') throw new Error('Discovery must be read-only');
    let data;
    if (parsed.pathname.endsWith('/actions/runs')) data = { workflow_runs: [
      { id: 42, name: 'CI', event: 'pull_request', head_sha: sha, run_attempt: 1, status: 'completed', created_at: '2026-10-07T11:00:00Z' },
      { id: 10, name: 'Push CI', event: 'push', head_sha: sha, run_attempt: 1, status: 'completed', created_at: '2026-10-07T11:00:00Z' },
      { id: 9, name: 'Old CI', event: 'pull_request', head_sha: sha, run_attempt: 1, status: 'completed', created_at: '2026-03-14T11:28:34Z' },
    ] };
    else if (parsed.pathname.endsWith('/check-runs')) data = { check_runs: [
      { id: 90, name: 'Tests', app: { id: 15368 }, head_sha: sha, conclusion: 'success' },
    ] };
    else if (parsed.pathname === '/repos/owner/repo/actions/runs/42/attempts/1/jobs') data = { jobs: [
      { name: 'Tests', check_run_url: 'https://api.github.com/repos/owner/repo/check-runs/90' },
    ] };
    else throw new Error(`Unexpected discovery route: ${parsed.pathname}`);
    const response = new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
    Object.defineProperty(response, 'url', { value: String(url) });
    return response;
  };
  github.getOctokit = token => originalGetOctokit(token, { request: { fetch: fetcher } });
  const { GithubSetupApprovalCheckDiscoveryAdapter } = require(process.cwd() + '/src/infrastructure/github_setup_approval_check_discovery_adapter.ts');
  const result = await new GithubSetupApprovalCheckDiscoveryAdapter().discover('owner', 'repo', 'fixture-only');
  console.log(JSON.stringify({ result, requests }));
}
main().catch(() => { console.error('Setup discovery SDK fixture failed'); process.exitCode = 1; });
