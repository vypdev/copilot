import type { PermissionName, PermissionTerm } from '../permissionTerms';
export const namesEn: Readonly<Record<PermissionName, string>> = {
  Metadata: 'Metadata', Contents: 'Contents', Secrets: 'Secrets', Variables: 'Variables', Issues: 'Issues', Actions: 'Actions', Checks: 'Checks', Administration: 'Administration', Workflows: 'Workflows', 'Issue Types': 'Issue Types', Projects: 'Projects', 'Pull requests': 'Pull requests', Members: 'Members',
};
export const termsEn: Readonly<Record<PermissionTerm, string>> = {
  repository: 'repository', organization: 'organization', read: 'Read', write: 'Write', required: 'Required', conditional: 'Conditional', verified: 'Verified', available: 'Read available', missing: 'Missing', unverifiable: 'Unverifiable',
};
