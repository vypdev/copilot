import type { SetupConfiguration, SetupRemoteConfiguration } from '../../../domain/setup';
import type { SetupBatchPlan, SetupBatchSharedResource, SetupBatchTarget, SetupBatchTargetPlan } from '../../../domain/setup_batch';
import type { SetupBatchDiscoveryPort, SetupBatchInventoryPort, SetupBatchRenderPort } from '../../ports/setup_batch_ports';
import { setupBatchBranch, validateSetupBatchTargets } from '../../policies/setup_batch_policy';
import { unavailableSetupRemoteConfiguration } from '../../policies/setup_remote_facts_policy';
import { createDefaultSetupConfiguration } from '../../policies/setup_configuration_defaults';
import { buildSetupOrganizationReuseVariables } from '../../policies/setup_organization_variable_reuse_policy';
import { buildSetupRepositoryVariables } from '../../policies/setup_configuration_plan';
import { configureSetupOrganizationReuseStorage } from '../../policies/setup_organization_variable_reuse_policy';
import { projectSetupBatchSharedBindings, planSetupBatchSharedAccess } from '../../policies/setup_batch_access_policy';
import { validateSetupConfiguration } from '../../policies/setup_configuration_validation';
import { SetupInteractionCancelledError } from '../../errors/setup_interaction_cancelled_error';

export interface PrepareSetupBatchRequest {
  readonly organization: string;
  readonly selected: readonly { readonly id: number; readonly name: string }[];
  readonly token: string;
  readonly operationId?: string;
}
export interface PrepareSetupBatchPorts {
  readonly discovery: SetupBatchDiscoveryPort;
  readonly inventory: SetupBatchInventoryPort;
  readonly renderer: SetupBatchRenderPort;
  configure(target: SetupBatchTarget, remote: SetupRemoteConfiguration, context: { readonly remote: SetupRemoteConfiguration; readonly shared: readonly SetupBatchSharedResource[]; readonly token: string }): Promise<{
    readonly configuration: SetupConfiguration; readonly blocked?: readonly string[];
  } | undefined>;
  active(): boolean;
}
/** Sequential read-only planning; shared namespace metadata is inspected once per operation. */
export class PrepareSetupBatchUseCase {
  constructor(private readonly ports: PrepareSetupBatchPorts) {}
  async execute(request: PrepareSetupBatchRequest): Promise<SetupBatchPlan> {
    if (request.selected.length < 1 || request.selected.length > 25 || new Set(request.selected.map(target => target.id)).size !== request.selected.length) {
      throw new Error('Select between 1 and 25 distinct repository identities.');
    }
    const operationId = request.operationId ?? this.ports.renderer.operationId();
    setupBatchBranch(operationId);
    const targets: SetupBatchTarget[] = [];
    for (const selected of request.selected) {
      if (!this.ports.active()) throw new SetupInteractionCancelledError();
      const target = await this.ports.discovery.resolve(request.organization, selected.name, request.token);
      if (target.id !== selected.id) throw new Error('A selected repository identity changed. Inspect the selection again.');
      targets.push(target);
    }
    const errors = validateSetupBatchTargets(request.organization, targets);
    if (errors.length) throw new Error(errors.join(' '));
    const shared = await this.ports.inventory.shared(request.organization, request.token);
    const plans: SetupBatchTargetPlan[] = [];
    for (const target of targets) {
      if (!this.ports.active()) throw new SetupInteractionCancelledError();
      const remote = await this.ports.inventory.effective(target, request.token).catch(() => unavailableSetupRemoteConfiguration());
      if (remote.ownerType !== 'Organization' || remote.repositoryId !== target.id || remote.repositoryVariablesAccess !== 'available'
        || remote.repositorySecretsAccess !== 'available' || remote.organizationVariablesAccess !== 'available'
        || remote.organizationSecretsAccess !== 'available' || remote.repositorySecrets.length > 0 && !remote.repositorySecretRevisions) {
        const configuration = createDefaultSetupConfiguration();
        plans.push({ target, remote, configuration, files: [], repositoryVariables: [], grants: [], sharedSnapshot: [],
          blocked: ['Repository inventory is unavailable. Restore access and inspect this target again; other ready targets can continue.'],
          digest: this.ports.renderer.digest(JSON.stringify({ target, unavailable: true })) });
        continue;
      }
      // A planned additive grant is an explicit pending effect, never evidence that access already exists.
      const projected = projectSetupBatchSharedBindings(remote, shared, target);
      const chosen = await this.ports.configure(target, projected, { remote, shared, token: request.token });
      if (!chosen) throw new SetupInteractionCancelledError();
      if (chosen.blocked?.length) {
        plans.push({ target, configuration: chosen.configuration, remote, files: [], repositoryVariables: [], grants: [], sharedSnapshot: [],
          blocked: [...chosen.blocked], digest: this.ports.renderer.digest(JSON.stringify({ target, configuration: chosen.configuration })) });
        continue;
      }
      const configuration = configureSetupOrganizationReuseStorage(chosen.configuration, buildSetupOrganizationReuseVariables(chosen.configuration, projected), projected);
      const blocked = [...validateSetupConfiguration(configuration)];
      const access = planSetupBatchSharedAccess(configuration, target, remote, shared);
      const { grants } = access;
      blocked.push(...access.missing.map(name => `${name}: provision or authorize this existing binding separately, then inspect again.`));
      let files: SetupBatchTargetPlan['files'] = [];
      if (!blocked.length) {
        try {
          const existing = await this.ports.inventory.files(target, request.token);
          files = await this.ports.renderer.render(configuration, existing);
        } catch {
          blocked.push('Setup files could not be inspected or rendered within the fixed asset budget. Inspect this target before retrying; other ready targets can continue.');
        }
      }
      const basis = { target, configuration, remote, files, repositoryVariables: access.variables.repositoryWrites, grants, sharedSnapshot: access.sharedSnapshot, blocked };
      // The desired contract stays stable after our own grants and Variable writes.
      // Observed facts are freshly reviewed and revalidated, never persisted as values.
      const digest = this.ports.renderer.digest(JSON.stringify({ target, configuration, files,
        variables: buildSetupRepositoryVariables(configuration) }));
      plans.push({ ...basis, digest });
    }
    return { operationId, organization: request.organization, targets: plans };
  }
}
