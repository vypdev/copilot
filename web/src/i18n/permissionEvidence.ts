import type { WebSetupView } from '../../../src/application/contracts/web_setup_view';
import { tr, type SetupLocale } from './catalog';
import { permissionPrerequisite } from './permissionPrerequisite';

type PermissionRequirement = NonNullable<NonNullable<WebSetupView['permissions']>['requirements']>[number];

/** Human meaning of bounded permission evidence; never renders provider text. */
export function permissionEvidence(
  check: Pick<PermissionRequirement, 'scope' | 'permission' | 'level' | 'applicability'> &
    { status: unknown; publicReadEvidence?: unknown; prerequisite?: unknown },
  locale: SetupLocale,
): string {
  if (check.status === 'unverifiable' && check.permission === 'Actions' && check.level === 'write') {
    const prerequisite = permissionPrerequisite(check.prerequisite, locale);
    if (prerequisite) return prerequisite;
  }
  if (check.status === 'verified') {
    return tr(check.level === 'write' ? 'permissionEvidenceVerifiedWrite'
      : check.scope === 'organization' && check.permission === 'Projects' && check.level === 'read'
        ? 'permissionEvidencePrivateProject' : 'permissionEvidenceVerified', locale);
  }
  if (check.status === 'missing') return tr('permissionEvidenceMissing', locale);
  if (check.status === 'available') return tr(check.publicReadEvidence === 'public-organization-projects'
    ? 'permissionEvidencePublicProjects' : 'permissionEvidencePublic', locale);
  if (check.level === 'write') return tr('permissionEvidenceWrite', locale);
  if (check.publicReadEvidence === 'public-organization-projects') return tr('permissionEvidencePublicProjects', locale);
  if (check.publicReadEvidence === 'public-repository') return tr('permissionEvidencePublic', locale);
  return tr('permissionEvidenceUnknownRead', locale);
}
