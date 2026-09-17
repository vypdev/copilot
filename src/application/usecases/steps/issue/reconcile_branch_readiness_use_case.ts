import { branchIsReady, BRANCH_READY_LABEL, ISSUE_START_LABEL, SDD_REQUIRED_LABEL } from '../../../../domain/issue_start_policy';
import { Result } from '../../../../data/model/result';
import type { BoundLinkedBranchReadinessPort } from '../../../ports/linked_branch_readiness_ports';
import type { BoundIssueLabelsPort } from '../../../ports/issue_management_ports';
import { toApplicationError } from '../../../errors/application_error';

export interface BranchReadinessContext {
  readonly issueNumber: number;
  readonly branchName?: string;
  readonly sddRequired: boolean;
  readonly sddPublished: boolean;
  readonly revisionPending?: boolean;
}

/** Projects verified remote facts into the managed `branched` output label. */
export class ReconcileBranchReadinessUseCase {
  readonly taskId = 'ReconcileBranchReadinessUseCase';

  constructor(
    private readonly linkedBranch: BoundLinkedBranchReadinessPort,
    private readonly labels: BoundIssueLabelsPort,
  ) {}

  async invoke(context: BranchReadinessContext): Promise<Result[]> {
    let current: readonly string[] | undefined;
    try {
      current = await this.labels.getLabels(context.issueNumber);
      const started = current.some(label => label.toLowerCase() === ISSUE_START_LABEL);
      const evidence = context.branchName
        ? await this.linkedBranch.getLinkedBranch(context.issueNumber, context.branchName)
        : undefined;
      const ready = branchIsReady({
        linkedBranchExists: Boolean(evidence),
        sddRequired: context.sddRequired,
        sddPublished: context.sddPublished,
        revisionPending: context.revisionPending,
      });
      const hasLabel = current.some(label => label.toLowerCase() === BRANCH_READY_LABEL);
      const hasSddLabel = current.some(label => label.toLowerCase() === SDD_REQUIRED_LABEL.toLowerCase());
      if (ready !== hasLabel || context.sddRequired !== hasSddLabel) {
        const next = current.filter(label => label.toLowerCase() !== BRANCH_READY_LABEL
          && label.toLowerCase() !== SDD_REQUIRED_LABEL.toLowerCase());
        if (ready) next.push(BRANCH_READY_LABEL);
        if (context.sddRequired) next.push(SDD_REQUIRED_LABEL);
        await this.labels.setLabels(context.issueNumber, next);
      }
      return [new Result({
        id: this.taskId,
        success: true,
        executed: ready !== hasLabel || context.sddRequired !== hasSddLabel,
        steps: ready
          ? [`Linked branch ${evidence!.name} is verified at ${evidence!.headSha}; implementation may begin.`]
          : hasLabel
            ? ['The branched label was removed because the exact linked branch or required SDD commit is not verified.']
            : started && context.branchName
              ? ['Branch readiness is pending verification.']
              : [],
        payload: ready ? { branchName: evidence!.name, branchSha: evidence!.headSha } : undefined,
      })];
    } catch (error) {
      const semanticError = toApplicationError(error, 'provider.unavailable', 'Unable to verify linked branch readiness.');
      if (current?.some(label => label.toLowerCase() === BRANCH_READY_LABEL
        || (!context.sddRequired && label.toLowerCase() === SDD_REQUIRED_LABEL.toLowerCase()))) {
        try {
          await this.labels.setLabels(context.issueNumber, current.filter(label => label.toLowerCase() !== BRANCH_READY_LABEL
            && (context.sddRequired || label.toLowerCase() !== SDD_REQUIRED_LABEL.toLowerCase())));
        } catch {
          // Keep the original verification failure; the retry will reconcile the label.
        }
      }
      return [new Result({
        id: this.taskId,
        success: false,
        executed: true,
        steps: ['Branch readiness could not be verified. Rerun the issue workflow on the same branch.'],
        errors: [semanticError],
      })];
    }
  }
}
