import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { SetupJourneyView } from '../application/policies/setup_journey_policy';
import type { SetupPlan } from '../domain/setup';
import type { SetupTokenPermissionReport, SetupTokenPermissionRequirement, SetupTokenRole } from '../domain/setup_token_permissions';
import type { WebSetupPlan, WebSetupPrompt, WebSetupView } from '../application/contracts/web_setup_view';

/** A one-run, in-memory handoff. Values submitted by the browser are never part of a view. */
export class WebSetupBridge {
  private revision = 0;
  private view: WebSetupView;
  private pending?: { revision: number; resolve: (value: string | undefined) => void };
  private subscribers = new Set<(view: WebSetupView) => void>();
  private controller?: string;
  private lastAnsweredRevision?: number;

  constructor(repository: string) {
    this.view = { revision: 0, repository };
  }

  snapshot(): WebSetupView { return this.view; }
  setRepository(repository: string): void { this.publish({ repository }); }

  subscribe(listener: (view: WebSetupView) => void): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  bootstrap(): { controller: boolean; capability?: string } {
    if (!this.controller) this.controller = randomBytes(32).toString('hex');
    // A second tab starts read-only. Its explicit takeover rotates the controller capability.
    const first = !this.bootstrapped;
    this.bootstrapped = true;
    return { controller: first, ...(first ? { capability: this.controller } : {}) };
  }

  private bootstrapped = false;

  takeOver(): string {
    this.controller = randomBytes(32).toString('hex');
    this.publish({ message: { tone: 'info', text: 'Control moved to this tab. The previous tab is now read-only.' } });
    return this.controller;
  }

  isController(capability: string): boolean {
    return Boolean(this.controller && sameCapability(capability, this.controller));
  }

  async ask(prompt: WebSetupPrompt): Promise<string | undefined> {
    if (this.pending || this.view.outcome) throw new Error('A setup decision is already pending or the session has ended.');
    const revision = this.revision + 1;
    this.publish({ prompt, promptRevision: revision });
    return new Promise(resolve => { this.pending = { revision, resolve }; });
  }

  answer(revision: number, value: string): boolean {
    if (!this.pending || this.pending.revision !== revision || this.view.outcome) return false;
    const prompt = this.view.prompt;
    if (prompt && (prompt.kind === 'choice' || prompt.kind === 'confirm') && !prompt.choices.includes(value)) return false;
    const pending = this.pending;
    this.pending = undefined;
    this.lastAnsweredRevision = revision;
    this.publish({ prompt: undefined, promptRevision: undefined });
    pending.resolve(value);
    return true;
  }

  wasAnswered(revision: number): boolean { return this.lastAnsweredRevision === revision; }

  cancel(): boolean {
    if (this.view.journey?.mutationStarted || this.view.outcome) return false;
    const pending = this.pending;
    this.pending = undefined;
    this.publish({ prompt: undefined, promptRevision: undefined, outcome: 'cancelled', message: { tone: 'warning', text: 'Setup cancelled before applying further changes. Any PAT created at GitHub still exists until you delete it there.' } });
    pending?.resolve(undefined);
    return true;
  }

  setJourney(journey: SetupJourneyView): void { this.publish({ journey }); }
  message(text: string, tone: 'info' | 'success' | 'warning' | 'error' = 'info', link?: string): void {
    this.publish({ message: { tone, text, ...(link ? { link } : {}) } });
  }
  requirements(role: SetupTokenRole, requirements: readonly SetupTokenPermissionRequirement[]): void {
    this.publish({ permissions: { role, requirements, report: undefined } });
  }
  report(report: SetupTokenPermissionReport): void {
    this.publish({ permissions: { role: report.role, requirements: this.view.permissions?.requirements, report } });
  }
  finish(outcome: NonNullable<WebSetupView['outcome']>, text: string): void {
    if (this.view.outcome) return;
    this.pending?.resolve(undefined);
    this.pending = undefined;
    this.publish({ prompt: undefined, promptRevision: undefined, outcome, message: { tone: outcome === 'complete' || outcome === 'dry-run' ? 'success' : 'warning', text } });
  }

  private publish(change: Partial<WebSetupView>): void {
    this.revision += 1;
    this.view = { ...this.view, ...change, revision: this.revision };
    for (const listener of this.subscribers) {
      try { listener(this.view); }
      catch { this.subscribers.delete(listener); /* Observers cannot abort a setup decision. */ }
    }
  }
}

function sameCapability(provided: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(provided)) return false;
  return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
}

export function toWebSetupPlan(plan: SetupPlan): WebSetupPlan {
  return {
    files: plan.selectedFiles,
    workflows: plan.workflowFiles,
    variables: plan.variables.map(variable => variable.name),
    secrets: plan.requiredSecrets,
    warnings: plan.warnings,
  };
}
