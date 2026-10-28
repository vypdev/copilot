import { ApplicationError } from '../../errors/application_error';
import type { BoundDeploymentCandidatePreflightPorts, DeploymentCandidateLauncher, DeploymentCandidateWorkflowRun } from '../../ports/deployment_candidate_inspection_ports';
import {
  assessDeploymentCandidateReplacement,
  assessDeploymentCandidateReplacementState,
  assessRecordedCandidateReplacementRecovery,
  isCandidateReplacementPreparationPhase,
  isRecordedCandidateReplacement,
  validateDeploymentCandidateReplacementIntent,
  type DeploymentCandidateReplacementRequest,
} from '../../../domain/deployment_candidate_replacement';
import { classifyIssueWorkflow, parseIssueWorkflowProfile, type IssueWorkflowProfile } from '../../../domain/issue_workflow_profile';

export interface DeploymentCandidatePreflightInput extends Omit<DeploymentCandidateReplacementRequest, 'candidateSha' | 'productionBaseSha'> {
  readonly issue: number;
  readonly repositoryFullName: string;
  readonly eventName: string;
  readonly eventMode: string;
  readonly runId: number;
  readonly runAttempt: number;
  readonly headBranch: string;
  readonly headSha: string;
  readonly workflowProfile: string;
  readonly releaseLabel: string;
  readonly hotfixLabel: string;
}

export interface DeploymentCandidatePreflightOutcome {
  readonly mode: 'prepare' | 'recover' | 'recorded';
  readonly issue: number;
  readonly version: string;
  readonly previousPromotion: number;
  readonly sourceBranch: string;
  readonly candidateSha: string;
  readonly reviewedSourceSha: string;
  readonly productionBaseSha: string;
  readonly operationId: string;
  readonly expectedRevision: number;
  readonly currentOperationId: string;
  readonly currentRevision: number;
}

/** No mutation, agent, workspace or persistence capability is available here. */
export class DeploymentCandidatePreflightWorkflow {
  constructor(private readonly ports: BoundDeploymentCandidatePreflightPorts) {}

  async invoke(input: DeploymentCandidatePreflightInput): Promise<DeploymentCandidatePreflightOutcome> {
    const profile = validateIntent(input);
    const [launcher, run] = await Promise.all([this.ports.readLauncher(input.issue), this.ports.readWorkflowRun(input.runId)]);
    verifyRun(input, launcher, run);
    const operation = launcher.operation;
    const previous = operation.supersededCandidates?.at(-1);
    const replayRequest: DeploymentCandidateReplacementRequest = { ...input, candidateSha: operation.sourceSha,
      productionBaseSha: previous?.replacementBaseSha ?? '',
    };
    const replay = isRecordedCandidateReplacement(operation, replayRequest);
    if (input.headSha !== input.reviewedSourceSha && (!replay || input.headSha !== operation.sourceSha)) return blocked('native-workflow-mismatch');
    if (replay && !isCandidateReplacementPreparationPhase(operation)) {
      return outcome('recorded', input, launcher, replayRequest);
    }
    const admission = classifyIssueWorkflow(launcher.admission.labels, profile,
      { release: [input.releaseLabel], hotfix: [input.hotfixLabel] }, launcher.admission.body);
    if (!launcher.open || admission.status !== 'eligible' || admission.kind !== operation.kind) return blocked('launcher-not-admitted');
    if (!replay && (input.operationId !== operation.operationId || input.expectedRevision !== operation.revision
      || input.version !== operation.version)) return blocked('stale-candidate-intent');
    const oldPromotion = replay ? previous!.promotionPullRequest : operation.promotionPullRequest;
    if (oldPromotion === undefined) return blocked('missing-previous-promotion');
    const facts = await this.ports.inspect({ issue: input.issue, sourceBranch: operation.sourceBranch,
      sourceSha: replay ? previous!.sourceSha : operation.sourceSha, reviewedSourceSha: input.reviewedSourceSha,
      productionBranch: operation.productionBranch, promotionPullRequest: oldPromotion, version: operation.version,
      ...(replay ? { allowedCurrentPromotion: { operationId: operation.operationId, sourceSha: operation.sourceSha,
        pullRequest: operation.promotionPullRequest } } : {}),
    });
    const request: DeploymentCandidateReplacementRequest = replay ? replayRequest : {
      ...input, candidateSha: input.reviewedSourceSha, productionBaseSha: facts.productionSha,
    };
    if (!replay) {
      const stateProblem = assessDeploymentCandidateReplacementState(operation, request);
      if (stateProblem) return blocked(stateProblem);
    }
    const assessment = replay ? assessRecordedCandidateReplacementRecovery : assessDeploymentCandidateReplacement;
    const decision = assessment(operation, request, { repositoryFullName: input.repositoryFullName, issue: input.issue,
      kind: launcher.kind, sourceBranch: launcher.sourceBranch, productionBranch: operation.productionBranch }, facts);
    if (decision.kind === 'blocked') return blocked(decision.reason);
    return outcome(replay ? 'recover' : 'prepare', input, launcher, request);
  }
}

function validateIntent(input: DeploymentCandidatePreflightInput): IssueWorkflowProfile {
  const problem = validateDeploymentCandidateReplacementIntent(input);
  if (problem) return blocked(problem);
  if (!Number.isSafeInteger(input.issue) || input.issue < 1 || !Number.isSafeInteger(input.runId) || input.runId < 1
    || !Number.isSafeInteger(input.runAttempt) || input.runAttempt < 1
    || input.eventName !== 'workflow_dispatch' || input.eventMode !== 'replace'
    || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repositoryFullName)
    || !/^[a-f0-9]{40}$/.test(input.headSha)) return blocked('invalid-workflow-intent');
  for (const label of [input.releaseLabel, input.hotfixLabel]) {
    if (!label || new TextEncoder().encode(label).byteLength > 256 || /\p{Cc}/u.test(label)) return blocked('invalid-kind-label');
  }
  const parsed = parseIssueWorkflowProfile(input.workflowProfile);
  if ('error' in parsed) return blocked('invalid-workflow-profile');
  return parsed.profile;
}

function verifyRun(input: DeploymentCandidatePreflightInput, launcher: DeploymentCandidateLauncher, run: DeploymentCandidateWorkflowRun): void {
  const workflow = launcher.operation.publicationWorkflow;
  const expectedPath = workflow.startsWith('.github/workflows/') ? workflow : `.github/workflows/${workflow}`;
  const repository = input.repositoryFullName.toLowerCase();
  if (launcher.issue !== input.issue || run.id !== input.runId || run.attempt !== input.runAttempt
    || run.repositoryFullName.toLowerCase() !== repository || run.headRepositoryFullName.toLowerCase() !== repository
    || run.event !== 'workflow_dispatch' || run.status !== 'in_progress'
    || run.headSha !== input.headSha || run.headBranch !== launcher.sourceBranch
    || input.headBranch !== launcher.sourceBranch || run.path.split('@', 1)[0] !== expectedPath) {
    return blocked('native-workflow-mismatch');
  }
}

function outcome(mode: DeploymentCandidatePreflightOutcome['mode'], input: DeploymentCandidatePreflightInput,
  launcher: DeploymentCandidateLauncher, request: DeploymentCandidateReplacementRequest): DeploymentCandidatePreflightOutcome {
  const predecessor = launcher.operation.supersededCandidates?.at(-1);
  const previousPromotion = predecessor?.operationId === input.operationId
    ? predecessor.promotionPullRequest : launcher.operation.promotionPullRequest;
  if (previousPromotion === undefined) return blocked('missing-previous-promotion');
  return Object.freeze({ mode, issue: input.issue, version: launcher.operation.version, previousPromotion, sourceBranch: launcher.sourceBranch, candidateSha: request.candidateSha,
    reviewedSourceSha: input.reviewedSourceSha, productionBaseSha: request.productionBaseSha,
    operationId: input.operationId, expectedRevision: input.expectedRevision,
    currentOperationId: launcher.operation.operationId, currentRevision: launcher.operation.revision });
}
const SAFE_PREFLIGHT_REASONS = new Set([
  'invalid-request', 'unconfirmed-publication-vacancy', 'stale-operation', 'stale-revision', 'different-version',
  'ineligible-phase', 'publication-effects', 'history-limit', 'unchanged-source', 'changed-launcher', 'changed-ownership',
  'changed-source', 'changed-production-base', 'changed-lineage', 'invalid-promotion', 'active-promotion', 'native-publication-effects',
  'launcher-not-admitted', 'stale-candidate-intent', 'missing-previous-promotion', 'invalid-workflow-intent',
  'invalid-kind-label', 'invalid-workflow-profile', 'native-workflow-mismatch', 'native-proof-unavailable',
]);

/** Only closed reasons cross the readonly entrypoint; arbitrary semantic error prose is never rendered. */
export class DeploymentCandidatePreflightBlockedError extends ApplicationError {
  readonly reason: string;
  constructor(reason: unknown) {
    const safe = typeof reason === 'string' && SAFE_PREFLIGHT_REASONS.has(reason) ? reason : 'native-proof-unavailable';
    super('workflow.stale', `Unpublished candidate preflight was blocked (${safe}). No branch or deployment state was changed.`);
    this.reason = safe;
    Object.freeze(this);
  }
}
function blocked(reason: string): never {
  throw new DeploymentCandidatePreflightBlockedError(reason);
}
