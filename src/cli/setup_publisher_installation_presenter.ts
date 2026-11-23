import { createHash } from 'node:crypto';
import type { SetupPublisherOperation, SetupPublisherPlan } from '../domain/setup_publisher_installation';
import type { SetupPublisherMessageCatalog } from '../application/policies/setup_publisher_message_catalog';

/** Preserve displayed data while preventing cursor, bidi and invisible-control execution. */
export function setupPublisherInertText(text: string): string {
  return text.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, character => character === '\n' ? '\n'
    : character === '\r' ? '\\r' : character === '\t' ? '\\t' : `\\u{${character.codePointAt(0)!.toString(16)}}`);
}

export class SetupPublisherInstallationPresenter {
  constructor(private readonly catalog: SetupPublisherMessageCatalog, private readonly write: (text: string) => void) {}
  private line(text: string): void { this.write(setupPublisherInertText(text) + '\n'); }

  preview(plan: SetupPublisherPlan, retained?: SetupPublisherOperation, recordLocation?: string): void {
    const repository = `${plan.target.owner}/${plan.target.name}`;
    this.line(this.catalog.message('title', { repository }));
    this.line(this.catalog.message(plan.status === 'unchanged' ? 'unchanged' : 'preview'));
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

  operation(operation: SetupPublisherOperation, journalUnconfirmed = false, recordLocation?: string): void {
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
    this.line(this.catalog.message('recovery'));
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
