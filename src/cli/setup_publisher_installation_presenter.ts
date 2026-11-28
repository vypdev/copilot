import { createHash } from 'node:crypto';
import type { SetupPublisherOperation, SetupPublisherPlan } from '../domain/setup_publisher_installation';
import type { SetupPublisherMessageCatalog } from '../application/policies/setup_publisher_message_catalog';
import type { SetupPublisherBlockedReview } from '../application/ports/setup_publisher_review_ports';

/** Preserve displayed data while preventing cursor, bidi and invisible-control execution. */
export function setupPublisherInertText(text: string): string {
  return text.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, character => character === '\n' ? '\n'
    : character === '\r' ? '\\r' : character === '\t' ? '\\t' : `\\u{${character.codePointAt(0)!.toString(16)}}`);
}

export class SetupPublisherInstallationPresenter {
  constructor(private readonly catalog: SetupPublisherMessageCatalog, private readonly write: (text: string) => void,
    private readonly width = 80) {}
  private line(text: string): void { this.write(setupPublisherInertText(text) + '\n'); }
  private wrapped(text: string): void {
    const width = Number.isSafeInteger(this.width) ? Math.max(40, Math.min(240, this.width)) : 80;
    let line = '';
    for (const word of text.split(/\s+/u)) {
      if (line && Array.from(line + ' ' + word).length > width) { this.line(line); line = word; }
      else line = line ? line + ' ' + word : word;
    }
    if (line) this.line(line);
  }

  preview(plan: SetupPublisherPlan, retained?: SetupPublisherOperation, recordLocation?: string): void {
    const repository = `${plan.target.owner}/${plan.target.name}`;
    this.line(this.catalog.message('title', { repository }));
    this.line(this.catalog.message(plan.status === 'unchanged' ? 'unchanged' : 'preview'));
    if (plan.inventoryReview) {
      this.line(this.catalog.message('inventoryReview', { count: String(plan.inventoryReview.workflows.length) }));
      this.line(this.catalog.message('inventoryEvidence', { url: `https://github.com/${repository}/pull/${plan.inventoryReview.pullRequest}`,
        head: plan.inventoryReview.head }));
      this.line(this.catalog.message(plan.status === 'unchanged' ? 'inventoryUnchanged' : 'inventorySeparate'));
    }
    if (plan.status === 'review') this.line(this.catalog.message('effects'));
    if (retained) this.operation(retained, false, recordLocation);
    this.line(this.catalog.message('operation', { id: plan.operationId }));
    this.line(this.catalog.message('target', { repository, branch: plan.target.defaultBranch, head: plan.target.baseSha }));
    this.line(this.catalog.message('source', { commit: plan.sourceCommit }));
    this.line(this.catalog.message('actor', { id: String(plan.actorId) }));
    this.line(this.catalog.message('digest', { digest: plan.digest }));
    for (const file of plan.files) {
      this.line(this.catalog.message('file', { path: file.path, bytes: String(Buffer.byteLength(file.content!, 'utf8')),
        hash: createHash('sha256').update(file.content!).digest('hex') }));
      // Every data line has its own inert prefix; data cannot imitate a prompt.
      for (const line of file.content!.split('\n')) this.write('  | ' + setupPublisherInertText(line) + '\n');
    }
    this.line(this.catalog.message('nativePending')); this.line(this.catalog.message('production'));
  }

  inventoryBlocked(view: SetupPublisherBlockedReview, retained?: SetupPublisherOperation, recordLocation?: string): void {
    this.wrapped(this.catalog.message('inventoryBlocked'));
    const messages = { 'invalid-document': 'inventoryInvalid', 'binding-mismatch': 'inventoryStale', 'review-unavailable': 'inventoryUnavailable',
      'review-required': 'inventoryRequired', 'changes-requested': 'inventoryChangesRequested', 'incompatible-producer': 'inventoryIncompatible',
      'unresolved-closure': 'inventoryUnresolved' } as const;
    const message = Object.prototype.hasOwnProperty.call(messages, view.reason) ? messages[view.reason] : 'inventoryUnavailable';
    this.wrapped(this.catalog.message(message));
    if (retained) this.operation(retained, false, recordLocation, false);
    else if (typeof view.operationId === 'string' && /^[a-f0-9-]{36}$/iu.test(view.operationId)) this.wrapped(this.catalog.message('operation', { id: view.operationId }));
    if (typeof view.repository === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/u.test(view.repository)
      && view.evidence && typeof view.evidence === 'object' && Number.isSafeInteger(view.evidence.pullRequest) && view.evidence.pullRequest > 0
      && typeof view.evidence.head === 'string' && /^[a-f0-9]{40}$/u.test(view.evidence.head)) {
      this.wrapped(this.catalog.message('inventorySelectedEvidence', { url: `https://github.com/${view.repository}/pull/${view.evidence.pullRequest}`,
        head: view.evidence.head }));
    }
    this.wrapped(this.catalog.message('inventoryNoAuthority'));
  }

  operation(operation: SetupPublisherOperation, journalUnconfirmed = false, recordLocation?: string, showRecovery = true): void {
    this.line(this.catalog.message('operation', { id: operation.operationId }));
    const location = this.localRecordLocation(recordLocation, operation.operationId);
    if (location) this.line(this.catalog.message('operationRecord', { url: location }));
    if (operation.pullRequestNumber) this.line(this.catalog.message('knownPullRequest',
      { url: `https://github.com/${operation.repository}/pull/${operation.pullRequestNumber}` }));
    this.line(operation.effects.length ? this.catalog.message('retained', {
      effects: operation.effects.map(effect => this.catalog.message(`effect.${effect}`)).join(', '),
    }) : this.catalog.message('noEffects'));
    if (operation.preparedTree) this.line(this.catalog.message('object', { effect: this.catalog.message('effect.tree'), sha: operation.preparedTree }));
    if (operation.preparedCommit) this.line(this.catalog.message('object', { effect: this.catalog.message('effect.commit'), sha: operation.preparedCommit }));
    if (operation.uncertain) this.line(this.catalog.message('uncertain', { effect: this.catalog.message(`effect.${operation.uncertain}`) }));
    if (journalUnconfirmed) this.line(this.catalog.message('journalUnconfirmed'));
    if (showRecovery) this.line(this.catalog.message('recovery'));
  }

  delivered(operation: SetupPublisherOperation, recordLocation?: string): void {
    this.operation(operation, false, recordLocation);
    this.line(this.catalog.message('waitingMerge', {
      url: `https://github.com/${operation.repository}/pull/${operation.pullRequestNumber!}`,
    }));
    this.line(this.catalog.message('nextMerge'));
    this.line(this.catalog.message('nativePending')); this.line(this.catalog.message('production'));
  }

  private localRecordLocation(value: string | undefined, operationId: string): string | undefined {
    if (!value || /[\p{Cc}\p{Cf}]/u.test(value)) return undefined;
    try {
      const url = new URL(value);
      return url.protocol === 'file:' && !url.host && !url.search && !url.hash
        && url.pathname.endsWith(`/${operationId}.json`) ? url.href : undefined;
    } catch { return undefined; }
  }
}
