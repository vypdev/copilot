import type { SetupTokenPermissionReport, SetupTokenPermissionRequirement } from '../../../domain/setup_token_permissions';
import { ApplicationError } from '../../errors/application_error';
import { buildSetupPatCreationUrl } from '../../policies/setup_pat_creation_url_policy';
import type { SetupTokenPermissionAuditPort, SetupTokenPermissionPresenterPort } from '../../ports/setup_token_permission_ports';

export interface VerifySetupPatBootstrapRequest {
  readonly owner: string;
  readonly repository: string;
  readonly token: string;
  readonly requirements: readonly SetupTokenPermissionRequirement[];
  readonly guided: boolean;
}

export interface VerifySetupPatBootstrapPorts {
  readonly permissions: SetupTokenPermissionAuditPort;
  readonly presenter: SetupTokenPermissionPresenterPort;
  confirmUnverifiable(report: SetupTokenPermissionReport): Promise<boolean>;
  confirmAccount(account?: string): Promise<boolean>;
  showCorrectedLink(url: string): void;
}

/** Initial read-only gate shared by terminal and browser setup presentations. */
export class VerifySetupPatBootstrapUseCase {
  constructor(private readonly ports: VerifySetupPatBootstrapPorts) {}

  async execute(request: VerifySetupPatBootstrapRequest): Promise<string | undefined> {
    const report = await this.ports.permissions.inspect({
      role: 'setup', owner: request.owner, repository: request.repository,
      token: request.token, requirements: request.requirements,
    });
    this.ports.presenter.showReport(report);
    const accepted = report.ready
      || (report.confirmationRequired && await this.ports.confirmUnverifiable(report));
    if (!accepted || report.identityStatus !== 'valid') {
      if (request.guided) this.ports.showCorrectedLink(buildSetupPatCreationUrl({
        role: 'setup', owner: request.owner, repository: request.repository,
        expiresIn: 1, requirements: request.requirements,
      }));
      throw new ApplicationError('authorization.credential-invalid',
        'The setup PAT has missing or unconfirmed required access. Review the permission report, correct or explicitly confirm the required grants, and retry.');
    }
    if (!await this.ports.confirmAccount(report.account)) {
      throw new ApplicationError('authorization.credential-invalid',
        'The setup PAT belongs to an unintended account. Revoke it in GitHub and retry with the correct account.');
    }
    return report.account;
  }
}
