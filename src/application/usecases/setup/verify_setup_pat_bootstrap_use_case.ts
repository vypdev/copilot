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
  readonly previewOnly?: boolean;
  readonly onCleanupPending?: () => void;
}

export interface VerifySetupPatBootstrapPorts {
  readonly permissions: SetupTokenPermissionAuditPort;
  readonly presenter: SetupTokenPermissionPresenterPort;
  confirmUnverifiable(report: SetupTokenPermissionReport): Promise<boolean>;
  confirmAccount(account?: string): Promise<boolean>;
  showCorrectedLink(url: string): void;
}

/** Verify identity/account first, then complete displayed write transactions before planning. */
export class VerifySetupPatBootstrapUseCase {
  constructor(private readonly ports: VerifySetupPatBootstrapPorts) {}

  async execute(request: VerifySetupPatBootstrapRequest): Promise<string | undefined> {
    const requirements = request.guided
      ? request.requirements.filter(requirement => requirement.applicability === 'required')
      : request.requirements;
    const identityReport = await this.ports.permissions.inspect({
      role: 'setup', owner: request.owner, repository: request.repository,
      token: request.token, requirements: requirements.filter(requirement => requirement.level === 'read'),
    });
    this.ports.presenter.showReport(identityReport);
    this.requireReady(request, identityReport);
    if (!await this.ports.confirmAccount(identityReport.account)) {
      throw new ApplicationError('authorization.credential-invalid',
        'The setup PAT belongs to an unintended account. Revoke it in GitHub and retry with the correct account.');
    }
    if (request.previewOnly || !requirements.some(requirement => requirement.level === 'write')) return identityReport.account;
    this.ports.presenter.showRequirements('setup', requirements);
    const report = await this.ports.permissions.inspect({
      role: 'setup', owner: request.owner, repository: request.repository,
      token: request.token, requirements, includeConditionalWrites: true,
    });
    if (report.checks.some(check => check.cleanupPending || check.incident)) request.onCleanupPending?.();
    this.ports.presenter.showReport(report);
    this.requireReady(request, report);
    return report.account ?? identityReport.account;
  }

  private requireReady(request: VerifySetupPatBootstrapRequest, report: SetupTokenPermissionReport): void {
    if (!report.ready || report.identityStatus !== 'valid' || report.checks.some(check => check.cleanupPending || check.incident)) {
      if (request.guided) this.ports.showCorrectedLink(buildSetupPatCreationUrl({
        role: 'setup', owner: request.owner, repository: request.repository,
        expiresIn: 1, requirements: request.requirements, includeConditionalSetupGrants: true,
      }));
      throw new ApplicationError('authorization.credential-invalid',
        'The setup PAT did not pass every required capability check. Review the failed permission and cleanup result, correct access, and retry.');
    }
  }
}
