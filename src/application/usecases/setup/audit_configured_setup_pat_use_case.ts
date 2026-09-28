import type { SetupConfiguration, SetupRemoteConfiguration } from '../../../domain/setup';
import type { SetupTokenPermissionReport, SetupTokenPermissionRequirement } from '../../../domain/setup_token_permissions';
import { buildSetupPatCreationUrl } from '../../policies/setup_pat_creation_url_policy';
import { buildConfiguredSetupPatPermissionRequirements, requiredSetupPatPermissionDelta } from '../../policies/setup_token_permission_policy';
import type { SetupFinalPermissionAuditPort } from '../../ports/setup_wizard_ports';
import type { SetupTokenPermissionAuditPort, SetupTokenPermissionPresenterPort } from '../../ports/setup_token_permission_ports';

export interface AuditConfiguredSetupPatContext {
  readonly owner: string;
  readonly repository: string;
  readonly token?: string;
  readonly provisionalRequirements: readonly SetupTokenPermissionRequirement[];
  readonly assertedOwnerKind?: 'Organization' | 'User';
  readonly guided: boolean;
}

export interface AuditConfiguredSetupPatPorts {
  readonly permissions: SetupTokenPermissionAuditPort;
  readonly presenter: SetupTokenPermissionPresenterPort;
  confirmUnverifiable(report: SetupTokenPermissionReport): Promise<boolean>;
  showOwnerMismatch(asserted: 'Organization' | 'User', actual: 'Organization' | 'User'): void;
  showExcessGrants(grants: readonly string[]): void;
  showUpdatedLink(url: string, addedGrants: readonly string[]): void;
}

/** Rechecks the final plan without granting permission based on the browser preview. */
export class AuditConfiguredSetupPatUseCase implements SetupFinalPermissionAuditPort {
  constructor(
    private readonly context: AuditConfiguredSetupPatContext,
    private readonly ports: AuditConfiguredSetupPatPorts,
  ) {}

  async audit(
    configuration: Readonly<SetupConfiguration>,
    remote?: Readonly<SetupRemoteConfiguration>,
  ): Promise<{ status: 'accepted' } | { status: 'blocked'; errors: readonly string[] }> {
    const required = buildConfiguredSetupPatPermissionRequirements(configuration, remote);
    this.ports.presenter.showRequirements('setup', required);
    if (this.context.assertedOwnerKind && remote && remote.ownerType !== 'Unknown'
      && remote.ownerType !== this.context.assertedOwnerKind) {
      this.ports.showOwnerMismatch(this.context.assertedOwnerKind, remote.ownerType);
      this.showCorrectedLink(required);
      return { status: 'blocked', errors: ['Repository owner type differs from the pre-PAT selection. Rerun setup with the correct owner type and PAT.'] };
    }
    if (this.context.guided) {
      const removed = requiredSetupPatPermissionDelta(required, this.context.provisionalRequirements);
      if (removed.length) this.ports.showExcessGrants(removed);
    }
    if (!this.context.token) return { status: 'accepted' };
    const report = await this.ports.permissions.inspect({
      role: 'setup', owner: this.context.owner, repository: this.context.repository,
      token: this.context.token, requirements: required,
    });
    this.ports.presenter.showReport(report);
    const accepted = report.ready || (report.confirmationRequired && await this.ports.confirmUnverifiable(report));
    if (!accepted || report.identityStatus !== 'valid') {
      if (this.context.guided) this.showCorrectedLink(required);
      return { status: 'blocked', errors: [
        'The setup PAT has missing or unconfirmed access required by the approved setup plan. Grant or explicitly confirm the permissions shown above and retry.',
      ] };
    }
    return { status: 'accepted' };
  }

  private showCorrectedLink(required: readonly SetupTokenPermissionRequirement[]): void {
    this.ports.showUpdatedLink(buildSetupPatCreationUrl({
      role: 'setup', owner: this.context.owner, repository: this.context.repository,
      expiresIn: 1, requirements: required,
    }), requiredSetupPatPermissionDelta(this.context.provisionalRequirements, required));
  }
}
