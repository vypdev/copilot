import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { SetupJourneyView } from '../application/policies/setup_journey_policy';
import type { SetupPlan, SetupOperationEffect } from '../domain/setup';
import type { SetupTokenPermissionProgress, SetupTokenPermissionReport, SetupTokenPermissionRequirement, SetupTokenRole } from '../domain/setup_token_permissions';
import type { WebSetupPlan, WebSetupPrompt, WebSetupView } from '../application/contracts/web_setup_view';
import type { WebSetupMessageCopyId } from '../application/contracts/web_setup_view';

/** A one-run, in-memory handoff. Values submitted by the browser are never part of a view. */
export class WebSetupBridge {
  private revision = 0;
  private view: WebSetupView;
  private pending?: { revision: number; resolve: (value: string | undefined) => void;
    refresh?: () => Promise<{ prompt: WebSetupPrompt; commit: () => void } | undefined>;
    navigateBack?: () => { prompt: WebSetupPrompt; commit: () => void } | undefined; refreshing?: boolean };
  private subscribers = new Set<(view: WebSetupView) => void>();
  private controller?: string;
  private lastAnsweredRevision?: number;
  private readOnlyDoctor?: () => Promise<{ healthy: boolean; pass: number; warn: number; fail: number; skipped: number }>;
  private doctorAttempts = 0;

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
    this.publish({ message: { tone: 'info', text: 'Control moved to this tab. The previous tab is now read-only.', copyId: 'session.controlMoved' } });
    return this.controller;
  }

  isController(capability: string): boolean {
    return Boolean(this.controller && sameCapability(capability, this.controller));
  }

  async ask(prompt: WebSetupPrompt, refresh?: () => Promise<{ prompt: WebSetupPrompt; commit: () => void } | undefined>,
    navigateBack?: () => { prompt: WebSetupPrompt; commit: () => void } | undefined): Promise<string | undefined> {
    if (this.pending || this.view.outcome) throw new Error('A setup decision is already pending or the session has ended.');
    const revision = this.revision + 1;
    this.publish({ prompt, promptRevision: revision });
    return new Promise(resolve => { this.pending = { revision, resolve, refresh, navigateBack }; });
  }

  back(revision: number): 'updated' | 'stale' | 'unavailable' {
    const pending = this.pending;
    if (!pending || pending.revision !== revision || this.view.outcome) return 'stale';
    if (!pending.navigateBack || pending.refreshing) return 'unavailable';
    const result = pending.navigateBack();
    if (!result) return 'unavailable';
    result.commit();
    pending.revision = this.revision + 1;
    this.publish({ prompt: result.prompt, promptRevision: pending.revision, message: undefined });
    return 'updated';
  }

  async retryDiscovery(revision: number): Promise<'updated' | 'stale' | 'unavailable'> {
    const pending = this.pending;
    if (!pending || pending.revision !== revision || this.view.outcome) return 'stale';
    if (!pending.refresh || pending.refreshing) return 'unavailable';
    const controller = this.controller;
    pending.refreshing = true;
    try {
      const result = await pending.refresh();
      if (this.pending !== pending || this.view.outcome || controller !== this.controller) return 'stale';
      if (!result) return 'unavailable';
      result.commit();
      // Keep promptRevision stable so the browser retains unsent manual and checkbox input.
      this.publish({ prompt: result.prompt });
      return 'updated';
    } finally {
      pending.refreshing = false;
    }
  }

  answer(revision: number, value: string): boolean {
    if (!this.pending || this.pending.revision !== revision || this.pending.refreshing || this.view.outcome) return false;
    const prompt = this.view.prompt;
    if (prompt && (prompt.kind === 'choice' || prompt.kind === 'confirm') && !prompt.choices.includes(value)) return false;
    if (prompt?.kind === 'plan' && value !== 'approve' && value !== 'decline'
      && !prompt.editGroups?.some(group => value === `revise:${group}`)) return false;
    const pending = this.pending;
    this.pending = undefined;
    this.lastAnsweredRevision = revision;
    this.publish({ prompt: undefined, promptRevision: undefined });
    pending.resolve(value);
    return true;
  }

  wasAnswered(revision: number): boolean { return this.lastAnsweredRevision === revision; }

  configureReadOnlyDoctor(run: () => Promise<{ healthy: boolean; pass: number; warn: number; fail: number; skipped: number }>): void {
    this.readOnlyDoctor = run;
  }

  async runReadOnlyDoctor(): Promise<'complete' | 'failed' | 'unavailable' | 'busy'> {
    if (this.view.outcome !== 'complete' || !this.readOnlyDoctor) return 'unavailable';
    if (this.view.doctor?.status === 'running') return 'busy';
    if (this.view.doctor?.status === 'complete') return 'complete';
    if (this.doctorAttempts >= 2) return 'unavailable';
    this.doctorAttempts += 1;
    this.publish({ doctor: { status: 'running' } });
    try {
      const summary = await this.readOnlyDoctor();
      const counts = [summary.pass, summary.warn, summary.fail, summary.skipped];
      if (counts.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('Invalid doctor summary.');
      this.publish({ doctor: { status: 'complete', healthy: summary.healthy === true,
        pass: summary.pass, warn: summary.warn, fail: summary.fail, skipped: summary.skipped } });
      return 'complete';
    } catch {
      this.publish({ doctor: { status: 'failed' } });
      return 'failed';
    }
  }

  cancel(): boolean {
    if (this.view.journey?.mutationStarted || this.view.outcome) return false;
    const pending = this.pending;
    this.pending = undefined;
    this.publish({ prompt: undefined, promptRevision: undefined, outcome: 'cancelled', resultDetail: {
      reasonCode: 'cancelled', stoppedStage: this.view.journey?.current ?? 'Preparation', mutationStarted: false,
    }, message: { tone: 'warning', text: 'Setup cancellation requested. Temporary permission checks already started will finish cleanup before the process exits. Any PAT created at GitHub still exists until you delete it there.', copyId: 'session.cancelled' } });
    pending?.resolve(undefined);
    return true;
  }

  setJourney(journey: SetupJourneyView): void { this.publish({ journey }); }
  message(text: string, tone: 'info' | 'success' | 'warning' | 'error' = 'info', link?: string, copyId?: WebSetupMessageCopyId, copyValues?: Readonly<Record<string, string>>, credentialChecks?: NonNullable<WebSetupView['message']>['credentialChecks']): void {
    this.publish({ message: { tone, text, ...(link ? { link } : {}), copyId, copyValues, credentialChecks } });
  }
  requirements(role: SetupTokenRole, requirements: readonly SetupTokenPermissionRequirement[]): void {
    this.publish({ permissions: { role, requirements, report: undefined, progress: [] } });
  }
  report(report: SetupTokenPermissionReport): void {
    this.publish({ permissions: { role: report.role, requirements: this.view.permissions?.requirements,
      progress: this.view.permissions?.progress, report } });
  }
  permissionProgress(progress: SetupTokenPermissionProgress): void {
    if (this.view.outcome || this.view.permissions?.role !== progress.role
      || !this.view.permissions.requirements?.some(item => item.id === progress.requirementId)) return;
    const previous = this.view.permissions.progress ?? [];
    const detail = progress.detail && (/^http-[1-5][0-9]{2}$/u.test(progress.detail)
      || ['unavailable', 'cleanup-pending', 'secret-collision', 'unsupported', 'contents-write', 'contents-workflows-write', 'dispatch-workflow'].includes(progress.detail))
      ? progress.detail : undefined;
    this.publish({ permissions: { ...this.view.permissions, progress: [
      ...previous.filter(item => item.requirementId !== progress.requirementId),
      { role: progress.role, requirementId: progress.requirementId, phase: progress.phase,
        ...(detail ? { detail } : {}) },
    ] } });
  }
  resultReason(reasonCode: NonNullable<WebSetupView['resultDetail']>['reasonCode'], diagnosticRef?: string): void {
    if (this.view.outcome) return;
    this.publish({ resultDetail: {
      reasonCode,
      stoppedStage: this.view.journey?.current ?? 'Preparation',
      mutationStarted: this.view.journey?.mutationStarted === true,
      ...(this.view.resultDetail?.effects ? { effects: this.view.resultDetail.effects } : {}),
      ...(diagnosticRef && /^[0-9a-f-]{36}$/u.test(diagnosticRef) ? { diagnosticRef } : {}),
    } });
  }
  effects(effects: NonNullable<WebSetupView['resultDetail']>['effects']): void {
    if (this.view.outcome) return;
    this.publish({ resultDetail: { reasonCode: this.view.resultDetail?.reasonCode ?? 'unknown',
      stoppedStage: this.view.journey?.current ?? 'Preparation',
      mutationStarted: this.view.journey?.mutationStarted === true, effects,
      ...(this.view.resultDetail?.diagnosticRef ? { diagnosticRef: this.view.resultDetail.diagnosticRef } : {}) } });
  }
  progress(effect: SetupOperationEffect): void {
    if (this.view.outcome) return;
    const previous = this.view.resultDetail?.effects ?? [];
    const effects = previous.some(item => item.id === effect.id)
      ? previous.map(item => item.id === effect.id ? { ...effect } : item)
      : [...previous, { ...effect }];
    this.effects(effects);
  }
  finish(outcome: NonNullable<WebSetupView['outcome']>, text: string): void {
    if (this.view.outcome) return;
    this.pending?.resolve(undefined);
    this.pending = undefined;
    const effects = this.view.resultDetail?.effects?.map(effect => effect.state === 'in-progress'
      ? { ...effect, state: 'needs-inspection' as const } : effect);
    this.publish({ prompt: undefined, promptRevision: undefined, outcome, message: { tone: outcome === 'complete' || outcome === 'dry-run' ? 'success' : 'warning', text },
      ...(this.view.resultDetail && effects ? { resultDetail: { ...this.view.resultDetail, effects } } : {}),
      ...(this.view.resultDetail ? {} : { resultDetail: {
        reasonCode: outcome === 'cancelled' ? 'cancelled' : outcome === 'blocked' ? 'unknown' : 'unknown',
        stoppedStage: this.view.journey?.current ?? 'Preparation',
        mutationStarted: this.view.journey?.mutationStarted === true,
      } }),
    });
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
    presentationDefaults: plan.presentationDefaults ?? [],
    permissionProbes: plan.permissionProbes ?? [],
    decisions: {
      enabledCapabilities: Object.entries(plan.configuration.features).filter(([, enabled]) => enabled).map(([name]) => name),
      agentRouting: Object.entries(plan.configuration.agents).map(([role, agent]) => ({ role,
        provider: agent.provider, modelProvider: agent.modelProvider, model: agent.model })),
      issueWorkflows: plan.configuration.features.issues ? plan.configuration.issueWorkflows.enabled : [],
      productionBranch: plan.configuration.repository.mainBranch,
      developmentBranch: plan.configuration.repository.developmentBranch,
      approvalMode: plan.configuration.pullRequestApproval.mode,
      trustedChecks: plan.configuration.pullRequestApproval.testChecks.map(check => ({ name: check.name,
        sourceAppId: check.sourceAppId, workflowName: check.workflowName })),
      producerAttested: plan.configuration.pullRequestApproval.producerAttested,
      coverageMode: plan.configuration.pullRequestApproval.coverage.mode,
      coverageCheck: plan.configuration.pullRequestApproval.coverage.checkName,
      ...(plan.configuration.pullRequestApproval.coverage.mode === 'numeric' ? {
        coverageMinimum: plan.configuration.pullRequestApproval.coverage.minDiffPercent,
        coverageArtifactWorkflow: plan.configuration.pullRequestApproval.coverage.artifactWorkflowName,
        coverageReporterAttested: plan.configuration.pullRequestApproval.coverage.reporterAttested,
      } : {}),
      projectNumbers: plan.configuration.projects.ids.split(',').filter(Boolean),
      projectStatuses: [
        { transition: 'issueCreated', value: plan.configuration.projects.issueCreatedColumn },
        { transition: 'pullRequestCreated', value: plan.configuration.projects.pullRequestCreatedColumn },
        { transition: 'issueInProgress', value: plan.configuration.projects.issueInProgressColumn },
        { transition: 'pullRequestInProgress', value: plan.configuration.projects.pullRequestInProgressColumn },
      ],
      variableScope: plan.configuration.manageRepositoryVariables ? plan.configuration.storage.variables.defaultScope : 'disabled',
      secretScope: plan.configuration.manageRepositorySecrets ? plan.configuration.storage.secrets.defaultScope : 'disabled',
      initialTag: plan.configuration.createInitialTag,
    },
    files: plan.selectedFiles,
    workflows: plan.workflowFiles,
    variables: plan.variables.map(variable => variable.name),
    secrets: plan.requiredSecrets,
    warnings: plan.warnings,
  };
}
