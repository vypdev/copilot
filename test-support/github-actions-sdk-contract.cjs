const assert = require('node:assert/strict');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const ts = require(process.cwd() + '/node_modules/typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
}).outputText, filename);

async function main() {
  const existingAccess = process.argv.includes('--existing-access');
  const { getOctokit } = await import(pathToFileURL(require.resolve('@actions/github', { paths: [process.cwd()] })).href);
  const { SetupRemoteConfigurationQueryRepository, RepositorySecretsCommandRepository, RepositoryVariablesCommandRepository } = require(process.cwd() + '/src/data/repository/repository_variables_repository.ts');
  const { RepositoryVersionTagsQueryRepository } = require(process.cwd() + '/src/data/repository/release/repository_version_tags_query_repository.ts');
  const calls = [];
  const fetcher = async (url, options) => {
    const requestUrl = new URL(url);
    const path = requestUrl.pathname;
    const method = options.method;
    const payload = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ path, method, payload });
    let data;
    let status = 200;
    let nextPage;
    if (method === 'GET' && path === '/repos/owner/repo/tags') data = [{ name: 'v3' }, { name: 'v9.0.0' }, { name: 'v3.3.1' }];
    else if (method === 'GET' && path === '/repos/owner/repo') data = { id: 42, visibility: 'private', owner: { type: 'Organization' }, default_branch: 'main' };
    else if (method === 'GET' && path.endsWith('/public-key')) data = { key_id: 'fixture-key', key: Buffer.alloc(32, 7).toString('base64') };
    else if (method === 'GET' && path.includes('/workflows/')) data = { id: 1 };
    else if (method === 'GET' && path.endsWith('/organization-secrets')) data = { total_count: 1, secrets: [{ name: 'ORG_SECRET' }] };
    else if (method === 'GET' && path.endsWith('/organization-variables')) {
      const lastPage = existingAccess && requestUrl.searchParams.get('page') === '2';
      data = { total_count: existingAccess ? 2 : 1, variables: [{ name: lastPage ? 'EXISTING_VAR' : 'ORG_VAR', value: 'visible' }] };
      if (existingAccess && !lastPage) nextPage = '<https://api.github.com/repos/owner/repo/actions/organization-variables?per_page=30&page=2>; rel="next"';
    }
    else if (method === 'GET' && path.endsWith('/secrets')) data = { total_count: 1, secrets: [{ name: 'EXISTING_SECRET', visibility: 'selected' }] };
    else if (method === 'GET' && path.endsWith('/variables')) data = { total_count: 1, variables: [{ name: 'EXISTING_VAR', value: 'old', visibility: 'selected' }] };
    else if (method === 'POST' && path.endsWith('/variables')) { status = 201; data = {}; }
    else if (existingAccess && method === 'PUT' && /\/variables\//.test(path)) throw new Error('Redundant Variable grant was requested.');
    else if ((method === 'PUT' && /\/(secrets|variables)\//.test(path)) || (method === 'PATCH' && /\/variables\//.test(path))) status = 204;
    else throw new Error(`Unexpected SDK request: ${method} ${path}`);
    const response = new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...(nextPage ? { link: nextPage } : {}) } });
    Object.defineProperty(response, 'url', { value: String(url) });
    return response;
  };
  const client = getOctokit('fixture-only', { request: { fetch: fetcher } });
  const provider = { getClient: () => client };
  assert.equal(await new RepositoryVersionTagsQueryRepository(provider).getLatestTag('owner', 'repo', 'fixture-only'), '9.0.0');
  const remote = await new SetupRemoteConfigurationQueryRepository(provider).inspect('owner', 'repo', 'fixture-only');
  assert.equal(remote.repositorySecretsAccess, 'available');
  assert.equal(remote.repositoryVariablesAccess, 'available');
  assert.equal(remote.organizationSecretsAccess, 'available');
  assert.equal(remote.organizationVariablesAccess, 'available');
  const secrets = new RepositorySecretsCommandRepository(provider);
  const variables = new RepositoryVariablesCommandRepository(provider);
  const target = { scope: 'organization', organizationVisibility: 'selected', repositoryId: 42 };
  const secretResult = await secrets.upsertSecrets('owner', 'repo', 'fixture-only', [{ name: 'NEW_SECRET', value: 'fixture-secret' }]);
  assert.deepEqual(secretResult, { created: 1, updated: 0, skipped: 0, errors: [] });
  assert.deepEqual(await secrets.upsertScopedSecrets('owner', 'repo', 'fixture-only', target, [{ name: 'NEW_SECRET', value: 'fixture-secret' }, { name: 'EXISTING_SECRET', value: 'replacement' }]), { created: 1, updated: 1, skipped: 0, errors: [] });
  assert.deepEqual(await variables.upsertScopedVariables('owner', 'repo', 'fixture-only', target, [{ name: 'NEW_VAR', value: 'new' }, { name: 'EXISTING_VAR', value: 'updated' }]), { created: 1, updated: 1, errors: [] });
  assert(calls.some(c => c.method === 'POST' && c.path === '/orgs/owner/actions/variables'));
  assert(calls.filter(c => c.method === 'PATCH').every(c => !('visibility' in c.payload) && !('selected_repository_ids' in c.payload)));
  assert(calls.some(c => c.method === 'PATCH' && c.path === '/orgs/owner/actions/variables/EXISTING_VAR'));
  assert(calls.some(c => c.path === '/orgs/owner/actions/secrets/EXISTING_SECRET/repositories/42'));
  assert.equal(calls.some(c => c.path === '/orgs/owner/actions/variables/EXISTING_VAR/repositories/42'), !existingAccess);
  assert(!calls.some(c => c.path === '/orgs/owner/actions/variables/NEW_VAR/repositories/42'));
  assert(!calls.filter(c => /\/secrets\//.test(c.path)).some(c => JSON.stringify(c.payload ?? {}).includes('fixture-secret')));
  console.log(JSON.stringify({ inventory: 'available', existingAccess, secretResult, requests: calls.map(({method,path})=>({method,path})) }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
