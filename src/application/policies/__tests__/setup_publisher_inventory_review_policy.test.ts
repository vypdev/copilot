import { createHash } from 'node:crypto';
import type { SetupPublisherInventoryDocument, SetupPublisherInventoryReviewAuthority, SetupPublisherInventoryReviewFact,
  SetupPublisherInventoryReviewRecord } from '../../../domain/setup_publisher_inventory_review';
import { SetupPublisherInventoryError } from '../../../domain/setup_publisher_inventory_review';
import { assertSetupPublisherInventoryBindings, canonicalPublisherInventoryJson, decideSetupPublisherInventoryReview,
  parseSetupPublisherInventoryDocument, parseSetupPublisherInventoryLocator, publisherInventoryContractSha256,
  publisherInventorySha256, publisherInventoryWorkflowSetSha256, setupPublisherInventoryFactForPlan } from '../setup_publisher_inventory_review_policy';
import { parseSetupPublisherProposal } from '../setup_publisher_installation_policy';
import { planSetupPublisherInstallation } from '../setup_publisher_plan_policy';
import { setupPublisherFixture } from './fixtures/setup_publisher_fixture';

type Mutable<T> = T extends readonly (infer U)[] ? Mutable<U>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
const copy = <T>(value: T): Mutable<T> => JSON.parse(JSON.stringify(value)) as Mutable<T>;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** Pure-policy fixture only; authenticated provider/composition coverage is separate. */
function fixture() {
  const f = setupPublisherFixture();
  const content = 'name: CI\non: push\njobs:\n  inspect:\n    steps:\n      - run: printf ok\n';
  const file = { path: '.github/workflows/ci.yml', mode: '100644' as const,
    blob: createHash('sha1').update(`blob ${Buffer.byteLength(content)}\0${content}`).digest('hex'), contentSha256: hash(content) };
  f.inspection.installation.workflows = [{ path: file.path, mode: file.mode, content }];
  const publisher = { repositoryId: f.inspection.source.repositoryId, commit: f.proposal.source.commit,
    workflowSha256: f.proposal.source.workflowSha256, actionManifestSha256: f.proposal.source.actionManifestSha256,
    actionBundleSha256: f.proposal.source.actionBundleSha256 };
  const document: Mutable<SetupPublisherInventoryDocument> = { schemaVersion: 1, kind: 'bugbot-publisher-producer-inventory-review',
    destination: { ...f.proposal.destination, tree: '5'.repeat(40) },
    publisher: { ...publisher, contractSha256: publisherInventoryContractSha256(publisher) },
    workflowSetSha256: publisherInventoryWorkflowSetSha256([file]),
    workflows: [{ ...file, entryUnits: ['workflow-ci'], disposition: 'non-producer' }],
    units: [{ ...file, id: 'shell-ci', kind: 'shell-program', repositoryId: 42, repository: 'owner/project',
      commit: f.proposal.destination.head, tree: '5'.repeat(40), behavior: 'Literal output; no status-card writes.' },
    { ...file, id: 'workflow-ci', kind: 'workflow', repositoryId: 42, repository: 'owner/project',
      commit: f.proposal.destination.head, tree: '5'.repeat(40), behavior: 'One source-bound literal shell step.' }],
    edges: [{ from: 'workflow-ci', to: 'shell-ci', role: 'run:inspect:1' }], inputs: [] };
  const locator = { pullRequest: 81, head: '6'.repeat(40), documentSha256: publisherInventorySha256(document) };
  const statement = { kind: 'bugbot-publisher-inventory-review', decision: 'compatible', documentSha256: locator.documentSha256,
    destinationRepositoryId: 42, destinationHead: document.destination.head, publisherContractSha256: document.publisher.contractSha256 };
  const review: Mutable<SetupPublisherInventoryReviewRecord> = { id: 101, actorId: 17, actorLogin: 'reviewer', actorType: 'User',
    state: 'APPROVED', submittedAt: '2026-11-28T00:00:00Z', commit: locator.head,
    body: '<!-- copilot:publisher-inventory-review:v1 -->\n' + JSON.stringify(statement)
      + '\n<!-- /copilot:publisher-inventory-review:v1 -->' };
  const authority: Mutable<SetupPublisherInventoryReviewAuthority> = { authorId: 9, preparingActorIds: [9], complete: true,
    reviews: [review], reviewers: [{ id: 17, login: 'reviewer', permission: 'write' }] };
  const fact: Mutable<SetupPublisherInventoryReviewFact> = { ...locator, base: '7'.repeat(40),
    workflowSetSha256: document.workflowSetSha256, closureSha256: publisherInventorySha256({ units: document.units, edges: document.edges, inputs: document.inputs }),
    contractSha256: document.publisher.contractSha256, ...copy(decideSetupPublisherInventoryReview(document, locator, authority)),
    workflows: document.workflows.map(w => ({ path: w.path, disposition: w.disposition })) };
  return { ...f, document, locator, statement, review, authority, fact, file,
    version2: { ...f.proposal, schemaVersion: 2 as const, inventoryReview: locator } };
}

describe('publisher inventory closed input and binding', () => {
  it('publisher-inventory-C01: admits a valid locator but requires independent facts before a version2 preview', () => {
    const f = fixture();
    const proposal = parseSetupPublisherProposal(f.version2);
    expect(proposal.schemaVersion).toBe(2); expect(proposal.installationAuthorized).toBe(false);
    expect(parseSetupPublisherInventoryLocator(f.locator)).toEqual(f.locator);
    const parsed = parseSetupPublisherInventoryDocument(canonicalPublisherInventoryJson(f.document));
    expect(parsed).toEqual(f.document); expect(Object.isFrozen(parsed.units[0])).toBe(true);
    expect(() => planSetupPublisherInstallation(proposal, f.inspection, '12345678-1234-4234-8234-123456789abc'))
      .toThrow('review-required');
    f.inspection.installation.inventoryReview = f.fact;
    const plan = planSetupPublisherInstallation(proposal, f.inspection, '12345678-1234-4234-8234-123456789abc');
    expect(plan.status).toBe('review'); expect(plan.files).toHaveLength(2);
    expect(plan.inventoryReview).toEqual(f.fact); expect(Object.isFrozen(plan.inventoryReview!.approvals)).toBe(true);
    expect(plan.nativeVerification).toBe('pending');
  });
  it('publisher-inventory-C02: preserves version1 input and rejects an attempted review-authority extension', () => {
    const f = fixture();
    expect(parseSetupPublisherProposal(f.proposal)).toEqual(f.proposal);
    expect(() => parseSetupPublisherProposal({ ...f.proposal, inventoryReview: f.locator })).toThrow('invalid or unsupported');
    expect(() => parseSetupPublisherProposal({ ...f.proposal, schemaVersion: 2 })).toThrow('invalid or unsupported');
  });
  it('publisher-inventory-C03: rejects missing or invalid closed locator fields before inspection', () => {
    const f = fixture();
    for (const key of ['pullRequest', 'head', 'documentSha256']) {
      const value = { ...f.locator } as Record<string, unknown>; delete value[key];
      expect(() => parseSetupPublisherInventoryLocator(value)).toThrow(SetupPublisherInventoryError);
      expect(() => parseSetupPublisherProposal({ ...f.version2, inventoryReview: value })).toThrow('invalid or unsupported');
    }
    for (const value of [null, [], false, { ...f.locator, pullRequest: 0 }, { ...f.locator, head: '../ref' },
      { ...f.locator, documentSha256: 'bad' }, { ...f.locator, approved: true }]) {
      expect(() => parseSetupPublisherInventoryLocator(value)).toThrow(SetupPublisherInventoryError);
    }
  });
  it('publisher-inventory-C04: rejects future versions, extra fields and malformed nested document records', () => {
    const f = fixture();
    const mutations: ((d: Mutable<SetupPublisherInventoryDocument>) => void)[] = [
      d => Object.assign(d, { schemaVersion: 2 }), d => Object.assign(d, { kind: 'another-purpose' }),
      d => Object.assign(d, { approval: true }), d => Object.assign(d.destination, { actorId: 17 }),
      d => Object.assign(d.destination, { defaultBranch: '../outside' }), d => Object.assign(d.destination, { repositoryId: 0 }),
      d => Object.assign(d.destination, { repository: 'foreign' }), d => Object.assign(d.destination, { head: 'bad' }),
      d => Object.assign(d.destination, { tree: 'bad' }), d => Object.assign(d.publisher, { extra: true }),
      d => Object.assign(d.publisher, { commit: 'bad' }), d => Object.assign(d.publisher, { repositoryId: 0 }),
      d => Object.assign(d.publisher, { contractSha256: 'bad' }), d => Object.assign(d, { workflowSetSha256: 'bad' }),
      d => Object.assign(d.workflows[0], { disposition: { toString: 'non-producer' } }),
      d => Object.assign(d.units[0], { kind: 'future' }), d => Object.assign(d.units[0], { id: '' }),
      d => Object.assign(d.units[0], { behavior: '' }), d => Object.assign(d.units[0], { repository: 'foreign' }),
      d => Object.assign(d.units[0], { tree: 'bad' }), d => Object.assign(d.units[0], { commit: 'bad' }),
      d => Object.assign(d.edges[0], { role: '' }), d => Object.assign(d.edges[0], { extra: true }),
    ];
    for (const mutate of mutations) { const d = copy(f.document); mutate(d); expect(() => parseSetupPublisherInventoryDocument(canonicalPublisherInventoryJson(d))).toThrow(SetupPublisherInventoryError); }
    for (const value of ['', '{', 'null', '[]', canonicalPublisherInventoryJson({})]) expect(() => parseSetupPublisherInventoryDocument(value)).toThrow(SetupPublisherInventoryError);
    expect(() => parseSetupPublisherProposal({ ...f.version2, schemaVersion: 3 })).toThrow('invalid or unsupported');
  });
  it('publisher-inventory-C05: rejects duplicate JSON keys, noncanonical bytes, unsafe numbers and Unicode repair', () => {
    const f = fixture(), source = canonicalPublisherInventoryJson(f.document);
    expect(() => parseSetupPublisherInventoryDocument(source.replace('"schemaVersion": 1', '"schemaVersion": 1, "schemaVersion": 1'))).toThrow();
    for (const value of [source.trim(), JSON.stringify(f.document), '\ufeff' + source, source + '\n']) {
      expect(() => parseSetupPublisherInventoryDocument(value)).toThrow(SetupPublisherInventoryError);
    }
    for (const value of [NaN, Infinity, 1.1, Number.MAX_SAFE_INTEGER + 1, undefined, BigInt(1), new Date(), '\ud800', '\udc00']) {
      expect(() => canonicalPublisherInventoryJson({ value })).toThrow(SetupPublisherInventoryError);
    }
    const a = canonicalPublisherInventoryJson({ z: null, a: [true, false, 0, 'valid😀'] });
    expect(a).toBe('{\n  "a": [\n    true,\n    false,\n    0,\n    "valid😀"\n  ],\n  "z": null\n}\n');
    expect(() => canonicalPublisherInventoryJson({ ['\ud800']: 'bad' })).toThrow();
    const d = copy(f.document); d.units[0].behavior = '\ud800';
    expect(() => parseSetupPublisherInventoryDocument(JSON.stringify(d))).toThrow();
  });
  it('publisher-inventory-C06: rejects complete over-limit inputs rather than clipping their records', () => {
    const f = fixture();
    expect(() => parseSetupPublisherInventoryDocument(' '.repeat(1_048_577))).toThrow();
    for (const [key, count] of [['workflows', 129], ['units', 2049], ['edges', 8193], ['inputs', 1025]] as const) {
      const d = copy(f.document); Object.assign(d, { [key]: Array(count).fill(d.workflows[0]) });
      expect(() => parseSetupPublisherInventoryDocument(canonicalPublisherInventoryJson(d))).toThrow();
    }
    const d = copy(f.document); d.units[0].behavior = 'x'.repeat(2048);
    expect(parseSetupPublisherInventoryDocument(canonicalPublisherInventoryJson(d)).units[0].behavior).toHaveLength(2048);
    d.units[0].behavior += 'x'; expect(() => parseSetupPublisherInventoryDocument(canonicalPublisherInventoryJson(d))).toThrow();
    let deep: unknown = 0; for (let i = 0; i < 17; i++) deep = [deep];
    expect(() => canonicalPublisherInventoryJson(deep)).toThrow();
  });
  it('publisher-inventory-C07: rejects destination, source and contract drift despite internally matching hashes', () => {
    const f = fixture(), observed = { destination: f.document.destination, publisher: f.document.publisher, workflows: [f.file] };
    expect(() => assertSetupPublisherInventoryBindings(f.document, observed)).not.toThrow();
    for (const changed of [ { ...observed, destination: { ...observed.destination, repositoryId: 43 } },
      { ...observed, publisher: { ...observed.publisher, commit: '9'.repeat(40) } },
      { ...observed, publisher: { ...observed.publisher, contractSha256: '0'.repeat(64) } }, { ...observed, workflows: [] } ]) {
      expect(() => assertSetupPublisherInventoryBindings(f.document, changed)).toThrow('binding-mismatch');
    }
    const d = copy(f.document); d.workflows[0].contentSha256 = '0'.repeat(64);
    expect(() => assertSetupPublisherInventoryBindings(d, observed)).toThrow('binding-mismatch');
    expect(() => decideSetupPublisherInventoryReview(d, f.locator, f.authority)).toThrow('binding-mismatch');
  });
  it('publisher-inventory-C08: rejects unsafe paths, case aliases, nonregular modes and invalid Git blob identities', () => {
    const f = fixture();
    for (const value of ['../outside.yml', '.github/workflows/../outside.yml', '/absolute.yml', '.github\\workflows\\ci.yml',
      '.github/workflows/nested/ci.yml', '.github/workflows/.git/ci.yml', '.github/workflows/ci\0.yml']) {
      const d = copy(f.document); d.workflows[0].path = value;
      expect(() => parseSetupPublisherInventoryDocument(canonicalPublisherInventoryJson(d))).toThrow();
    }
    for (const value of ['120000', '040000', 100644, null]) {
      const d = copy(f.document); Object.assign(d.units[0], { mode: value });
      expect(() => parseSetupPublisherInventoryDocument(canonicalPublisherInventoryJson(d))).toThrow();
    }
    const duplicate = copy(f.document); duplicate.workflows.unshift({ ...duplicate.workflows[0], path: '.github/workflows/CI.yml' });
    expect(() => parseSetupPublisherInventoryDocument(canonicalPublisherInventoryJson(duplicate))).toThrow();
    const bad = copy(f.document); bad.units[0].blob = 'bad'; expect(() => parseSetupPublisherInventoryDocument(canonicalPublisherInventoryJson(bad))).toThrow();
  });
  it('publisher-inventory-C09: rejects duplicate graph/input identities and dangling entrypoints or dependency edges', () => {
    const f = fixture();
    const mutations: ((d: Mutable<SetupPublisherInventoryDocument>) => void)[] = [
      d => d.units.push(copy(d.units[0])), d => d.units.reverse(), d => d.edges.push(copy(d.edges[0])),
      d => { d.edges[0].to = 'unread-program'; }, d => { d.workflows[0].entryUnits = []; },
      d => { d.workflows[0].entryUnits = ['missing']; }, d => { d.workflows[0].entryUnits = ['workflow-ci', 'workflow-ci']; },
    ];
    for (const mutate of mutations) { const d = copy(f.document); mutate(d); expect(() => parseSetupPublisherInventoryDocument(canonicalPublisherInventoryJson(d))).toThrow(); }
    const input = { id: 'input-a', workflow: f.file.path, job: 'inspect', step: 1, input: 'env:MODE', origin: 'literal' as const, sourceFingerprint: '0'.repeat(64) };
    const valid = copy(f.document); valid.inputs = [input]; expect(parseSetupPublisherInventoryDocument(canonicalPublisherInventoryJson(valid)).inputs).toHaveLength(1);
    valid.inputs.push({ ...input, id: 'input-b' }); expect(() => parseSetupPublisherInventoryDocument(canonicalPublisherInventoryJson(valid))).toThrow();
    for (const bad of [{ ...input, workflow: '.github/workflows/missing.yml' }, { ...input, step: -1 }, { ...input, job: '', step: 1 },
      { ...input, sourceFingerprint: 'bad' }, { ...input, input: '' }, { ...input, origin: 'secret-value' }]) {
      const d = copy(f.document); Object.assign(d, { inputs: [bad] }); expect(() => parseSetupPublisherInventoryDocument(canonicalPublisherInventoryJson(d))).toThrow();
    }
  });
  it('publisher-inventory-C10: rejects other-purpose documents and approvals instead of reusing their identity', () => {
    const f = fixture(), d = copy(f.document); Object.assign(d, { kind: 'setup-installation-receipt' });
    expect(() => parseSetupPublisherInventoryDocument(canonicalPublisherInventoryJson(d))).toThrow();
    f.review.body = f.review.body.replace('bugbot-publisher-inventory-review', 'ordinary-source-review');
    expect(() => decideSetupPublisherInventoryReview(f.document, f.locator, f.authority)).toThrow('review-required');
  });
});

describe('publisher inventory independent current review authority', () => {
  it('rejects corrupted, duplicate or contradictory read-port facts at the immutable planning boundary', () => {
    const f = fixture(), files = f.inspection.installation.workflows;
    for (const mutate of [
      (fact: Mutable<SetupPublisherInventoryReviewFact>) => fact.approvals.push({ ...fact.approvals[0], actorId: 18, actorLogin: 'second' }),
      (fact: Mutable<SetupPublisherInventoryReviewFact>) => fact.approvals.push({ ...fact.approvals[0], reviewId: 102 }),
      (fact: Mutable<SetupPublisherInventoryReviewFact>) => fact.approvals.push({ ...fact.approvals[0], reviewId: 102, actorId: 18, actorLogin: 'REVIEWER' }),
    ]) {
      const fact = copy(f.fact); mutate(fact);
      expect(() => setupPublisherInventoryFactForPlan(f.locator, fact, files)).toThrow('review-required');
    }
    for (const changed of [{ path: '../foreign.yml' }, { mode: '120000' }, { content: null }]) {
      expect(() => setupPublisherInventoryFactForPlan(f.locator, f.fact,
        [{ ...files[0], ...changed }] as typeof files)).toThrow('invalid-document');
    }
    expect(() => setupPublisherInventoryFactForPlan(f.locator, f.fact, [{ ...files[0], content: files[0].content + '# drift\n' }]))
      .toThrow('binding-mismatch');
    for (const changed of [{ path: '.github/workflows/other.yml' }, { disposition: 'unsupported' }, { extra: true }]) {
      const fact = copy(f.fact); Object.assign(fact.workflows[0], changed);
      expect(() => setupPublisherInventoryFactForPlan(f.locator, fact, files)).toThrow('invalid-document');
    }
    for (const disposition of ['incompatible', 'unresolved'] as const) {
      const fact = copy(f.fact); fact.workflows[0].disposition = disposition;
      expect(() => setupPublisherInventoryFactForPlan(f.locator, fact, files))
        .toThrow(disposition === 'incompatible' ? 'incompatible-producer' : 'unresolved-closure');
    }
  });
  it('publisher-inventory-C11: accepts only the exact current purpose statement and returns immutable stable facts', () => {
    const f = fixture(), result = decideSetupPublisherInventoryReview(f.document, f.locator, f.authority);
    expect(result.approvals).toEqual([{ reviewId: 101, actorId: 17, actorLogin: 'reviewer' }]);
    expect(Object.isFrozen(result.approvals[0])).toBe(true); expect(result.decisionsSha256).toMatch(/^[a-f0-9]{64}$/u);
    f.review.submittedAt = '2026-11-28T00:00:00.1Z';
    expect(decideSetupPublisherInventoryReview(f.document, f.locator, f.authority).approvals).toHaveLength(1);
  });
  it('publisher-inventory-C12: generic, malformed, duplicated or mismatching review statements confer no authority', () => {
    const f = fixture(), original = f.review.body;
    const bad = ['', 'Approved', original + original, original.replace('compatible', 'incompatible'),
      original.replace('"decision":"compatible"', '"decision":"wrong","decision":"compatible"'),
      original.replace('"decision":"compatible"', '"unknown":"value","decision":"compatible"'),
      original.replace(JSON.stringify(f.statement), '{broken'), original.replace(f.locator.documentSha256, '0'.repeat(64)),
      original.replace(JSON.stringify(f.statement), JSON.stringify(f.statement).slice(0, -1)),
      original.replace('<!-- /copilot:publisher-inventory-review:v1 -->', ''),
      '<!-- /copilot:publisher-inventory-review:v1 -->' + original.split('<!-- /copilot:publisher-inventory-review:v1 -->')[0]];
    for (const body of bad) { f.review.body = body; expect(() => decideSetupPublisherInventoryReview(f.document, f.locator, f.authority)).toThrow('review-required'); }
  });
  it('publisher-inventory-C14: approval of a different evidence head is not the current approval', () => {
    const f = fixture(); f.review.commit = '0'.repeat(40);
    expect(() => decideSetupPublisherInventoryReview(f.document, f.locator, f.authority)).toThrow('review-required');
  });
  it('publisher-inventory-C15: a provider Bot cannot supply independent maintainer approval', () => {
    const f = fixture(); f.review.actorType = 'Bot';
    expect(() => decideSetupPublisherInventoryReview(f.document, f.locator, f.authority)).toThrow('review-required');
  });
  it('publisher-inventory-C16: evidence authors and identified preparing actors cannot review their own evidence', () => {
    const f = fixture(); f.authority.authorId = 17;
    expect(() => decideSetupPublisherInventoryReview(f.document, f.locator, f.authority)).toThrow('review-required');
    f.authority.authorId = 9; f.authority.preparingActorIds.push(17);
    expect(() => decideSetupPublisherInventoryReview(f.document, f.locator, f.authority)).toThrow('review-required');
  });
  it('publisher-inventory-C17: known read-only roles cannot approve and missing permission facts stay unresolved', () => {
    const f = fixture();
    for (const permission of ['read', 'none'] as const) { f.authority.reviewers[0].permission = permission; expect(() => decideSetupPublisherInventoryReview(f.document, f.locator, f.authority)).toThrow('review-required'); }
    f.authority.reviewers[0].permission = 'unavailable';
    expect(() => decideSetupPublisherInventoryReview(f.document, f.locator, f.authority)).toThrow('review-unavailable');
    f.authority.reviewers = []; expect(() => decideSetupPublisherInventoryReview(f.document, f.locator, f.authority)).toThrow('review-unavailable');
  });
  it('publisher-inventory-C18: mismatching identity, incomplete or malformed provider observations remain unverified', () => {
    const f = fixture(); f.authority.reviewers[0].login = 'other-reviewer';
    expect(() => decideSetupPublisherInventoryReview(f.document, f.locator, f.authority)).toThrow('review-unavailable');
    const mutations: ((a: Mutable<SetupPublisherInventoryReviewAuthority>) => void)[] = [
      a => { a.complete = false; }, a => { a.authorId = 0; }, a => { a.preparingActorIds = [0]; }, a => { a.preparingActorIds = [9, 9]; },
      a => a.reviewers.push(copy(a.reviewers[0])), a => { a.reviews[0].actorLogin = ''; },
      a => { a.reviews[0].submittedAt = '2026-02-31T00:00:00Z'; }, a => { a.reviews[0].submittedAt = null; },
      a => { a.reviews[0].commit = 'bad'; }, a => { a.reviews[0].body = 'x'.repeat(65_537); },
      a => a.reviews.push(copy(a.reviews[0])),
      a => a.reviews.push({ ...a.reviews[0], id: 102, actorLogin: 'different' }),
    ];
    for (const mutate of mutations) { const good = fixture(), a = copy(good.authority); mutate(a); expect(() => decideSetupPublisherInventoryReview(good.document, good.locator, a)).toThrow('review-unavailable'); }
  });
  it('publisher-inventory-C20: dismissing the latest decision never revives an older approval', () => {
    const f = fixture(); f.authority.reviews.push({ ...f.review, id: 102, state: 'DISMISSED', submittedAt: '2026-11-28T00:01:00Z' });
    expect(() => decideSetupPublisherInventoryReview(f.document, f.locator, f.authority)).toThrow('review-required');
  });
  it('publisher-inventory-C21: a later generic approval supersedes purpose approval while comments and pending reviews do not', () => {
    const f = fixture(), original = decideSetupPublisherInventoryReview(f.document, f.locator, f.authority);
    f.authority.reviews.push({ ...f.review, id: 102, state: 'COMMENTED', body: 'Thanks', submittedAt: '2026-11-28T00:01:00Z' },
      { ...f.review, id: 103, state: 'PENDING', submittedAt: null });
    expect(decideSetupPublisherInventoryReview(f.document, f.locator, f.authority)).toEqual(original);
    f.authority.reviews.push({ ...f.review, id: 104, state: 'APPROVED', body: 'Looks good', submittedAt: '2026-11-28T00:02:00Z' });
    expect(() => decideSetupPublisherInventoryReview(f.document, f.locator, f.authority)).toThrow('review-required');
    const tied = fixture();
    // Provider order is not decision order: numeric IDs break equal-time ties,
    // and an older record arriving last cannot revive the former approval.
    tied.authority.reviews.unshift({ ...tied.review, id: 102, body: 'Generic later decision' });
    expect(() => decideSetupPublisherInventoryReview(tied.document, tied.locator, tied.authority)).toThrow('review-required');
    tied.authority.reviews.push({ ...tied.review, id: 103 });
    expect(decideSetupPublisherInventoryReview(tied.document, tied.locator, tied.authority).approvals[0].reviewId).toBe(103);
    tied.authority.reviews.push({ ...tied.review, id: 104, submittedAt: '2026-11-27T23:59:59Z' });
    expect(decideSetupPublisherInventoryReview(tied.document, tied.locator, tied.authority).approvals[0].reviewId).toBe(103);
  });
  it('publisher-inventory-C22: qualified changes-requested decisions block until superseded or dismissed', () => {
    const f = fixture(); f.authority.reviewers.push({ id: 18, login: 'second-reviewer', permission: 'admin' });
    const block = { ...f.review, id: 102, actorId: 18, actorLogin: 'second-reviewer', state: 'CHANGES_REQUESTED' as const,
      commit: '0'.repeat(40), submittedAt: '2026-11-28T00:01:00Z' };
    f.authority.reviews.unshift(block);
    expect(() => decideSetupPublisherInventoryReview(f.document, f.locator, f.authority)).toThrow('changes-requested');
    f.authority.reviews.push({ ...block, id: 103, state: 'DISMISSED', submittedAt: '2026-11-28T00:02:00Z' });
    expect(decideSetupPublisherInventoryReview(f.document, f.locator, f.authority).approvals).toHaveLength(1);
    f.authority.reviews.push({ ...f.review, id: 104, actorId: 18, actorLogin: 'second-reviewer', submittedAt: '2026-11-28T00:03:00Z' });
    expect(decideSetupPublisherInventoryReview(f.document, f.locator, f.authority).approvals).toHaveLength(2);
  });
});
