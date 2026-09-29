import type { SetupConfiguration, SetupRemoteConfiguration } from '../../../domain/setup';
import { ApplicationError } from '../../errors/application_error';
import { SetupInteractionCancelledError } from '../../errors/setup_interaction_cancelled_error';
import { sameSetupRemoteFacts } from '../../policies/setup_remote_facts_policy';
import type { SetupFinalPermissionAuditPort, SetupRemoteConfigurationReadPort } from '../../ports/setup_wizard_ports';

export interface WebSetupRepositoryFacts {
  readonly owner: string;
  readonly repository: string;
  readonly checkoutRoot: string;
  readonly branch: string;
  readonly head: string;
}

export interface VerifyWebSetupApplyRequest {
  readonly repository: WebSetupRepositoryFacts;
  readonly selectedFiles: readonly string[];
  readonly fileSnapshot: Readonly<Record<string, string>>;
  readonly approvedRemote: Readonly<SetupRemoteConfiguration>;
  readonly configuration: Readonly<SetupConfiguration>;
  readonly setupToken: string;
}

export interface VerifyWebSetupApplyPorts {
  confirm(): Promise<'apply' | 'stop' | undefined>;
  readRepositoryFacts(): WebSetupRepositoryFacts | undefined;
  fileSnapshotMatches(root: string, files: readonly string[], snapshot: Readonly<Record<string, string>>): boolean;
  remote: SetupRemoteConfigurationReadPort;
  permissionAudit: SetupFinalPermissionAuditPort;
  sessionState(): 'active' | 'cancelled' | 'ended';
}

/** Authorizes one web Apply against the facts the operator actually reviewed. */
export class VerifyWebSetupApplyUseCase {
  constructor(private readonly ports: VerifyWebSetupApplyPorts) {}

  async execute(request: VerifyWebSetupApplyRequest): Promise<'approved' | 'declined' | 'cancelled'> {
    const decision = await this.ports.confirm();
    if (decision === undefined) return 'cancelled';
    if (decision === 'stop') return 'declined';
    this.assertActive();
    this.assertLocalSnapshot(request);

    let remote = await this.ports.remote.inspect(request.repository.owner, request.repository.repository, request.setupToken);
    this.assertActive();
    let credentialHealthWorkflow: 'installed' | 'missing' | 'unavailable' = 'unavailable';
    try {
      credentialHealthWorkflow = await this.ports.remote.inspectCredentialHealthWorkflow?.(
        request.repository.owner, request.repository.repository, request.setupToken, request.configuration.repository.mainBranch,
      ) ?? 'unavailable';
    } catch { /* Unknown selected-ref state must not inherit a provisional value. */ }
    this.assertActive();
    remote = { ...remote, credentialHealthWorkflow };
    if (!sameSetupRemoteFacts(remote, request.approvedRemote)) {
      throw new ApplicationError('configuration.invalid', 'GitHub repository facts changed since plan review. No mutation started; restart and review a new plan.');
    }
    const audit = await this.ports.permissionAudit.audit(request.configuration, remote);
    this.assertActive();
    if (audit.status === 'blocked') {
      throw new ApplicationError('authorization.credential-invalid', 'Setup PAT access changed since plan review. No mutation started; correct the PAT and review a new plan.');
    }
    // The remote reads above can take time. Close that window before the caller applies.
    this.assertLocalSnapshot(request);
    return 'approved';
  }

  private assertLocalSnapshot(request: VerifyWebSetupApplyRequest): void {
    const current = this.ports.readRepositoryFacts();
    const expected = request.repository;
    if (!current || current.owner !== expected.owner || current.repository !== expected.repository
      || current.checkoutRoot !== expected.checkoutRoot || current.branch !== expected.branch
      || current.head !== expected.head) {
      throw new ApplicationError('configuration.invalid', 'The repository identity changed during setup. No mutation started; restart and review a new plan.');
    }
    if (!this.ports.fileSnapshotMatches(expected.checkoutRoot, request.selectedFiles, request.fileSnapshot)) {
      throw new ApplicationError('configuration.invalid', 'Selected repository files changed since plan review. No mutation started; restart and review a new plan.');
    }
  }

  private assertActive(): void {
    const state = this.ports.sessionState();
    if (state === 'cancelled') {
      throw new SetupInteractionCancelledError();
    }
    if (state === 'ended') {
      throw new ApplicationError('configuration.invalid', 'The local setup session expired during final checks. No mutation started; start a new run and review a fresh plan.');
    }
  }
}
