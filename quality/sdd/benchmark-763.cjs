#!/usr/bin/env node
// Contributor qualification. Uses only generated source and a disposable local Git remote.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
require.extensions['.ts'] = (module, file) => {
  assert(file.startsWith(path.join(root, 'src') + path.sep));
  module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, file);
};
const use = file => require(path.join(root, 'src', file + '.ts'));
const { PreBranchSddWorkspaceAdapter } = use('infrastructure/pre_branch_sdd_workspace_adapter');
const { draftIncrementalSdd } = use('application/usecases/sdd/pre_branch_sdd_incremental_workflow');
const { explicitSddObligations } = use('domain/sdd_incremental_plan');
const { SddResourceFailure } = use('domain/sdd_resource_budget');
const { sddConsistencyFixture } = use('testing/sdd_consistency_fixture');

const count = Number(process.argv[2] ?? '400');
const ownerBytes = Number(process.argv[3] ?? '100820');
const executable = process.env.SDD_BENCH_CODEX_EXECUTABLE;
assert(Number.isSafeInteger(count) && count > 0 && count <= 4096);
assert(Number.isSafeInteger(ownerBytes) && ownerBytes >= 4096 && ownerBytes <= 4 * 1024 * 1024);
assert(!executable || count <= 400, 'Live measurements are limited to synthetic workloads of at most 400 cases.');
const target = { action: 'update', path: 'specs/payments.md', capabilityId: 'payment-ledger',
  reason: 'Preserve the baseline and add synthetic scenarios.', questions: [] };
const git = (cwd, ...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', cwd, ...args], {
  encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const table = (head, rows) => [head, head.map(() => '---'), ...rows].map(row => '| ' + row.join(' | ') + ' |').join('\n');
const elapsed = start => Math.round((performance.now() - start) * 100) / 100;

function scripted(prompt) {
  const unitId = /Return only the JSON for unit ([a-z]+-\d+)\./u.exec(prompt)[1];
  if (unitId.startsWith('inventory-')) return { unitId, requirements: [], cases: [], paths: [] };
  const numbers = prompt.split('Draft the body only for these numbered sections: ')[1].split('. Return all')[0]
    .split('; ').map(heading => Number(heading.split('.')[0]));
  return { unitId, sections: numbers.map(section => ({
    section, body: 'The reviewed ledger records exact outcomes for independent scenarios. '.repeat(5),
  })) };
}

function measuredProvider(totals) {
  const { AgentExecutionPlanner } = use('infrastructure/agents/agent_execution_planner');
  const { runAgentCli } = use('data/repository/agent_cli_execution');
  const { createFindingsQueryPort } = use('infrastructure/composition/agent_capability_composition_root');
  const planner = new AgentExecutionPlanner();
  return createFindingsQueryPort({ cli: { async execute(request) {
    const plan = planner.prepare(request);
    const args = plan.argv.slice(0, -1).concat('--json', plan.argv.at(-1));
    const output = await runAgentCli({ ...plan, argv: args }, request.prompt, request.signal);
    let message;
    for (const line of output.split('\n').filter(Boolean)) {
      const event = JSON.parse(line);
      if (event.type === 'item.completed' && event.item.type === 'agent_message') message = event.item.text;
      if (event.type !== 'turn.completed') continue;
      for (const key of Object.keys(totals)) {
        assert(Number.isSafeInteger(event.usage[key]), 'Provider did not report a token counter.');
        totals[key] += event.usage[key];
      }
    }
    assert(typeof message === 'string', 'Provider did not emit its structured answer.');
    return message;
  } } });
}

async function main() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-sdd-bench-'));
  const repo = path.join(temporary, 'checkout');
  const original = process.cwd();
  const result = { sdk: git(root, 'rev-parse', 'HEAD'), worktreeDirty: Boolean(git(root, 'status', '--porcelain')),
    workload: executable ? 'codex' : 'scripted', cases: count, requirements: count, edges: count,
    ownerBytes, calls: 0, promptBytes: 0, responseBytes: 0, providerMs: 0 };
  const put = (file, content) => {
    const destination = path.join(repo, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content);
  };
  try {
    fs.mkdirSync(repo);
    git(repo, 'init', '-b', 'develop');
    git(repo, 'config', 'user.name', 'Synthetic SDD qualification');
    git(repo, 'config', 'user.email', 'fixture@example.invalid');
    git(temporary, 'init', '--bare', 'remote.git');
    git(repo, 'remote', 'add', 'origin', path.join(temporary, 'remote.git'));
    const owner = sddConsistencyFixture('baseline', target.path, 'update');
    put(target.path, owner.padEnd(ownerBytes, '\n'));
    put('docs/payments.mdx', '# Synthetic ledger\n');
    for (const name of ['README.md', '_template.md']) put('specs/' + name, fs.readFileSync(path.join(root, 'specs', name)));
    const catalog = { version: 1, capabilities: [{
      id: target.capabilityId, title: 'Payment ledger', status: 'proposed', scope: 'Synthetic settlement behaviors',
      owner: 'Maintainers', lastVerified: '2026-11-06', specs: [target.path], documentation: ['docs/payments.mdx'],
      workflows: [], entrypoints: [], code: [], tests: [],
    }] };
    put('specs/catalog.json', JSON.stringify(catalog));
    git(repo, 'add', '--all'); git(repo, 'commit', '-m', 'Synthetic immutable baseline'); git(repo, 'push', 'origin', 'develop');
    const workload = Array.from({ length: count }, (_, index) => index + 1);
    const input = ['Record only the canonical synthetic cases and preserve the baseline.',
      table(['Requirement', 'Behavior'], workload.map(i => ['AUDIT-' + i, 'Preserve ledger outcome ' + i + '.'])),
      table(['Case ID', 'Area', 'Requirements', 'Scenario'], workload.map(i => ['audit-C' + i, 'Ledger', 'AUDIT-' + i, 'Observe isolated result ' + i + '.'])),
      table(['Path', 'Change'], [[target.path, 'update'], ['docs/payments.mdx', 'reference']]),
    ].join('\n\n');
    const workspace = new PreBranchSddWorkspaceAdapter(repo);
    let start = performance.now();
    const snapshot = await workspace.loadSnapshot('develop');
    result.sourceMs = elapsed(start);
    start = performance.now();
    const repositoryInventory = await workspace.readRepositoryInventory(snapshot.baseSha);
    result.inventoryMs = elapsed(start);
    result.inventoryFiles = repositoryInventory.files.size;
    process.chdir(repo);
    const totals = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 };
    const provider = executable ? measuredProvider(totals) : undefined;
    let prepared;
    start = performance.now();
    await draftIncrementalSdd({ configuration: { provider: 'codex', model: 'gpt-6-luna', modelProvider: 'openai',
      effort: 'low', ...(executable ? { executable } : {}) }, plan: target, baseSha: snapshot.baseSha, issueNumber: 763,
      title: 'Synthetic publication qualification', context: 'All input is synthetic. The host owns canonical inventory.',
      inputs: [input], explicit: explicitSddObligations([input]), repositoryInventory,
      agent: { async query(request) {
        const queryStarted = performance.now();
        result.calls++;
        result.promptBytes += Buffer.byteLength(request.prompt);
        const response = provider ? await provider.query(request) : scripted(request.prompt);
        result.providerMs += elapsed(queryStarted);
        result.responseBytes += Buffer.byteLength(JSON.stringify(response));
        return response;
      } },
      validate: async markdown => {
        const validationStarted = performance.now();
        prepared = await workspace.validateDraft(snapshot, target, markdown);
        result.validationMs = elapsed(validationStarted);
      },
    });
    result.draftingMs = elapsed(start);
    result.planningAndAssemblyMs = Math.round((result.draftingMs - result.validationMs - result.providerMs) * 100) / 100;
    if (provider) result.tokens = totals;
    assert(prepared.markdown.startsWith(owner.padEnd(ownerBytes, '\n')));
    result.outputBytes = Buffer.byteLength(prepared.markdown);
    const branch = 'feature/763-local-qualification';
    git(repo, 'push', 'origin', 'develop:refs/heads/' + branch);
    let expectedCommit;
    start = performance.now();
    const commit = await workspace.publish(branch, prepared, async candidate => { expectedCommit = candidate; });
    assert.equal(commit, expectedCommit);
    assert(await workspace.verifyPublication(branch, snapshot.baseSha, expectedCommit, target.path));
    result.publicationMs = elapsed(start);
  } catch (error) {
    if (!(error instanceof SddResourceFailure)) throw error;
    result.stopped = { stage: error.stage, unit: error.unit, limit: error.limit, observed: error.observed };
    assert.equal(git(repo, 'ls-remote', 'origin', 'refs/heads/feature/*'), '');
  } finally {
    process.chdir(original);
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  result.peakRssKiB = process.resourceUsage().maxRSS;
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Qualification failed'); process.exitCode = 1; });
