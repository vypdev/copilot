import { createHash } from 'node:crypto';
import { SETUP_PUBLISHER_INVENTORY_LIMITS as limits, SetupPublisherInventoryError,
  type SetupPublisherInventoryDocument, type SetupPublisherInventoryEdge, type SetupPublisherInventoryFile,
  type SetupPublisherInventoryInput, type SetupPublisherInventoryLocator, type SetupPublisherInventoryReviewAuthority,
  type SetupPublisherInventoryReviewFact, type SetupPublisherInventoryReviewRecord, type SetupPublisherInventoryUnit,
  type SetupPublisherInventoryWorkflow } from '../../domain/setup_publisher_inventory_review';

type RecordValue = Record<string, unknown>;
const sha = /^[a-f0-9]{40}$/u, digest = /^[a-f0-9]{64}$/u;
const coordinate = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u;
const identity = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const jobIdentity = /^(?:[a-f0-9]{32}:)?(?:[A-Za-z_][A-Za-z0-9_-]*)?$/u;
const login = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u;
const fileFields = ['path', 'mode', 'blob', 'contentSha256'];
const object = (v: unknown): v is RecordValue => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (v: unknown, fields: readonly string[]): v is RecordValue => object(v)
  && Object.keys(v).length === fields.length && fields.every(k => Object.prototype.hasOwnProperty.call(v, k));
const positive = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
const matches = (v: unknown, pattern: RegExp): v is string => typeof v === 'string' && pattern.test(v);
const member = (v: unknown, values: readonly string[]): v is string => typeof v === 'string' && values.includes(v);
const invalid = (): never => { throw new SetupPublisherInventoryError('invalid-document'); };
const text = (v: unknown, maximum: number = limits.explanationBytes): v is string => typeof v === 'string'
  && v.length > 0 && Buffer.byteLength(v, 'utf8') <= maximum && !/[\p{Cc}\p{Cf}]/u.test(v) && validUnicode(v);
const path = (v: unknown): v is string => text(v, 512) && !v.includes('\\')
  && v.split('/').every(p => p !== '' && p !== '.' && p !== '..' && p.toLowerCase() !== '.git');
const workflowPath = (v: unknown): v is string => path(v) && /^\.github\/workflows\/[^/]+\.ya?ml$/iu.test(v);
const branch = (v: unknown): v is string => text(v, 240) && !/[~^:?*\\\s]/u.test(v) && !v.includes('[') && !v.includes('..')
  && !v.includes('@{') && v.split('/').every(p => p !== '' && !p.startsWith('.') && !p.endsWith('.') && !p.endsWith('.lock'));
const hash = (v: string): string => createHash('sha256').update(v, 'utf8').digest('hex');
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

function validUnicode(value: string): boolean {
  for (const character of value) {
    const point = character.codePointAt(0)!;
    if (point >= 0xd800 && point <= 0xdfff) return false;
  }
  return true;
}
function frozen<T>(value: T): T {
  if (value !== null && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
}

/** One canonical representation; no duplicate keys, unsafe number aliases or Unicode repair. */
export function canonicalPublisherInventoryJson(value: unknown): string {
  const sort = (v: unknown, depth: number): unknown => {
    if (depth > limits.depth) return invalid();
    if (typeof v === 'string') { if (!validUnicode(v)) return invalid(); return v; }
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') { if (!Number.isSafeInteger(v)) return invalid(); return v; }
    if (Array.isArray(v)) return v.map(item => sort(item, depth + 1));
    if (!object(v) || Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) return invalid();
    return Object.fromEntries(Object.keys(v).sort(compare).map(key => {
      if (!validUnicode(key)) return invalid();
      return [key, sort(v[key], depth + 1)];
    }));
  };
  return JSON.stringify(sort(value, 0), null, 2) + '\n';
}

export const publisherInventorySha256 = (value: unknown): string => hash(canonicalPublisherInventoryJson(value));

export function parseSetupPublisherInventoryLocator(value: unknown): SetupPublisherInventoryLocator {
  if (!exact(value, ['pullRequest', 'head', 'documentSha256']) || !positive(value.pullRequest)
    || !matches(value.head, sha) || !matches(value.documentSha256, digest)) return invalid();
  return Object.freeze({ pullRequest: value.pullRequest, head: value.head, documentSha256: value.documentSha256 });
}

function array(v: unknown, maximum: number): unknown[] {
  if (!Array.isArray(v) || v.length > maximum) return invalid();
  return v;
}
function file(v: RecordValue): void {
  if (!path(v.path) || !member(v.mode, ['100644', '100755'])
    || !matches(v.blob, sha) || !matches(v.contentSha256, digest)) invalid();
}
function orderedUnique<T>(values: readonly T[], key: (v: T) => string, insensitive = false): void {
  let last: string | undefined;
  const seen = new Set<string>();
  for (const value of values) {
    const name = key(value), folded = insensitive ? name.toLowerCase() : name;
    if (last !== undefined && compare(last, name) >= 0 || seen.has(folded)) invalid();
    seen.add(folded); last = name;
  }
}
function workflow(v: unknown): SetupPublisherInventoryWorkflow {
  if (!exact(v, [...fileFields, 'entryUnits', 'disposition']) || !workflowPath(v.path)
    || !member(v.disposition, ['non-producer', 'serialized-producer', 'incompatible', 'unresolved'])) return invalid();
  file(v);
  const entries = array(v.entryUnits, limits.units);
  if (!entries.length || entries.some(id => !matches(id, identity))) return invalid();
  orderedUnique(entries as string[], s => s);
  return v as unknown as SetupPublisherInventoryWorkflow;
}
function unit(v: unknown): SetupPublisherInventoryUnit {
  if (!exact(v, [...fileFields, 'id', 'kind', 'repositoryId', 'repository', 'commit', 'tree', 'behavior'])
    || !matches(v.id, identity) || !positive(v.repositoryId) || !matches(v.repository, coordinate)
    || !matches(v.commit, sha) || !matches(v.tree, sha) || !text(v.behavior)
    || !member(v.kind, ['workflow', 'action', 'reusable-workflow', 'composite-action', 'node-entrypoint', 'shell-program', 'data-file'])) return invalid();
  file(v); return v as unknown as SetupPublisherInventoryUnit;
}
export const publisherInventoryEdgeIdentity = (v: SetupPublisherInventoryEdge): string => `${v.from}\0${v.to}\0${v.role}`;
function edge(v: unknown): SetupPublisherInventoryEdge {
  if (!exact(v, ['from', 'to', 'role']) || !matches(v.from, identity) || !matches(v.to, identity)
    || !text(v.role, 200)) return invalid();
  return v as unknown as SetupPublisherInventoryEdge;
}
function input(v: unknown): SetupPublisherInventoryInput {
  if (!exact(v, ['id', 'workflow', 'job', 'step', 'input', 'origin', 'sourceFingerprint']) || !matches(v.id, identity)
    || !workflowPath(v.workflow) || typeof v.job !== 'string' || v.job.length > 128 || !matches(v.job, jobIdentity)
    || !Number.isSafeInteger(v.step) || Number(v.step) < 0 || Number(v.step) > 10_000
    || (v.job === '' || /^[a-f0-9]{32}:$/u.test(v.job)) && v.step !== 0
    || !text(v.input, 200) || !matches(v.sourceFingerprint, digest)
    || !member(v.origin, ['literal', 'default', 'workflow-env', 'job-env', 'step-env', 'repository-variable', 'organization-variable',
      'input-vars-json', 'symbolic-secret'])) return invalid();
  return v as unknown as SetupPublisherInventoryInput;
}

/** Parse the independently read document, not proposal-provided review DTOs. */
export function parseSetupPublisherInventoryDocument(source: string): SetupPublisherInventoryDocument {
  if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > limits.bytes) return invalid();
  let v: unknown;
  try { v = JSON.parse(source); } catch { return invalid(); }
  if (!exact(v, ['schemaVersion', 'kind', 'destination', 'publisher', 'workflowSetSha256', 'workflows', 'units', 'edges', 'inputs'])
    || v.schemaVersion !== 1 || v.kind !== 'bugbot-publisher-producer-inventory-review' || !matches(v.workflowSetSha256, digest)) return invalid();
  const target = v.destination, publisher = v.publisher;
  if (!exact(target, ['repositoryId', 'repository', 'defaultBranch', 'head', 'tree']) || !positive(target.repositoryId)
    || !matches(target.repository, coordinate) || !branch(target.defaultBranch) || !matches(target.head, sha) || !matches(target.tree, sha)) return invalid();
  if (!exact(publisher, ['repositoryId', 'commit', 'workflowSha256', 'actionManifestSha256', 'actionBundleSha256', 'contractSha256'])
    || !positive(publisher.repositoryId) || !matches(publisher.commit, sha)
    || ['workflowSha256', 'actionManifestSha256', 'actionBundleSha256', 'contractSha256'].some(k => !matches(publisher[k], digest))) return invalid();
  const workflows = array(v.workflows, limits.workflows).map(workflow), units = array(v.units, limits.units).map(unit);
  const edges = array(v.edges, limits.edges).map(edge), inputs = array(v.inputs, limits.inputs).map(input);
  orderedUnique(workflows, w => w.path, true); orderedUnique(units, u => u.id);
  orderedUnique(edges, publisherInventoryEdgeIdentity); orderedUnique(inputs, i => i.id);
  const ids = new Set(units.map(u => u.id)), paths = new Set(workflows.map(w => w.path));
  if (edges.some(e => !ids.has(e.from) || !ids.has(e.to)) || workflows.some(w => w.entryUnits.some(id => !ids.has(id)))
    || inputs.some(i => !paths.has(i.workflow))) return invalid();
  const inputKeys = inputs.map(i => `${i.workflow}\0${i.job}\0${i.step}\0${i.input}\0${i.origin}`);
  if (new Set(inputKeys).size !== inputKeys.length || canonicalPublisherInventoryJson(v) !== source) return invalid();
  return frozen(v) as unknown as SetupPublisherInventoryDocument;
}

export function publisherInventoryWorkflowSetSha256(files: readonly SetupPublisherInventoryFile[]): string {
  return publisherInventorySha256([...files].sort((a, b) => compare(a.path, b.path)).map(({ path, mode, blob, contentSha256 }) =>
    ({ path, mode, blob, contentSha256 })));
}

/** Closed contract description plus the independently selected publisher code identity. */
export function publisherInventoryContractSha256(source: Omit<SetupPublisherInventoryDocument['publisher'], 'contractSha256'>): string {
  return publisherInventorySha256({ kind: 'bugbot-status-publisher-contract', schemaVersion: 1, source,
    lane: 'copilot-bugbot-status-{repositoryId}-{pullRequest}', cancelInProgress: false, queue: 'max',
    wakeup: 'source-authorized', privateRead: 'deny-on-unavailable', lastVerified: 'preserve' });
}

export function assertSetupPublisherInventoryBindings(document: SetupPublisherInventoryDocument, observed: {
  readonly destination: SetupPublisherInventoryDocument['destination'];
  readonly publisher: SetupPublisherInventoryDocument['publisher'];
  readonly workflows: readonly SetupPublisherInventoryFile[];
}): void {
  if (publisherInventorySha256(document.destination) !== publisherInventorySha256(observed.destination)
    || publisherInventorySha256(document.publisher) !== publisherInventorySha256(observed.publisher)
    || document.workflowSetSha256 !== publisherInventoryWorkflowSetSha256(observed.workflows)
    || document.workflowSetSha256 !== publisherInventoryWorkflowSetSha256(document.workflows)) {
    throw new SetupPublisherInventoryError('binding-mismatch');
  }
}

/** Bind authenticated facts at the pure plan boundary; serialized proposals cannot supply these facts. */
export function setupPublisherInventoryFactForPlan(locator: SetupPublisherInventoryLocator,
  fact: SetupPublisherInventoryReviewFact | undefined, files: readonly { readonly path: string; readonly mode: string; readonly content: string }[]): SetupPublisherInventoryReviewFact {
  if (!fact || !exact(fact, ['pullRequest', 'head', 'base', 'documentSha256', 'workflowSetSha256', 'closureSha256',
    'contractSha256', 'decisionsSha256', 'approvals', 'workflows']) || fact.pullRequest !== locator.pullRequest
    || fact.head !== locator.head || fact.documentSha256 !== locator.documentSha256 || !matches(fact.base, sha)
    || [fact.workflowSetSha256, fact.closureSha256, fact.contractSha256, fact.decisionsSha256].some(d => !matches(d, digest))
    || !Array.isArray(fact.approvals) || !fact.approvals.length || fact.approvals.length > 1000
    || fact.approvals.some(a => !exact(a, ['reviewId', 'actorId', 'actorLogin']) || !positive(a.reviewId)
      || !positive(a.actorId) || !matches(a.actorLogin, login)) || !Array.isArray(fact.workflows)
    || fact.workflows.length !== files.length) throw new SetupPublisherInventoryError('review-required');
  if (new Set(fact.approvals.map(a => a.reviewId)).size !== fact.approvals.length
    || new Set(fact.approvals.map(a => a.actorId)).size !== fact.approvals.length
    || new Set(fact.approvals.map(a => a.actorLogin.toLowerCase())).size !== fact.approvals.length) {
    throw new SetupPublisherInventoryError('review-required');
  }
  const observed = files.map(f => {
    if (!workflowPath(f.path) || !member(f.mode, ['100644', '100755']) || typeof f.content !== 'string') return invalid();
    return { path: f.path, mode: f.mode as '100644' | '100755', contentSha256: hash(f.content),
      blob: createHash('sha1').update(`blob ${Buffer.byteLength(f.content, 'utf8')}\0`).update(f.content, 'utf8').digest('hex') };
  });
  if (publisherInventoryWorkflowSetSha256(observed) !== fact.workflowSetSha256) throw new SetupPublisherInventoryError('binding-mismatch');
  const paths = [...files.map(f => f.path)].sort(compare);
  if (fact.workflows.some((w, i) => !exact(w, ['path', 'disposition']) || w.path !== paths[i]
    || !member(w.disposition, ['non-producer', 'serialized-producer', 'incompatible', 'unresolved']))) return invalid();
  if (fact.workflows.some(w => w.disposition === 'incompatible')) throw new SetupPublisherInventoryError('incompatible-producer');
  if (fact.workflows.some(w => w.disposition === 'unresolved')) throw new SetupPublisherInventoryError('unresolved-closure');
  return frozen(JSON.parse(JSON.stringify(fact))) as SetupPublisherInventoryReviewFact;
}

const statementStart = '<!-- copilot:publisher-inventory-review:v1 -->';
const statementEnd = '<!-- /copilot:publisher-inventory-review:v1 -->';
function approvedStatement(body: string, document: SetupPublisherInventoryDocument, documentSha256: string): boolean {
  if (typeof body !== 'string' || Buffer.byteLength(body, 'utf8') > 65_536 || body.split(statementStart).length !== 2
    || body.split(statementEnd).length !== 2) return false;
  const begin = body.indexOf(statementStart) + statementStart.length, end = body.indexOf(statementEnd);
  if (end <= begin) return false;
  const statement = body.slice(begin, end).trim();
  // Every permitted value is a fixed string, hash or integer, so a valid flat
  // statement has exactly six key tokens. Duplicate/escaped duplicate keys
  // cannot disappear under JSON.parse's last-value behavior.
  if ((statement.match(/"(?:[^"\\]|\\.)*"\s*:/gu) ?? []).length !== 6) return false;
  let v: unknown;
  try { v = JSON.parse(statement); } catch { return false; }
  return exact(v, ['kind', 'decision', 'documentSha256', 'destinationRepositoryId', 'destinationHead', 'publisherContractSha256'])
    && v.kind === 'bugbot-publisher-inventory-review' && v.decision === 'compatible' && v.documentSha256 === documentSha256
    && v.destinationRepositoryId === document.destination.repositoryId && v.destinationHead === document.destination.head
    && v.publisherContractSha256 === document.publisher.contractSha256;
}

/** Provider Bot principals have a distinct login syntax; they never become human approvals. */
export function publisherInventoryActorLogin(actorType: unknown, value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (actorType === 'Bot') return /^[A-Za-z0-9][A-Za-z0-9-]{0,99}(?:\[bot\])?$/u.test(value);
  return actorType === 'User' && login.test(value);
}

/** Reduce authenticated review decisions; generic comments cannot renew or revoke an approval. */
export function decideSetupPublisherInventoryReview(document: SetupPublisherInventoryDocument, locator: SetupPublisherInventoryLocator,
  authority: SetupPublisherInventoryReviewAuthority): Pick<SetupPublisherInventoryReviewFact, 'approvals' | 'decisionsSha256'> {
  parseSetupPublisherInventoryLocator(locator);
  if (publisherInventorySha256(document) !== locator.documentSha256) throw new SetupPublisherInventoryError('binding-mismatch');
  const unavailable = (): never => { throw new SetupPublisherInventoryError('review-unavailable'); };
  if (authority.complete !== true || !positive(authority.authorId) || authority.reviews.length > 1000
    || authority.preparingActorIds.some(id => !positive(id)) || new Set(authority.preparingActorIds).size !== authority.preparingActorIds.length) return unavailable();
  const reviewers = new Map(authority.reviewers.map(actor => [actor.id, actor]));
  if (reviewers.size !== authority.reviewers.length || authority.reviewers.some(actor => !positive(actor.id) || !matches(actor.login, login)
    || !['admin', 'write', 'read', 'none', 'unavailable'].includes(actor.permission))) return unavailable();
  const decisions = new Map<number, SetupPublisherInventoryReviewRecord>(), reviewIds = new Set<number>();
  const actors = new Map<number, string>();
  for (const review of authority.reviews) {
    if (!positive(review.id) || reviewIds.has(review.id) || !positive(review.actorId) || !publisherInventoryActorLogin(review.actorType, review.actorLogin)
      || !['User', 'Bot'].includes(review.actorType) || !['PENDING', 'COMMENTED', 'APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)
      || typeof review.body !== 'string' || Buffer.byteLength(review.body, 'utf8') > 65_536
      || review.commit !== null && !sha.test(review.commit)) return unavailable();
    reviewIds.add(review.id);
    const actorName = `${review.actorLogin.toLowerCase()}:${review.actorType}`;
    if (actors.has(review.actorId) && actors.get(review.actorId) !== actorName) return unavailable();
    actors.set(review.actorId, actorName);
    if (review.state === 'PENDING') continue;
    if (review.submittedAt === null || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(review.submittedAt)
      || !Number.isFinite(Date.parse(review.submittedAt)) || new Date(review.submittedAt).toISOString()
        !== review.submittedAt.replace(/(?:\.(\d{1,3}))?Z$/u, (_match, fraction: string | undefined) => `.${(fraction ?? '').padEnd(3, '0')}Z`)) return unavailable();
    if (review.state === 'COMMENTED') continue;
    const prior = decisions.get(review.actorId);
    if (!prior || Date.parse(review.submittedAt) > Date.parse(prior.submittedAt!)
      || Date.parse(review.submittedAt) === Date.parse(prior.submittedAt!) && review.id > prior.id) decisions.set(review.actorId, review);
  }
  const approvals: { reviewId: number; actorId: number; actorLogin: string }[] = [];
  const stable: unknown[] = [];
  for (const review of [...decisions.values()].sort((a, b) => a.actorId - b.actorId)) {
    if (review.actorType !== 'User' || review.actorId === authority.authorId || authority.preparingActorIds.includes(review.actorId)) continue;
    const actor = reviewers.get(review.actorId);
    if (!actor || actor.login.toLowerCase() !== review.actorLogin.toLowerCase() || actor.permission === 'unavailable') return unavailable();
    stable.push({ reviewId: review.id, actorId: actor.id, actorLogin: actor.login.toLowerCase(), permission: actor.permission,
      state: review.state, commit: review.commit, submittedAt: review.submittedAt });
    if (actor.permission !== 'admin' && actor.permission !== 'write') continue;
    if (review.state === 'CHANGES_REQUESTED') throw new SetupPublisherInventoryError('changes-requested');
    if (review.state === 'APPROVED' && review.commit === locator.head && approvedStatement(review.body, document, locator.documentSha256)) {
      approvals.push({ reviewId: review.id, actorId: actor.id, actorLogin: actor.login });
    }
  }
  if (!approvals.length) throw new SetupPublisherInventoryError('review-required');
  return Object.freeze({ approvals: Object.freeze(approvals.map(a => Object.freeze(a))), decisionsSha256: publisherInventorySha256({
    authorId: authority.authorId, preparingActorIds: [...authority.preparingActorIds].sort((a, b) => a - b), decisions: stable }) });
}
