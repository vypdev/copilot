import { createHash } from 'node:crypto';
import { inspectIssueEvent, recordIssueEvent } from '../issue_event_admission_workflow';
import { coalescibleIssueReconciliation, issueReconciliationIdentity, issueAdmissionReceiptName, issueEventAdmissionSummary } from '../../../policies/issue_event_admission_policy';
import type { IssueAdmissionSnapshot, IssueEventAdmissionContext } from '../../../ports/issue_event_admission_ports';

const context: IssueEventAdmissionContext = { owner: 'org', repository: 'repo', eventName: 'issues', action: 'labeled', actor: 'maintainer',
    issueNumber: 21, runId: 200, workflowRevision: 'a'.repeat(40), runtimeRevision: 'b'.repeat(64), configuration: '{}', deployLabel: 'ship', releaseLabel: 'release', hotfixLabel: 'hotfix', changedLabel: 'bug' };
const issue: IssueAdmissionSnapshot = { id: 99, number: 21, title: 'A bug', body: 'Native form', state: 'open', updatedAt: '2026-10-28T00:00:00Z',
    author: 'author', labels: ['bug', 'bugfix'], assignees: ['maintainer'], milestone: null, issueType: 'Bug', locked: false };
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function fixture() { return { authenticatedLogin: jest.fn().mockResolvedValue('product'), readIssue: jest.fn().mockResolvedValue(issue), hasSuccessfulReceipt: jest.fn().mockResolvedValue(false) }; }

describe('native issue event admission', () => {
    it('filters real product-account metadata even without a configured bot variable', async () => {
        const p = fixture(); p.authenticatedLogin.mockResolvedValue('MAINTAINER');
        expect(await inspectIssueEvent(context, p, digest)).toEqual({ execute: false, reason: 'self-event' });
        expect(p.readIssue).not.toHaveBeenCalled(); expect(p.hasSuccessfulReceipt).not.toHaveBeenCalled();
    });
    it('preserves bot-authored native closure cleanup', async () => {
        const p = fixture(); p.authenticatedLogin.mockResolvedValue('maintainer');
        expect(await inspectIssueEvent({ ...context, action: 'closed' }, p, digest)).toEqual({ execute: true, reason: 'lifecycle-event' });
    });
    it.each(['opened', 'reopened', 'closed', 'edited', 'assigned', 'unassigned'])('never coalesces substantive %s intent', async action => {
        const p = fixture(); expect((await inspectIssueEvent({ ...context, action }, p, digest)).execute).toBe(true);
        expect(p.hasSuccessfulReceipt).not.toHaveBeenCalled();
    });
    it.each([
        ['start addition', { changedLabel: 'in-progress' }, {}], ['start removal', { action: 'unlabeled', changedLabel: 'in-progress' }, {}],
        ['custom deployment', { changedLabel: 'ship' }, {}], ['empty changed label', { changedLabel: '' }, {}],
        ['already started', {}, { labels: ['bug', 'in-progress'] }], ['release', {}, { labels: ['release'] }],
        ['hotfix', {}, { labels: ['hotfix'] }], ['closed issue', {}, { state: 'closed' }],
    ])('retains the full pipeline for %s', async (_name, patch, native) => {
        const p = fixture(); p.readIssue.mockResolvedValue({ ...issue, ...native });
        expect((await inspectIssueEvent({ ...context, ...patch }, p, digest)).execute).toBe(true);
        expect(p.hasSuccessfulReceipt).not.toHaveBeenCalled();
    });
    it('emits an opaque candidate and reuses only proven successful evidence', async () => {
        const p = fixture(); const first = await inspectIssueEvent(context, p, digest);
        expect(first).toMatchObject({ execute: true, reason: 'reconciliation-needed', receiptKey: expect.stringMatching(/^[a-f0-9]{64}$/) });
        expect(p.hasSuccessfulReceipt).toHaveBeenCalledWith(issueAdmissionReceiptName(21, first.receiptKey!), context);
        p.hasSuccessfulReceipt.mockResolvedValue(true);
        expect(await inspectIssueEvent(context, p, digest)).toEqual({ ...first, execute: false, reason: 'already-reconciled' });
    });
    it('falls back to the guarded full pipeline when optional evidence is unavailable', async () => {
        const p = fixture(); p.hasSuccessfulReceipt.mockRejectedValue(new Error('PRIVATE_PROVIDER_RESPONSE'));
        expect(await inspectIssueEvent(context, p, digest)).toMatchObject({ execute: true, reason: 'reconciliation-needed' });
    });
    it('does not trust a missing product identity', async () => {
        const p = fixture(); p.authenticatedLogin.mockResolvedValue(' ');
        await expect(inspectIssueEvent(context, p, digest)).rejects.toMatchObject({ code: 'authorization.credential-invalid' });
    });
    it.each([{ eventName: 'push' }, { action: 'unknown' }, { owner: '../org' }, { repository: '' }, { actor: '' },
        { issueNumber: 0 }, { issueNumber: 1.1 }, { runId: 0 }, { workflowRevision: 'main' }, { runtimeRevision: '' }])(
        'blocks malformed native admission identity %j', async patch => {
            await expect(inspectIssueEvent({ ...context, ...patch }, fixture(), digest)).rejects.toMatchObject({ code: 'configuration.invalid' });
        });
    it('accepts native bot login syntax for a distinct service actor and the exact configuration limit', async () => {
        expect((await inspectIssueEvent({ ...context, actor: 'github-actions[bot]', configuration: 'é'.repeat(524288) }, fixture(), digest)).execute).toBe(true);
    });
    it.each([
        { owner: 'elsewhere' }, { repository: 'other' }, { actor: 'other' }, { workflowRevision: 'c'.repeat(40) },
        { runtimeRevision: 'c'.repeat(64) }, { configuration: '{"mode":"new"}' }, { deployLabel: 'deploy' }, { releaseLabel: 'ship-release' }, { hotfixLabel: 'urgent' },
    ])('invalidates evidence when execution meaning changes %j', patch => {
        expect(issueReconciliationIdentity({ ...context, ...patch }, issue, 'product')).not.toBe(issueReconciliationIdentity(context, issue, 'product'));
    });
    it.each([
        { id: 100 }, { title: 'Edited' }, { body: 'Edited body' }, { updatedAt: '2026-10-28T00:00:01Z' }, { author: 'other' },
        { labels: ['chore'] }, { assignees: ['other'] }, { milestone: 9 }, { issueType: 'Maintenance' }, { locked: true },
    ])('invalidates evidence for changed native state %j', patch => {
        expect(issueReconciliationIdentity(context, { ...issue, ...patch }, 'product')).not.toBe(issueReconciliationIdentity(context, issue, 'product'));
    });
    it('canonicalizes set ordering and login case, while binding the product account', () => {
        const original = issueReconciliationIdentity(context, { ...issue, assignees: ['a', 'b'] }, 'Product');
        expect(issueReconciliationIdentity({ ...context, actor: 'MAINTAINER' }, { ...issue, labels: ['bugfix', 'bug'], assignees: ['b', 'a'] }, 'product')).toBe(original);
        expect(issueReconciliationIdentity(context, { ...issue, assignees: ['a', 'b'] }, 'other-product')).not.toBe(original);
    });
    it('records only an unchanged candidate after a successful guarded execution', async () => {
        const p = fixture(); const before = (await inspectIssueEvent(context, p, digest)).receiptKey!;
        expect(await recordIssueEvent(context, before, p, digest)).toBe(issueAdmissionReceiptName(21, before));
        p.readIssue.mockResolvedValue({ ...issue, updatedAt: '2026-10-28T00:00:01Z' });
        expect(await recordIssueEvent(context, before, p, digest)).toBeUndefined();
    });
    it.each(['', 'PRIVATE', 'a'.repeat(63), 'A'.repeat(64)])('never records a malformed or injected key %s', async key => {
        const p = fixture(); expect(await recordIssueEvent(context, key, p, digest)).toBeUndefined(); expect(p.readIssue).not.toHaveBeenCalled();
    });
    it('does not record an in-progress transition, a changed product account, or a self event', async () => {
        const p = fixture(); const before = (await inspectIssueEvent(context, p, digest)).receiptKey!;
        p.readIssue.mockResolvedValue({ ...issue, labels: ['in-progress'] });
        expect(await recordIssueEvent(context, before, p, digest)).toBeUndefined();
        p.readIssue.mockResolvedValue(issue); p.authenticatedLogin.mockResolvedValue('other-product');
        expect(await recordIssueEvent(context, before, p, digest)).toBeUndefined();
        p.authenticatedLogin.mockResolvedValue('maintainer'); expect(await recordIssueEvent(context, before, p, digest)).toBeUndefined();
        p.authenticatedLogin.mockResolvedValue(''); expect(await recordIssueEvent(context, before, p, digest)).toBeUndefined();
    });
    it('reduces stable initial routing duplicates, retaining opened/start/reopen and a distinct issue', async () => {
        const p = fixture(); const receipts = new Set<string>(); let heavy = 0;
        p.hasSuccessfulReceipt.mockImplementation(async name => receipts.has(name));
        for (const event of [
            { action: 'opened' }, { action: 'labeled', changedLabel: 'bug' }, { action: 'labeled', changedLabel: 'bugfix' },
            { action: 'labeled', changedLabel: 'priority: high' }, { action: 'labeled', changedLabel: 'in-progress' }, { action: 'reopened' },
            { action: 'labeled', issueNumber: 22 },
        ]) {
            const next = { ...context, ...event }; p.readIssue.mockResolvedValue({ ...issue, number: next.issueNumber });
            const decision = await inspectIssueEvent(next, p, digest);
            if (decision.execute) { heavy++; if (decision.receiptKey) { const receipt = await recordIssueEvent(next, decision.receiptKey, p, digest); if (receipt) receipts.add(receipt); } }
        }
        expect(heavy).toBe(5); // Seven full allocations before; no substantive event was replaced.
        expect(coalescibleIssueReconciliation({ ...context, action: 'unlabeled' }, issue)).toBe(true);
    });
});


it.each(['self-event', 'lifecycle-event', 'reconciliation-needed', 'already-reconciled'] as const)('renders bounded English and regional Spanish operator state %s', reason => {
  const decision = { execute: reason === 'lifecycle-event' || reason === 'reconciliation-needed', reason };
  expect(issueEventAdmissionSummary(decision, 'en-US')).toContain('No action is required');
  expect(issueEventAdmissionSummary(decision, 'es-MX')).toContain('No se requiere intervención');
  expect(issueEventAdmissionSummary(decision, 'fr-FR')).toBe(issueEventAdmissionSummary(decision, 'en-US'));
});


it('bounds the Variables snapshot without logging its content', async () => {
  await expect(inspectIssueEvent({ ...context, configuration: 'é'.repeat(524289) }, fixture(), digest)).rejects.toMatchObject({ code: 'configuration.invalid' });
});
it('retains full authoritative runtime checks when the optional native state projection is unavailable', async () => {
  const p = fixture(); p.readIssue.mockRejectedValue(new Error('PRIVATE_BODY'));
  expect(await inspectIssueEvent(context, p, digest)).toEqual({ execute: true, reason: 'reconciliation-needed' });
  expect(p.hasSuccessfulReceipt).not.toHaveBeenCalled();
});


it.each(['release', 'hotfix'])('preserves configured %s label aliases instead of treating them as ordinary backlog metadata', async kind => {
  const p = fixture(); p.readIssue.mockResolvedValue({ ...issue, labels: ['custom-kind'] });
  const configured = { ...context, [kind + 'Label']: 'custom-kind' };
  expect(await inspectIssueEvent(configured, p, digest)).toEqual({ execute: true, reason: 'lifecycle-event' });
  expect(p.hasSuccessfulReceipt).not.toHaveBeenCalled();
});


it.each([
  [{ changedLabel: 'IN-PROGRESS' }, {}], [{ changedLabel: 'SHIP' }, {}], [{}, { labels: ['IN-PROGRESS'] }],
  [{ releaseLabel: 'Ship-Release' }, { labels: ['SHIP-RELEASE'] }], [{ hotfixLabel: 'Emergency' }, { labels: ['EMERGENCY'] }],
])('never coalesces reserved label case variants %j', async (configured, state) => {
  const p = fixture(); p.readIssue.mockResolvedValue({ ...issue, ...state });
  expect((await inspectIssueEvent({ ...context, ...configured }, p, digest)).execute).toBe(true);
  expect(p.hasSuccessfulReceipt).not.toHaveBeenCalled();
});
