import type { SetupBatchOperation, SetupBatchPlan } from '../../domain/setup_batch';
import type { SetupBatchView } from '../contracts/setup_batch_view';
import { buildSetupBatchPatPermissionRequirements } from './setup_token_permission_policy';
import { setupBatchBranch } from './setup_batch_policy';
import { planSetupBatchSharedAccess } from './setup_batch_access_policy';

/** Only installer-constructed GitHub destinations and metadata enter the paired view. */
export function buildSetupBatchView(plan: SetupBatchPlan, operation: SetupBatchOperation,
  phase: SetupBatchView['phase'], retryRemaining: number): SetupBatchView {
  return { operationId: plan.operationId, organization: plan.organization, phase, retryRemaining,
    targets: plan.targets.map((target, index) => {
      const receipt = operation.targets[index];
      if (!receipt || receipt.repositoryId !== target.target.id) throw new Error('Setup receipt identity mismatch.');
      return { repositoryId: target.target.id, repository: `${target.target.owner}/${target.target.name}`, status: receipt.status,
        installationBranch: setupBatchBranch(plan.operationId), baseBranch: target.target.defaultBranch, baseSha: target.target.baseSha, blockers: [...target.blocked],
        files: target.files.map(file => ({ path: file.path, content: file.content })),
        repositoryVariables: target.repositoryVariables.map(variable => variable.name),
        grants: target.grants.map(grant => ({ kind: grant.kind, name: grant.name })),
        retainedSecrets: target.blocked.length ? [] : planSetupBatchSharedAccess(target.configuration, target.target, target.remote, target.sharedSnapshot).selectedSecrets,
        permissionProbes: target.blocked.length ? [] : buildSetupBatchPatPermissionRequirements(target.configuration, target.remote, target.grants)
          .filter(requirement => requirement.level === 'write' && requirement.applicability === 'required')
          .map(requirement => ({ scope: requirement.scope, permission: requirement.permission })),
        completedEffects: [...receipt.effects], ...(receipt.reason ? { reason: receipt.reason } : {}),
        ...(receipt.pullRequestNumber ? { pullRequestUrl: `https://github.com/${encodeURIComponent(target.target.owner)}/${encodeURIComponent(target.target.name)}/pull/${receipt.pullRequestNumber}` } : {}),
      };
    }) };
}
