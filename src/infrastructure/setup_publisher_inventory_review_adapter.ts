import { createHash } from 'node:crypto';
import { builtinModules } from 'node:module';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as shellQuote from 'shell-quote';
import { JSON_SCHEMA, load } from 'js-yaml';
import { parse as parseJavaScript } from 'acorn';
import { analyze as analyzeJavaScriptScopes } from 'eslint-scope';
import type { SetupBatchTarget } from '../domain/setup_batch';
import type { SetupPublisherInspection, SetupPublisherObservedFile, SetupPublisherProposal } from '../domain/setup_publisher_installation';
import { SETUP_PUBLISHER_INVENTORY_PATH, SETUP_PUBLISHER_INVENTORY_LIMITS, SetupPublisherInventoryError,
  type SetupPublisherInventoryDocument, type SetupPublisherInventoryInput, type SetupPublisherInventoryInputOrigin,
  type SetupPublisherInventoryReviewFact, type SetupPublisherInventoryReviewRecord,
  type SetupPublisherInventoryReviewer, type SetupPublisherInventoryUnit } from '../domain/setup_publisher_inventory_review';
import { assertSetupPublisherInventoryBindings, canonicalPublisherInventoryJson, decideSetupPublisherInventoryReview,
  parseSetupPublisherInventoryDocument, publisherInventoryActorLogin, publisherInventoryConditionReferences,
  publisherInventoryContractSha256, publisherInventorySha256 } from '../application/policies/setup_publisher_inventory_review_policy';
import { setupInstallationTreeLevel } from '../application/policies/setup_installation_tree_policy';
import { setupPublisherWorkflow } from '../application/policies/setup_publisher_installation_policy';
import type { SetupInstallationTree, SetupInstallationSubtree } from '../application/contracts/setup_installation_delivery';
import { batchObject, batchPositive, batchSha, SetupBatchGithubTransport } from './setup_batch_github_read_adapter';
import { SetupPublisherGitReader } from './setup_publisher_git_reader';
import { inspectSetupPublisherWorkflows } from './setup_publisher_workflow_inventory';

type Data = Record<string, unknown>;
type Coordinate = { owner: string; repo: string };
interface UnitSource { unit: SetupPublisherInventoryUnit; content: string; reader: SetupPublisherGitReader; coordinate: Coordinate }
interface WorkspaceSource { repositoryId: number; repository: string; commit: string; prefix: string }
interface ExecutionContext {
  workflow: string; route: string; inputs: Data; environment: Data;
  workspace: WorkspaceSource[];
}
interface VariableWitness {
  readonly fingerprint: Readonly<{ effectiveVariablesSha256?: string }>;
  readonly origins: ReadonlyMap<string, 'repository-variable' | 'organization-variable'>;
}
interface InventoryObservation {
  readonly target: SetupBatchTarget;
  readonly source: SetupPublisherInspection['source'];
  readonly tree: string;
  readonly workflows: readonly SetupPublisherObservedFile[];
}
const sha256 = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');
const order = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const unresolved = (): never => { throw new SetupPublisherInventoryError('unresolved-closure'); };
const unavailable = (): never => { throw new SetupPublisherInventoryError('review-unavailable'); };
const mismatch = (): never => { throw new SetupPublisherInventoryError('binding-mismatch'); };
const safePath = (v: unknown): v is string => typeof v === 'string' && v.length <= 512 && !/[\\\p{Cc}\p{Cf}]/u.test(v)
  && v.split('/').every(p => p !== '' && p !== '.' && p !== '..' && p.toLowerCase() !== '.git');
const sibling = (file: string, relative: string) => {
  if (!relative || relative.startsWith('/') || /[\\\p{Cc}\p{Cf}]/u.test(relative)) return unresolved();
  const path = posix.normalize(posix.join(posix.dirname(file), relative));
  if (!safePath(path)) return unresolved(); return path;
};
type NodeImport = Readonly<{ specifier: string; kind: 'import' | 'require' }>;
const nodeImportPath = (file: string, dependency: NodeImport): string => {
  if (dependency.kind === 'require') return sibling(file, dependency.specifier);
  try {
    // ESM uses URLs, including percent decoding and query/fragment metadata.
    // Two distinct roots prevent an escape from being disguised by spelling
    // one synthetic root back into the untrusted relative specifier.
    const paths = ['/__copilot_inventory_left__/', '/__copilot_inventory_right__/'].map(root => {
      const base = new URL(root + file.split('/').map(encodeURIComponent).join('/'), 'file:///');
      const resolved = posix.normalize(fileURLToPath(new URL(dependency.specifier, base), { windows: false }));
      if (!resolved.startsWith(root)) return unresolved();
      return resolved.slice(root.length);
    });
    if (paths[0] !== paths[1] || !safePath(paths[0])) return unresolved();
    return paths[0];
  } catch { return unresolved(); }
};
const scope = (v: unknown): Data => {
  if (v === undefined) return {};
  const result = batchObject(v); if (!result) return unresolved(); return result;
};
const environment = (...values: readonly Data[]): Data => {
  const result: Data = {}, names = new Map<string, string>();
  for (const value of values) for (const [name, definition] of Object.entries(value)) {
    const folded = name.toUpperCase(), prior = names.get(folded);
    if (prior !== undefined && prior !== name) return unresolved();
    names.set(folded, name); result[name] = definition;
  }
  return result;
};
const hasRuntimeOverride = (values: Data): boolean => Object.keys(values)
  .some(key => /^(?:PATH|NODE_OPTIONS|NODE_PATH|BASH_ENV|ENV|SHELLOPTS|GITHUB_ACTION_PATH|LD_.*|DYLD_.*)$/iu.test(key));

/** A finite source profile, not proof of arbitrary JavaScript behavior. */
function nodeImports(content: string, boundEnvironment: ReadonlySet<string>): readonly NodeImport[] {
  let root: Data, globals: ReadonlySet<unknown>;
  try { root = parseJavaScript(content, { ecmaVersion: 'latest', sourceType: 'module',
    ranges: true, allowHashBang: true, allowReturnOutsideFunction: true }) as unknown as Data;
    const scopes = analyzeJavaScriptScopes(root as unknown as Parameters<typeof analyzeJavaScriptScopes>[0],
      { ecmaVersion: 2026, sourceType: 'module', optimistic: false, ignoreEval: false });
    if (!scopes.globalScope) return unresolved();
    globals = new Set(scopes.globalScope.through.map(reference => reference.identifier));
  } catch { return unresolved(); }
  const forbidden = new Set(['eval', 'Function', 'AsyncFunction', 'GeneratorFunction', 'AsyncGeneratorFunction',
    'WebAssembly', 'importScripts', 'globalThis', 'global', 'window', 'self', 'Reflect', 'Proxy',
    'fetch', 'WebSocket', 'XMLHttpRequest', 'Worker', 'SharedWorker', 'arguments', 'createRequire']);
  const opaqueMembers = new Set(['constructor', 'prototype', '__proto__', '__defineGetter__', '__defineSetter__',
    '__lookupGetter__', '__lookupSetter__', 'prepareStackTrace', 'getThis', 'getFunction', 'caller', 'callee', 'arguments']);
  const objectOperations = new Set(['keys', 'values', 'entries', 'fromEntries', 'assign', 'freeze', 'seal',
    'preventExtensions', 'is', 'isFrozen', 'isSealed', 'isExtensible', 'hasOwn', 'create']);
  const memberName = (node: Data): string => {
    const property = batchObject(node.property);
    if (!property) return unresolved();
    if (node.computed) {
      if (property.type !== 'Literal' || !['string', 'number'].includes(typeof property.value)) return unresolved();
      return String(property.value);
    }
    if (!['Identifier', 'PrivateIdentifier'].includes(String(property.type)) || typeof property.name !== 'string') return unresolved();
    return property.type === 'PrivateIdentifier' ? `#${property.name}` : property.name;
  };
  const literal = (node: unknown): string => {
    const value = batchObject(node);
    if (value?.type !== 'Literal' || typeof value.value !== 'string') return unresolved();
    return value.value;
  };
  const strictBody = (value: Data): boolean => {
    if (!Array.isArray(value.body)) return false;
    for (const item of value.body) {
      const statement = batchObject(item);
      if (typeof statement?.directive !== 'string') break;
      if (statement.directive === 'use strict') return true;
    }
    return false;
  };
  const module = Array.isArray(root.body) && root.body.some(value => /^(?:Import|Export)/u.test(String(batchObject(value)?.type)));
  const imports = new Map<number, NodeImport>(), pending: { node: Data; parent?: Data; depth: number; strict: boolean; thisSafe: boolean }[] = [
    { node: root, depth: 0, strict: module || strictBody(root), thisSafe: true },
  ];
  let count = 0;
  while (pending.length) {
    const { node, parent, depth, strict, thisSafe } = pending.pop()!;
    if (++count > 10_000 || depth > 64 || node.type === 'ThisExpression' && !thisSafe || node.type === 'WithStatement') return unresolved();
    if (node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' && node.source
      || node.type === 'ExportAllDeclaration') imports.set(Number(node.start), { specifier: literal(node.source), kind: 'import' });
    if (node.type === 'ImportExpression') {
      if (node.options !== undefined && node.options !== null) return unresolved();
      imports.set(Number(node.start), { specifier: literal(node.source), kind: 'import' });
    }
    if (node.type === 'CallExpression' && batchObject(node.callee)?.type === 'Identifier'
      && batchObject(node.callee)?.name === 'require' && globals.has(node.callee)) {
      if (!Array.isArray(node.arguments) || node.arguments.length !== 1) return unresolved();
      imports.set(Number(node.start), { specifier: literal(node.arguments[0]), kind: 'require' });
    }
    if (node.type === 'MemberExpression') {
      const name = memberName(node), owner = batchObject(node.object);
      if (opaqueMembers.has(name) || owner?.type === 'Identifier' && owner.name === 'Object' && globals.has(owner) && !objectOperations.has(name)) return unresolved();
      if (owner?.type === 'Identifier' && owner.name === 'process' && globals.has(owner) && name === 'env') {
        // The complete environment also contains provider/runner inputs that
        // cannot be inferred from YAML. Only a literal, source-bound key may
        // escape this member; aliases, enumeration and computed reads stay open.
        if (parent?.type !== 'MemberExpression' || parent.object !== node
          || !boundEnvironment.has(memberName(parent))) return unresolved();
      }
    }
    if (node.type === 'Property' || node.type === 'MethodDefinition' || node.type === 'PropertyDefinition') {
      const key = batchObject(node.key);
      if (node.computed && key?.type !== 'Literal' || key?.type === 'Identifier' && opaqueMembers.has(String(key.name))
        && !(node.type === 'MethodDefinition' && node.kind === 'constructor' && !node.computed)
        || key?.type === 'Literal' && opaqueMembers.has(String(key.value))) return unresolved();
    }
    if (node.type === 'Identifier' && globals.has(node)) {
      const name = String(node.name);
        if (forbidden.has(name)) return unresolved();
        if (name === 'require' && !(parent?.type === 'CallExpression' && parent.callee === node)) return unresolved();
        if (name === 'Object' && !(parent?.type === 'MemberExpression' && parent.object === node)) return unresolved();
        if (name === 'process' && !(parent?.type === 'MemberExpression' && parent.object === node && memberName(parent) === 'env')) return unresolved();
        if (name === 'module' && !(parent?.type === 'MemberExpression' && parent.object === node && memberName(parent) === 'exports')) return unresolved();
    }
    for (const value of Object.values(node)) {
      for (const item of Array.isArray(value) ? value : [value]) {
        const child = batchObject(item);
        if (child && typeof child.type === 'string') {
          const body = batchObject(child.body), functionScope = ['FunctionDeclaration', 'FunctionExpression'].includes(String(child.type));
          const childStrict = strict || child.type === 'ClassBody' || functionScope && !!body && strictBody(body);
          pending.push({ node: child, parent: node, depth: depth + 1, strict: childStrict,
            thisSafe: functionScope ? childStrict : child.type === 'ClassBody' || thisSafe });
        }
      }
    }
  }
  return [...imports].sort((a, b) => a[0] - b[0]).map(([, specifier]) => specifier);
}

/** Authenticated GETs and source bindings only. No repository program is executed and no review is submitted. */
export class SetupPublisherInventoryReviewAdapter {
  constructor(private readonly transport: SetupBatchGithubTransport) {}

  async inspect(proposal: SetupPublisherProposal, observed: InventoryObservation,
  token: string): Promise<SetupPublisherInventoryReviewFact> {
    if (proposal.schemaVersion !== 2) throw new SetupPublisherInventoryError('review-required');
    try { return await this.inspectBound(proposal, observed, token); }
    catch (error) {
      if (error instanceof SetupPublisherInventoryError) throw error;
      return unavailable();
    }
  }

  private async inspectBound(proposal: SetupPublisherProposal & { readonly schemaVersion: 2 }, observed: InventoryObservation,
    token: string): Promise<SetupPublisherInventoryReviewFact> {
    const { target, source, tree, workflows } = observed, locator = proposal.inventoryReview;
    const coordinate = { owner: target.owner, repo: target.name };
    const pull = batchObject(await this.transport.call(token, 'GET /repos/{owner}/{repo}/pulls/{pull_number}',
      { ...coordinate, pull_number: locator.pullRequest }));
    const head = batchObject(pull?.head), base = batchObject(pull?.base), author = batchObject(pull?.user);
    const belongs = (v: unknown): boolean => {
      const repository = batchObject(v);
      return repository?.id === target.id && typeof repository.full_name === 'string'
        && repository.full_name.toLowerCase() === `${target.owner}/${target.name}`.toLowerCase();
    };
    if (pull?.number !== locator.pullRequest || pull.state !== 'open' || pull.merged !== false
      || head?.sha !== locator.head || !belongs(head.repo) || !belongs(base?.repo) || !batchSha(base?.sha)
      || !batchPositive(author?.id) || !['User', 'Bot'].includes(String(author.type))) return unavailable();
    const reader = new SetupPublisherGitReader(this.transport, token, coordinate);
    const reviewTree = await reader.commitTree(locator.head), baseTree = await reader.commitTree(base.sha);
    const documentEntry = await reader.find(reviewTree, SETUP_PUBLISHER_INVENTORY_PATH);
    if (!documentEntry || documentEntry.mode !== '100644') return unavailable();
    await this.assertReviewOnlyTree(reader, baseTree, reviewTree, documentEntry.sha);
    const bytes = await reader.text(documentEntry, SETUP_PUBLISHER_INVENTORY_LIMITS.bytes);
    if (sha256(bytes) !== locator.documentSha256) return mismatch();
    const document = parseSetupPublisherInventoryDocument(bytes);
    const publisher = { repositoryId: source.repositoryId, commit: source.commit, workflowSha256: sha256(source.workflow),
      actionManifestSha256: source.actionManifestSha256, actionBundleSha256: source.actionBundleSha256 };
    assertSetupPublisherInventoryBindings(document, {
      destination: { repositoryId: target.id, repository: `${target.owner}/${target.name}`, defaultBranch: target.defaultBranch,
        head: target.baseSha, tree }, publisher: { ...publisher, contractSha256: publisherInventoryContractSha256(publisher) },
      workflows: workflows.map(file => ({ path: file.path, mode: file.mode as '100644' | '100755', contentSha256: sha256(file.content),
        blob: createHash('sha1').update(`blob ${Buffer.byteLength(file.content, 'utf8')}\0`).update(file.content, 'utf8').digest('hex') })),
    });
    if (inspectSetupPublisherWorkflows(workflows, setupPublisherWorkflow(source.workflow, source.commit)).kind === 'foreign') {
      throw new SetupPublisherInventoryError('incompatible-producer');
    }
    let units: ReadonlyMap<string, UnitSource>;
    try {
      units = await this.readUnits(document, token);
      await this.verifyClosure(document, units, target, token);
    } catch (error) {
      if (error instanceof SetupPublisherInventoryError) throw error;
      return unresolved();
    }
    this.verifyProducerMeaning(document, units);
    if (typeof head.ref !== 'string' || !head.ref || head.ref.length > 240 || /[\p{Cc}\p{Cf}]/u.test(head.ref)) return unavailable();
    const preparingActorIds = await this.preparingActors(coordinate, locator.pullRequest, locator.head, head.ref, pull.commits, author.id, token);
    const reviews = await this.reviews(coordinate, locator.pullRequest, token);
    const reviewers: SetupPublisherInventoryReviewer[] = [];
    const actors = new Map(reviews.filter(r => !['PENDING', 'COMMENTED'].includes(r.state) && r.actorType === 'User'
      && !preparingActorIds.includes(r.actorId)).map(r => [r.actorId, r.actorLogin]));
    for (const [id, login] of actors) {
      try {
        const permission = batchObject(await this.transport.call(token, 'GET /repos/{owner}/{repo}/collaborators/{username}/permission',
          { ...coordinate, username: login })), user = batchObject(permission?.user);
        if (user?.id !== id || typeof user.login !== 'string' || user.login.toLowerCase() !== login.toLowerCase()
          || !['admin', 'write', 'read', 'none'].includes(String(permission?.permission))) return unavailable();
        reviewers.push({ id, login: user.login, permission: permission!.permission as SetupPublisherInventoryReviewer['permission'] });
      } catch { return unavailable(); }
    }
    const decision = decideSetupPublisherInventoryReview(document, locator, { authorId: author.id,
      preparingActorIds, reviews, reviewers, complete: true });
    if (document.workflows.some(w => w.disposition === 'incompatible')) throw new SetupPublisherInventoryError('incompatible-producer');
    if (document.workflows.some(w => w.disposition === 'unresolved')) return unresolved();
    return Object.freeze({ ...locator, base: base.sha, workflowSetSha256: document.workflowSetSha256,
      closureSha256: publisherInventorySha256({ units: document.units, edges: document.edges, inputs: document.inputs }),
      contractSha256: document.publisher.contractSha256, ...decision,
      workflows: Object.freeze(document.workflows.map(w => Object.freeze({ path: w.path, disposition: w.disposition }))) });
  }

  private async assertReviewOnlyTree(reader: SetupPublisherGitReader, base: string, prepared: string, blob: string): Promise<void> {
    const pending: SetupInstallationSubtree[] = [{ path: '', baseSha: base, preparedSha: prepared }];
    while (pending.length) {
      const item = pending.pop()!;
      const tree = async (sha: string | undefined): Promise<SetupInstallationTree> => ({ truncated: false,
        entries: sha === undefined ? [] : (await reader.tree(sha)).map(entry => ({ path: entry.path, mode: entry.mode,
          type: entry.type, sha: entry.sha })) as SetupInstallationTree['entries'] });
      try { pending.push(...setupInstallationTreeLevel(item.path, await tree(item.baseSha), await tree(item.preparedSha),
        [{ path: SETUP_PUBLISHER_INVENTORY_PATH, sha: blob, mode: '100644' }])); }
      catch { return unavailable(); }
    }
  }

  private async reviews(coordinate: Coordinate, pullRequest: number, token: string): Promise<readonly SetupPublisherInventoryReviewRecord[]> {
    const result: SetupPublisherInventoryReviewRecord[] = [];
    for (let page = 1; page <= 10; page++) {
      const values = await this.transport.call(token, 'GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews',
        { ...coordinate, pull_number: pullRequest, per_page: 100, page });
      if (!Array.isArray(values) || values.length > 100) return unavailable();
      for (const raw of values) {
        const v = batchObject(raw), user = batchObject(v?.user);
        if (!batchPositive(v?.id) || !batchPositive(user?.id) || !publisherInventoryActorLogin(user.type, user.login)
          || !['User', 'Bot'].includes(String(user.type)) || !['PENDING', 'COMMENTED', 'APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(String(v.state))
          || typeof v.body !== 'string' && v.body !== null || typeof v.submitted_at !== 'string' && v.submitted_at !== null
          || v.commit_id !== null && !batchSha(v.commit_id)) return unavailable();
        result.push({ id: v.id, actorId: user.id, actorLogin: user.login, actorType: user.type as 'User' | 'Bot',
          state: v.state as SetupPublisherInventoryReviewRecord['state'], body: v.body === null ? '' : v.body as string,
          submittedAt: v.submitted_at as string | null, commit: v.commit_id as string | null });
      }
      if (values.length < 100) return result;
    }
    return unavailable();
  }

  private activityCursor(link: unknown, coordinate: Coordinate, ref: string): { readonly name: 'after' | 'before'; readonly value: string } | undefined {
    if (link === undefined || link === null || link === '') return undefined;
    if (typeof link !== 'string' || link.length > 16_384 || /[\p{Cc}\p{Cf}]/u.test(link)) return unavailable();
    let next: { name: 'after' | 'before'; value: string } | undefined;
    const relations = new Set<string>();
    for (const part of link.split(',')) {
      const match = /^\s*<([^<>]+)>;\s*rel="(next|prev|first|last)"\s*$/u.exec(part);
      if (!match || relations.has(match[2])) return unavailable();
      relations.add(match[2]); if (match[2] !== 'next') continue;
      let url: URL; try { url = new URL(match[1]); } catch { return unavailable(); }
      const names = [...url.searchParams.keys()], cursors = names.filter(name => name === 'after' || name === 'before');
      if (url.origin !== 'https://api.github.com' || url.username || url.password || url.hash
        || url.pathname.toLowerCase() !== `/repos/${coordinate.owner}/${coordinate.repo}/activity`.toLowerCase()
        || names.some(name => !['ref', 'per_page', 'direction', 'after', 'before'].includes(name) || url.searchParams.getAll(name).length !== 1)
        || url.searchParams.get('ref') !== ref || url.searchParams.get('per_page') !== '100' || url.searchParams.get('direction') !== 'desc'
        || cursors.length !== 1) return unavailable();
      const value = url.searchParams.get(cursors[0])!;
      if (!value || value.length > 2048 || /[\p{Cc}\p{Cf}]/u.test(value)) return unavailable();
      next = { name: cursors[0] as 'after' | 'before', value };
    }
    return next;
  }

  private async preparingActors(coordinate: Coordinate, pullRequest: number, head: string, branch: string, count: unknown,
    authorId: number, token: string): Promise<readonly number[]> {
    // GitHub exposes at most250 PR commits. Never treat a truncated history or
    // an unassociated commit author/committer as independent preparation.
    if (!batchPositive(count) || count > 250) return unavailable();
    const ids = new Set([authorId]), commits = new Set<string>(), actors = new Map<number, string>();
    const account = (value: unknown): void => {
      const actor = batchObject(value);
      if (!batchPositive(actor?.id) || !publisherInventoryActorLogin(actor.type, actor.login)) return unavailable();
      const identity = `${actor.login.toLowerCase()}:${actor.type}`;
      if (actors.has(actor.id) && actors.get(actor.id) !== identity) return unavailable();
      actors.set(actor.id, identity); ids.add(actor.id);
    };
    let last = '';
    for (let page = 1; commits.size < count; page++) {
      const values = await this.transport.call(token, 'GET /repos/{owner}/{repo}/pulls/{pull_number}/commits',
        { ...coordinate, pull_number: pullRequest, per_page: 100, page });
      if (!Array.isArray(values) || !values.length || values.length > 100 || commits.size + values.length > count) return unavailable();
      for (const value of values) {
        const commit = batchObject(value);
        if (!batchSha(commit?.sha) || commits.has(commit.sha)) return unavailable();
        commits.add(commit.sha); last = commit.sha;
        for (const key of ['author', 'committer']) account(commit[key]);
      }
      if (values.length < 100 && commits.size !== count) return unavailable();
    }
    if (last !== head) return unavailable();
    // Git author/committer fields are declarations, not evidence of who
    // published the bytes. Authenticate the complete provider activity too.
    const ref = `refs/heads/${branch}`, events = new Set<number>(), cursors = new Set<string>();
    let cursor: { name: 'after' | 'before'; value: string } | undefined, created = false, published = false;
    for (let page = 0; page < 10; page++) {
      const response = await this.transport.activityPage(token, coordinate, ref, cursor);
      if (!Array.isArray(response.entries) || response.entries.length > 100) return unavailable();
      for (const value of response.entries) {
        const event = batchObject(value);
        if (!batchPositive(event?.id) || events.has(event.id) || event.ref !== ref || !batchSha(event.before) || !batchSha(event.after)
          || !['push', 'force_push', 'branch_creation', 'branch_deletion', 'pr_merge', 'merge_queue_merge'].includes(String(event.activity_type))) return unavailable();
        events.add(event.id); account(event.actor);
        if (event.activity_type === 'branch_creation' && event.before === '0'.repeat(40) && event.after !== '0'.repeat(40)) created = true;
        if (event.after === head && event.activity_type !== 'branch_deletion') published = true;
      }
      const next = this.activityCursor(response.link, coordinate, ref);
      if (!next) {
        if (!created || !published) return unavailable();
        return [...ids].sort((a, b) => a - b);
      }
      const key = `${next.name}:${next.value}`;
      if (!response.entries.length || cursors.has(key)) return unavailable();
      cursors.add(key); cursor = next;
    }
    return unavailable();
  }

  private async readUnits(document: SetupPublisherInventoryDocument, token: string): Promise<ReadonlyMap<string, UnitSource>> {
    const readers = new Map<string, SetupPublisherGitReader>(), commits = new Map<string, string>(), result = new Map<string, UnitSource>();
    let bytes = 0;
    for (const unit of document.units) {
      const [owner, repo] = unit.repository.split('/'), coordinate = { owner, repo };
      let reader = readers.get(unit.repository);
      if (!reader) {
        const metadata = batchObject(await this.transport.call(token, 'GET /repos/{owner}/{repo}', coordinate));
        if (metadata?.id !== unit.repositoryId || typeof metadata.full_name !== 'string'
          || metadata.full_name.toLowerCase() !== unit.repository.toLowerCase()) return mismatch();
        reader = new SetupPublisherGitReader(this.transport, token, coordinate); readers.set(unit.repository, reader);
      }
      const key = `${unit.repository}:${unit.commit}`;
      let tree = commits.get(key);
      if (!tree) { tree = await reader.commitTree(unit.commit); commits.set(key, tree); }
      if (tree !== unit.tree) return mismatch();
      const entry = await reader.find(tree, unit.path);
      if (!entry || entry.type !== 'blob' || entry.mode !== unit.mode || entry.sha !== unit.blob) return mismatch();
      // Keep the existing Git blob ceiling; this profile also caps aggregate
      // source bytes at that ceiling. Destination installation assets stay unchanged.
      bytes += entry.size ?? 0; if (bytes > 100_000_000) return unresolved();
      const metadata = ['workflow', 'reusable-workflow', 'action', 'composite-action'].includes(unit.kind);
      const content = await reader.text(entry, metadata ? 100_000 : 100_000_000);
      if (sha256(content) !== unit.contentSha256) return mismatch();
      if (unit.kind === 'action' || unit.kind === 'composite-action') {
        if (!/(?:^|\/)action\.ya?ml$/u.test(unit.path)) return unresolved();
        const alternative = unit.path.endsWith('.yml') ? unit.path.slice(0, -4) + '.yaml' : unit.path.slice(0, -5) + '.yml';
        if (await reader.find(tree, alternative)) return unresolved();
      }
      result.set(unit.id, { unit, content, reader, coordinate });
    }
    return result;
  }

  private yaml(source: string): Data {
    let parsed: unknown;
    try { parsed = load(source, { schema: JSON_SCHEMA }); } catch { return unresolved(); }
    const root = batchObject(parsed); if (!root) return unresolved();
    let nodes = 0; const ancestors = new Set<object>();
    const visit = (v: unknown, depth: number): void => {
      if (++nodes > 10_000 || depth > 64) return unresolved();
      if (v === null || typeof v !== 'object') return;
      if (ancestors.has(v) || Object.prototype.hasOwnProperty.call(v, '<<')) return unresolved();
      ancestors.add(v); Object.values(v).forEach(child => visit(child, depth + 1)); ancestors.delete(v);
    };
    visit(root, 0); return root;
  }

  private async verifyClosure(document: SetupPublisherInventoryDocument, sources: ReadonlyMap<string, UnitSource>,
    target: SetupBatchTarget, token: string): Promise<void> {
    const inputs = new Map<string, SetupPublisherInventoryInput>(), active = new Set<string>();
    let variables: VariableWitness;
    try { variables = await this.variableWitness(target, sources, token); } catch { return unresolved(); }
    const sourceFor = (from: UnitSource, role: string, accept: (u: SetupPublisherInventoryUnit) => boolean): UnitSource => {
      const edges = document.edges.filter(e => e.from === from.unit.id && e.role === role);
      if (edges.length !== 1) return unresolved();
      const source = sources.get(edges[0].to); if (!source || !accept(source.unit)) return unresolved(); return source;
    };
    const observe = (source: UnitSource, context: ExecutionContext, job: string, step: number, kind: 'env' | 'with', values: Data,
      origin: SetupPublisherInventoryInputOrigin): void => {
      for (const [name, definition] of Object.entries(values)) {
        if (!/^[A-Za-z_][A-Za-z0-9_-]*$/u.test(name) || !['string', 'number', 'boolean'].includes(typeof definition)) return unresolved();
        let symbolic = false;
        if (typeof definition === 'string') {
          const expressions = [...definition.matchAll(/\$\{\{\s*([^{}]*?)\s*\}\}/gu)];
          if (definition.replace(/\$\{\{\s*([^{}]*?)\s*\}\}/gu, '').includes('${{')) return unresolved();
          for (const [, expression] of expressions) {
            const credential = /^secrets\.([A-Za-z_][A-Za-z0-9_]*)$/iu.exec(expression);
            if (credential) {
              if (!/^(?:token|github[-_]token|gh[-_]token|access[-_]token|auth[-_]token|pat|password)$/iu.test(name)) return unresolved();
              symbolic = true; continue;
            }
            if (/^(?:vars\.[A-Za-z_][A-Za-z0-9_]*|toJSON\(vars\)|github\.(?:repository|repository_id))$/iu.test(expression)) continue;
            const reference = /^(inputs|env)\.([A-Za-z_][A-Za-z0-9_-]*)$/iu.exec(expression);
            const owner = reference?.[1].toLowerCase() === 'inputs' ? context.inputs : context.environment;
            if (!reference || !Object.prototype.hasOwnProperty.call(owner, reference[2])
              || typeof owner[reference[2]] === 'string' && String(owner[reference[2]]).includes('${{')) return unresolved();
          }
        }
        const input = `${kind}:${name}`, scopeJob = context.route ? `${sha256(context.route).slice(0, 32)}:${job}` : job;
        const variableReference = typeof definition === 'string' ? /^\$\{\{\s*vars\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/iu.exec(definition) : null;
        const variableOrigin = variableReference ? variables.origins.get(variableReference[1].toUpperCase()) : undefined;
        if (variableReference && !variableOrigin) return unresolved();
        const actualOrigin = symbolic ? 'symbolic-secret' : kind === 'env' && name.toUpperCase() === 'INPUT_VARS_JSON' ? 'input-vars-json'
          : variableOrigin ?? origin;
        const anchor = { workflow: context.workflow, job: scopeJob, step, input, origin: actualOrigin };
        const record = { id: publisherInventorySha256(anchor), ...anchor, sourceFingerprint: publisherInventorySha256({
          kind: 'publisher-inventory-input-source', source: { repositoryId: source.unit.repositoryId, commit: source.unit.commit,
            path: source.unit.path, contentSha256: source.unit.contentSha256 }, definition, effectiveEnvironment: context.environment,
          callerInputs: context.inputs, variables: variables.fingerprint }) };
        if (inputs.has(record.id) && canonicalPublisherInventoryJson(inputs.get(record.id)) !== canonicalPublisherInventoryJson(record)) return unresolved();
        inputs.set(record.id, record);
      }
    };
    const condition = (value: unknown, context: ExecutionContext): void => {
      for (const reference of publisherInventoryConditionReferences(value)) {
        if (reference.context === 'vars') {
          if (variables.fingerprint.effectiveVariablesSha256 === undefined) return unresolved();
          continue;
        }
        if (reference.context === 'github') {
          if (!['repository', 'repository_id'].includes(reference.name!.toLowerCase())) return unresolved();
          continue;
        }
        const values = reference.context === 'env' ? context.environment : context.inputs;
        const names = Object.keys(values).filter(name => name.toLowerCase() === reference.name!.toLowerCase());
        if (names.length !== 1) return unresolved();
        const definition = values[names[0]];
        if (typeof definition === 'string' && /\$\{\{\s*secrets\b/iu.test(definition)) return unresolved();
      }
    };
    const metadata = async (source: UnitSource, context: ExecutionContext, depth: number): Promise<void> => {
      if (depth > 16 || active.has(source.unit.id)) return unresolved();
      active.add(source.unit.id);
      const value = this.yaml(source.content);
      const steps = async (items: unknown, job: string, parent: ExecutionContext): Promise<void> => {
        if (!Array.isArray(items) || items.length > 10_000) return unresolved();
        for (let index = 0; index < items.length; index++) {
          const step = batchObject(items[index]);
          if (!step || Object.prototype.hasOwnProperty.call(step, 'uses') === Object.prototype.hasOwnProperty.call(step, 'run')) return unresolved();
          const current = { ...parent, environment: environment(parent.environment, scope(step.env)) };
          if (step['working-directory'] !== undefined || step.shell !== undefined && !['bash', 'sh'].includes(String(step.shell))) return unresolved();
          observe(source, current, job, index + 1, 'env', scope(step.env), 'step-env');
          observe(source, current, job, index + 1, 'with', scope(step.with), 'literal');
          condition(step.if, current);
          if (typeof step.run === 'string') {
            if (step.run.includes('${{') && !/^\s*$/u.test(step.run.replace(/\$\{\{\s*github\.action_path\s*\}\}/gu, ''))) {
              // Shell interpolation may create executable syntax. General
              // expressions are not a literal source-fenced program.
              if (step.run.replace(/\$\{\{\s*github\.action_path\s*\}\}/gu, '').includes('${{')) return unresolved();
            }
            const program = sourceFor(source, `run:${job}:${index + 1}`, u => u.kind === 'shell-program' && u.repositoryId === source.unit.repositoryId
              && u.commit === source.unit.commit && u.path === source.unit.path && u.blob === source.unit.blob);
            this.verifyShell(program, step.run, document, sources, current, source, new Set());
          } else if (typeof step.uses === 'string') {
            const role = `uses:${job}:${index + 1}`;
            const called = sourceFor(source, role, u => ['action', 'composite-action'].includes(u.kind));
            this.assertUses(step.uses, source, called, current, false);
            const action = this.yaml(called.content), defaults = scope(action.inputs), provided = scope(step.with), resolved: Data = {};
            for (const [name, raw] of Object.entries(defaults)) {
              const input = batchObject(raw); if (!input) return unresolved();
              if (!Object.keys(provided).some(key => key.toLowerCase() === name.toLowerCase())
                && input.default !== undefined) resolved[name] = input.default;
            }
            observe(called, current, job, index + 1, 'with', resolved, 'default');
            await metadata(called, { ...current, inputs: { ...resolved, ...provided }, route: `${parent.route}/${source.unit.id}/${role}` }, depth + 1);
            if (/^actions\/checkout@[a-f0-9]{40}$/u.test(step.uses)) this.checkout(step, current, target);
          } else return unresolved();
        }
      };
      if (source.unit.kind === 'workflow' || source.unit.kind === 'reusable-workflow') {
        if (source.unit.kind === 'reusable-workflow' && !Object.prototype.hasOwnProperty.call(scope(value.on), 'workflow_call')) return unresolved();
        const jobs = batchObject(value.jobs); if (!jobs || !Object.keys(jobs).length) return unresolved();
        const workflowEnvironment = environment(scope(value.env));
        observe(source, { ...context, environment: workflowEnvironment }, '', 0, 'env', workflowEnvironment, 'workflow-env');
        for (const [name, raw] of Object.entries(jobs)) {
          const job = batchObject(raw); if (!job || job.environment !== undefined || job.container !== undefined || job.services !== undefined
            || job.defaults !== undefined || value.defaults !== undefined || job.secrets !== undefined) return unresolved();
          // Matrix contexts require explicit finite expansion. Until resolved,
          // they must not reuse one unexpanded set of input fingerprints.
          if (job.strategy !== undefined) return unresolved();
          const local = { ...context, environment: environment(workflowEnvironment, scope(job.env)), workspace: [] };
          observe(source, local, name, 0, 'env', scope(job.env), 'job-env');
          condition(job.if, local);
          if (typeof job.uses === 'string') {
            const role = `uses:${name}`, called = sourceFor(source, role, u => u.kind === 'reusable-workflow');
            this.assertUses(job.uses, source, called, local, true);
            observe(source, local, name, 0, 'with', scope(job.with), 'literal');
            await metadata(called, { ...local, inputs: scope(job.with), route: `${context.route}/${source.unit.id}/${role}` }, depth + 1);
          } else if (Array.isArray(job.steps)) {
            await steps(job.steps, name, local);
          } else return unresolved();
        }
      } else {
        const runs = batchObject(value.runs); if (!runs) return unresolved();
        if (runs.using === 'composite') {
          if (source.unit.kind !== 'composite-action') return unresolved();
          await steps(runs.steps, 'composite', context);
        }
        else if (runs.using === 'node20' || runs.using === 'node24') {
          if (source.unit.kind !== 'action') return unresolved();
          // The Node action handler adds INPUT_* after the step environment.
          // Composite shell steps do not receive this implicit projection.
          // A declared input without a default is still projected as an empty
          // string by the runner. Its absence is bound by this manifest and
          // the complete caller with-map, rather than by an ambient value.
          const declaredInputs = Object.fromEntries(Object.keys(scope(value.inputs)).map(name => [name, '']));
          const inputEnvironment = Object.fromEntries(Object.entries({ ...declaredInputs, ...context.inputs })
            .map(([name, value]) => [`INPUT_${name.replace(/ /gu, '_').toUpperCase()}`, value]));
          const nodeContext = { ...context, environment: environment(context.environment, inputEnvironment) };
          for (const role of ['main', 'pre', 'post']) {
            if (role !== 'main' && runs[role] === undefined) continue;
            if (role !== 'main') condition(runs[`${role}-if`], context);
            const file = runs[role]; if (typeof file !== 'string') return unresolved();
            const expected = sibling(source.unit.path, file.replace(/^\.\//u, ''));
            const program = sourceFor(source, role, u => u.kind === 'node-entrypoint' && u.repositoryId === source.unit.repositoryId
              && u.commit === source.unit.commit && u.path === expected);
            this.verifyNode(program, document, sources, nodeContext, new Set());
          }
        } else return unresolved();
      }
      active.delete(source.unit.id);
    };
    for (const workflow of document.workflows) {
      if (workflow.entryUnits.length !== 1) return unresolved();
      const source = sources.get(workflow.entryUnits[0]);
      if (!source || source.unit.kind !== 'workflow' || source.unit.repositoryId !== target.id || source.unit.commit !== target.baseSha
        || source.unit.path !== workflow.path || source.unit.blob !== workflow.blob) return mismatch();
      if (variables.fingerprint.effectiveVariablesSha256 !== undefined) {
        // A complete namespace witness binds configuration used by any source
        // control, including conditions with no env/with entries. The evidence
        // document must contain it before the independent review can qualify.
        const anchor = { workflow: workflow.path, job: '', step: 0, input: 'vars-context', origin: 'literal' as const };
        const record = { id: publisherInventorySha256(anchor), ...anchor, sourceFingerprint: publisherInventorySha256({
          kind: 'publisher-inventory-variable-context', source: { repositoryId: source.unit.repositoryId, commit: source.unit.commit,
            path: source.unit.path, contentSha256: source.unit.contentSha256 }, variables: variables.fingerprint }) };
        inputs.set(record.id, record);
      }
      await metadata(source, { workflow: workflow.path, route: '', environment: {}, inputs: {}, workspace: [] }, 0);
    }
    const expected = [...inputs.values()].sort((a, b) => order(a.id, b.id));
    if (canonicalPublisherInventoryJson(expected) !== canonicalPublisherInventoryJson(document.inputs)) return mismatch();
  }

  private assertUses(value: string, source: UnitSource, called: UnitSource, context: ExecutionContext, reusable: boolean): void {
    if (value.includes('${{')) return unresolved();
    let repository: string, commit: string, path: string;
    if (value.startsWith('$/')) {
      path = value.slice(2);
      if ((path !== '' && !safePath(path)) || path.includes('@')) return unresolved();
      // GitHub self references bind to the file containing the reference,
      // including inside external reusable workflows and composite actions.
      repository = source.unit.repository; commit = source.unit.commit;
    } else if (value.startsWith('./')) {
      if (reusable) { repository = source.unit.repository; commit = source.unit.commit; path = value.slice(2); }
      else {
        const relative = value.slice(2), checkout = [...context.workspace].sort((a, b) => b.prefix.length - a.prefix.length)
          .find(w => w.prefix === '' || relative === w.prefix || relative.startsWith(w.prefix + '/'));
        if (!checkout) return unresolved();
        repository = checkout.repository; commit = checkout.commit; path = checkout.prefix ? relative.slice(checkout.prefix.length + 1) : relative;
      }
    } else {
      const match = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?:\/(.+))?@([a-f0-9]{40})$/u.exec(value);
      if (!match) return unresolved();
      repository = match[1]; path = match[2] ?? ''; commit = match[3];
    }
    if (repository.toLowerCase() !== called.unit.repository.toLowerCase() || commit !== called.unit.commit) return mismatch();
    if (reusable ? path !== called.unit.path : ![path ? path + '/action.yml' : 'action.yml', path ? path + '/action.yaml' : 'action.yaml'].includes(called.unit.path)) return mismatch();
  }

  private checkout(step: Data, context: ExecutionContext, target: SetupBatchTarget): void {
    const values = scope(step.with), ref = values.ref;
    const repository = values.repository === undefined || values.repository === '${{ github.repository }}'
      ? `${target.owner}/${target.name}` : values.repository;
    const prefix = values.path === undefined ? '' : values.path;
    if (!batchSha(ref) || typeof repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)
      || typeof prefix !== 'string' || prefix !== '' && !safePath(prefix) || step.if !== undefined
      || values.clean === false || values.clean === 'false' || values['sparse-checkout'] !== undefined) return unresolved();
    context.workspace.push({ repositoryId: target.id, repository, commit: ref, prefix });
  }

  private verifyShell(program: UnitSource, command: string, document: SetupPublisherInventoryDocument,
    sources: ReadonlyMap<string, UnitSource>, context: ExecutionContext, owner: UnitSource, active: Set<string>): void {
    // Literal bodies are reviewed programs, never executed by inspection. Their
    // source-bound callees must be present; dynamic program/ref construction is unresolved.
    if (active.has(program.unit.id) || active.size >= 16 || /\$\(|`|\\\r?\n|\$\{/u.test(command.replace(/\$\{\{\s*github\.action_path\s*\}\}/gu, ''))) return unresolved();
    if (hasRuntimeOverride(context.environment)) return unresolved();
    const actionPrefix = '__COPILOT_BOUND_ACTION_PATH__/';
    const body = command.replace(/\$\{\{\s*github\.action_path\s*\}\}\//gu, actionPrefix);
    if (body.includes('${{')) return unresolved();
    active.add(program.unit.id);
    let calls = 0;
    for (const line of body.split(/\r?\n/u)) {
      let tokens: ReturnType<typeof shellQuote.parse>;
      const environment: Record<string, string> = {};
      for (const expansion of line.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/gu)) {
        const name = expansion[1];
        if (name === 'GITHUB_ACTION_PATH' && owner.unit.kind === 'composite-action') { environment[name] = actionPrefix.slice(0, -1); continue; }
        const value = context.environment[name];
        if (typeof value !== 'string' || value.includes('${{')) return unresolved(); environment[name] = value;
      }
      try { tokens = shellQuote.parse(line, environment); } catch { return unresolved(); }
      let words: string[] = [];
      const inspect = (): void => {
        if (!words.length) return;
        const [executable, ...args] = words;
        if (['printf', 'echo', 'true', 'false', ':', 'test', '[', 'exit'].includes(executable)) { words = []; return; }
        if (!['node', 'bash', 'sh'].includes(executable) || !args.length || args[0].startsWith('-')) return unresolved();
        const relative = args[0], actionPath = relative.startsWith(actionPrefix);
        if (actionPath && owner.unit.kind !== 'composite-action') return unresolved();
        const checkout = [...context.workspace].reverse().find(w => w.prefix === '');
        const path = actionPath ? sibling(owner.unit.path, relative.slice(actionPrefix.length)) : relative.replace(/^\.\//u, '');
        if (!safePath(path) || !actionPath && !checkout) return unresolved();
        const role = `program:${++calls}`;
        const edge = document.edges.filter(e => e.from === program.unit.id && e.role === role);
        const called = edge.length === 1 ? sources.get(edge[0].to) : undefined, expected = actionPath ? owner.unit : checkout;
        if (!called || called.unit.path !== path || called.unit.repository.toLowerCase() !== expected!.repository.toLowerCase()
          || called.unit.commit !== expected!.commit || called.unit.kind !== (executable === 'node' ? 'node-entrypoint' : 'shell-program')) return unresolved();
        if (executable === 'node') this.verifyNode(called, document, sources, context, active);
        else this.verifyShell(called, called.content, document, sources, context, owner, active);
        words = [];
      };
      for (const token of tokens) {
        if (typeof token === 'string') words.push(token);
        else if (token !== null && typeof token === 'object' && 'comment' in token) break;
        else if (token !== null && typeof token === 'object' && 'op' in token && typeof token.op === 'string'
          && [';', '&&', '||'].includes(token.op)) inspect();
        else return unresolved();
      }
      inspect();
    }
    active.delete(program.unit.id);
  }

  private verifyNode(program: UnitSource, document: SetupPublisherInventoryDocument, sources: ReadonlyMap<string, UnitSource>,
    context: ExecutionContext, active: Set<string>): void {
    if (hasRuntimeOverride(context.environment)) return unresolved();
    if (active.has(program.unit.id) || active.size >= 16) return unresolved();
    active.add(program.unit.id);
    const content = program.content;
    // Human review supplies semantics. Parsed source also closes indirect
    // loading, constructors, reflection and CommonJS wrapper escapes.
    // Provider defaults and runtime/state channels cannot be replaced by a
    // same-named YAML claim. GITHUB_TOKEN is an explicitly passed credential.
    // The Node handler also removes NODE_ICU_DATA before starting the process.
    const boundEnvironment = new Set(Object.keys(context.environment)
      .filter(name => !/^(?:GITHUB_|RUNNER_|ACTIONS_|STATE_|NODE_ICU_DATA$)/iu.test(name) || name === 'GITHUB_TOKEN'));
    const imports = nodeImports(content, boundEnvironment);
    let count = 0;
    for (const dependency of imports) {
      const { specifier } = dependency;
      if (builtinModules.includes(specifier) || builtinModules.includes(specifier.replace(/^node:/u, ''))) {
        const name = specifier.replace(/^node:/u, '');
        if (!['assert', 'assert/strict', 'buffer', 'crypto', 'events', 'os', 'path', 'path/posix', 'path/win32', 'punycode', 'querystring',
          'stream', 'stream/consumers', 'stream/promises', 'stream/web', 'string_decoder', 'timers', 'timers/promises', 'url', 'util', 'util/types', 'zlib'].includes(name)) return unresolved();
        continue;
      }
      if (!specifier.startsWith('./') && !specifier.startsWith('../')) return unresolved();
      const path = nodeImportPath(program.unit.path, dependency), role = `import:${++count}`;
      const edges = document.edges.filter(e => e.from === program.unit.id && e.role === role);
      const called = edges.length === 1 ? sources.get(edges[0].to) : undefined;
      if (!called || called.unit.path !== path || called.unit.repositoryId !== program.unit.repositoryId || called.unit.commit !== program.unit.commit
        || !['node-entrypoint', 'data-file'].includes(called.unit.kind)) return unresolved();
      if (called.unit.kind === 'node-entrypoint') this.verifyNode(called, document, sources, context, active);
      else if (!path.endsWith('.json')) return unresolved();
    }
    active.delete(program.unit.id);
  }

  private verifyProducerMeaning(document: SetupPublisherInventoryDocument, sources: ReadonlyMap<string, UnitSource>): void {
    const incompatible = (): never => { throw new SetupPublisherInventoryError('incompatible-producer'); };
    const preserving = (value: unknown): boolean => {
      const concurrency = batchObject(value);
      return concurrency !== undefined && (concurrency['cancel-in-progress'] === undefined || concurrency['cancel-in-progress'] === false)
        && concurrency.queue === 'max'
        && typeof concurrency.group === 'string' && concurrency.group.length > 0;
    };
    const lane = (value: unknown): boolean => {
      const concurrency = batchObject(value);
      return preserving(value)
        && ['copilot-bugbot-status-${{ github.repository_id }}-${{ inputs.pull_number }}',
          'copilot-bugbot-status-${{ github.repository_id }}-${{ github.event.pull_request.number }}'].includes(String(concurrency?.group));
    };
    const metadata = (id: string, inheritedLane: boolean, active: ReadonlySet<string>): void => {
      if (active.has(id) || active.size >= 16) return incompatible();
      const current = sources.get(id); if (!current) return incompatible();
      const value = this.yaml(current.content), jobs = scope(value.jobs), next = new Set([...active, id]);
      if (value.concurrency !== undefined && !preserving(value.concurrency)) return incompatible();
      const workflowLane = inheritedLane || lane(value.concurrency);
      for (const [name, raw] of Object.entries(jobs)) {
        const job = scope(raw);
        if (job.concurrency !== undefined && !preserving(job.concurrency)) return incompatible();
        const jobLane = workflowLane || lane(job.concurrency);
        if (typeof job.uses === 'string') {
          const edges = document.edges.filter(edge => edge.from === id && edge.role === `uses:${name}`);
          if (edges.length !== 1) return incompatible();
          metadata(edges[0].to, jobLane, next);
        } else if (!jobLane) return incompatible();
      }
    };
    for (const workflow of document.workflows) {
      const pending = [...workflow.entryUnits], reached = new Set<string>();
      while (pending.length) {
        const id = pending.pop()!; if (reached.has(id)) continue;
        reached.add(id); pending.push(...document.edges.filter(e => e.from === id).map(e => e.to));
      }
      const content = [...reached].map(id => sources.get(id)!.content).join('\n');
      const knownWriter = /\bissues\s*\.\s*(?:createComment|updateComment)\s*\(/u.test(content)
        && /copilot:bugbot[-:]|bugbot-status-card|COPILOT_BUGBOT_STATUS_CARD/u.test(content);
      if (workflow.disposition === 'incompatible' || knownWriter && workflow.disposition !== 'serialized-producer') return incompatible();
      if (workflow.disposition !== 'serialized-producer') continue;
      // The independent review identifies semantic writer paths. Observable
      // serialization must also hold; a claimed compatible label cannot waive
      // missing queue preservation or cancel an older publication.
      metadata(workflow.entryUnits[0], false, new Set());
    }
  }

  private async variableWitness(target: SetupBatchTarget,
    sources: ReadonlyMap<string, UnitSource>, token: string): Promise<VariableWitness> {
    if (![...sources.values()].some(s => ['workflow', 'reusable-workflow', 'action', 'composite-action'].includes(s.unit.kind)
      && /\bvars\b/iu.test(s.content))) return { fingerprint: {}, origins: new Map() };
    const coordinate = { owner: target.owner, repo: target.name };
    const collect = async (route: string, parameters: Data, key: string): Promise<unknown[]> => {
      const result: unknown[] = []; let total: number | undefined;
      for (let page = 1; page <= 34; page++) {
        const data = batchObject(await this.transport.call(token, route, { ...parameters, per_page: 30, page }));
        if (!data || !Number.isSafeInteger(data.total_count) || Number(data.total_count) < 0 || Number(data.total_count) > 1000
          || total !== undefined && total !== data.total_count || !Array.isArray(data[key]) || data[key].length > 30) return unresolved();
        total = Number(data.total_count); result.push(...data[key]);
        if (result.length === total) return result;
        if (result.length > total || data[key].length < 30) return unresolved();
      }
      return unresolved();
    };
    const repository = batchObject(await this.transport.call(token, 'GET /repos/{owner}/{repo}', coordinate));
    if (repository?.id !== target.id || typeof repository.full_name !== 'string'
      || repository.full_name.toLowerCase() !== `${target.owner}/${target.name}`.toLowerCase()) return mismatch();
    const owner = batchObject(repository.owner), effective: Data = {};
    if (!batchPositive(owner?.id) || owner.id !== target.ownerId || typeof owner.login !== 'string'
      || owner.login.toLowerCase() !== target.owner.toLowerCase()) return mismatch();
    if (owner?.type === 'Organization') {
      // The provider authenticates which organization Variables are shared
      // with this exact repository. Global organization enumeration/grants
      // require broader privileges and are not an effective-input prerequisite.
      const variables = await collect('GET /repos/{owner}/{repo}/actions/organization-variables', coordinate, 'variables');
      for (const raw of variables) {
        const variable = batchObject(raw); if (!variable) return unresolved();
        this.variable(effective, variable, 'organization-variable');
      }
    } else if (owner?.type !== 'User') return unresolved();
    const repositoryVariables = await collect('GET /repos/{owner}/{repo}/actions/variables', coordinate, 'variables');
    const local: Data = {};
    for (const raw of repositoryVariables) { const variable = batchObject(raw); if (!variable) return unresolved(); this.variable(local, variable, 'repository-variable'); }
    const merged = { ...effective, ...local };
    if (Buffer.byteLength(canonicalPublisherInventoryJson(merged), 'utf8') > 256 * 1024) return unresolved();
    // Only a fingerprint enters the document/fact. Values never leave this read scope.
    return { fingerprint: { effectiveVariablesSha256: publisherInventorySha256(merged) }, origins: new Map(Object.entries(merged)
      .map(([name, value]) => [name, (value as { origin: 'repository-variable' | 'organization-variable' }).origin])) };
  }

  private variable(values: Data, variable: Data, origin: string): void {
    const name = variable.name;
    if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,99}$/u.test(name) || typeof variable.value !== 'string'
      || Buffer.byteLength(variable.value, 'utf8') > 30_000 || Object.prototype.hasOwnProperty.call(values, name.toUpperCase())) return unresolved();
    values[name.toUpperCase()] = { origin, value: variable.value };
  }
}
