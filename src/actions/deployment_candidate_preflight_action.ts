import * as core from '@actions/core';
import * as github from '@actions/github';
import { ApplicationError } from '../application/errors/application_error';
import { parsePositiveSafeInteger } from '../domain/positive_integer_policy';
import {
  DeploymentCandidatePreflightBlockedError,
  DeploymentCandidatePreflightWorkflow,
  type DeploymentCandidatePreflightInput,
} from '../application/usecases/execution/deployment_candidate_preflight_workflow';
import { createDeploymentCandidatePreflightPorts } from '../infrastructure/composition/deployment_candidate_replacement_composition_root';
import { renderCandidatePreflightSummary } from '../application/policies/deployment_candidate_preflight_presentation';

/** Dedicated readonly bundle: never imports main_run, agent setup or completion persistence. */
export async function runDeploymentCandidatePreflightAction(): Promise<void> {
  const get = (key: string): string => core.getInput(key, { trimWhitespace: false });
  const locale = get('repository-locale') || 'en-US';
  let repositoryFullName = '';
  try {
    const token = get('token');
    if (!token.trim()) throw new DeploymentCandidatePreflightBlockedError('invalid-workflow-intent');
    const repository = github.context.repo;
    repositoryFullName = `${repository.owner}/${repository.repo}`;
    const payload = github.context.payload.inputs;
    const eventMode = payload && typeof payload === 'object' && typeof payload.mode === 'string' ? payload.mode : '';
    const input: DeploymentCandidatePreflightInput = {
      operationId: get('operation-id'), expectedRevision: parsePositiveSafeInteger(get('expected-revision')) ?? -1,
      version: get('version'), reviewedSourceSha: get('source-sha'), confirmedUnpublished: get('confirm-unpublished') === 'true',
      issue: parsePositiveSafeInteger(get('issue')) ?? -1, repositoryFullName, eventName: github.context.eventName, eventMode,
      runId: parsePositiveSafeInteger(process.env.GITHUB_RUN_ID) ?? -1,
      runAttempt: parsePositiveSafeInteger(process.env.GITHUB_RUN_ATTEMPT) ?? -1,
      headBranch: github.context.ref.replace(/^refs\/heads\//, ''), headSha: github.context.sha,
      workflowProfile: get('issue-workflow-profile'), releaseLabel: get('release-label') || 'release', hotfixLabel: get('hotfix-label') || 'hotfix',
    };
    const ports = createDeploymentCandidatePreflightPorts({ owner: repository.owner, repository: repository.repo, token });
    const outcome = await new DeploymentCandidatePreflightWorkflow(ports).invoke(input);
    await core.summary.addRaw(renderCandidatePreflightSummary({ kind: 'success', outcome }, locale, repositoryFullName)).write();
    for (const [name, value] of Object.entries({ mode: outcome.mode, 'source-branch': outcome.sourceBranch,
      'candidate-sha': outcome.candidateSha, 'production-base-sha': outcome.productionBaseSha,
      'operation-id': outcome.operationId, 'expected-revision': outcome.expectedRevision,
    })) core.setOutput(name, value);
  } catch (error) {
    const reason = error instanceof DeploymentCandidatePreflightBlockedError ? error.reason : 'native-proof-unavailable';
    const codes = ['workflow.stale', 'workflow.invalid-event', 'provider.unavailable', 'provider.contract-invalid', 'configuration.invalid', 'authorization.denied'];
    const code = error instanceof ApplicationError && codes.includes(error.code) ? error.code : 'provider.unavailable';
    const summary = renderCandidatePreflightSummary({ kind: 'blocked', code, reason }, locale, repositoryFullName);
    await core.summary.addRaw(summary).write().catch(() => undefined);
    // Do not emit SDK/custom semantic error prose or private payloads.
    core.setFailed(`${code}: ${reason}`);
  }
}
