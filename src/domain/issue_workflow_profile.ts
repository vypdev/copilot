import { readIssueWorkflowFields } from './issue_workflow_body';
import { normalizeWorkflowFieldMappings, type WorkflowFieldMappings } from './issue_workflow_field_mapping';
import { hasDuplicateJsonObjectKeys } from './strict_json_keys';
/** Stable workflow identifiers used by setup, generated guidance, and Actions. */
export type IssueWorkflowKind =
  | 'feature'
  | 'bugfix'
  | 'documentation'
  | 'chore'
  | 'help'
  | 'hotfix'
  | 'release';

export const ISSUE_WORKFLOW_KINDS: readonly IssueWorkflowKind[] = [
  'feature', 'bugfix', 'documentation', 'chore', 'help', 'hotfix', 'release',
];

/** Canonical values shared by admission, form inspection and deterministic readers. */
export const ISSUE_WORKFLOW_RELEASE_TYPES = Object.freeze(['Patch', 'Minor', 'Major'] as const);
export function parseIssueWorkflowReleaseType(value: string): typeof ISSUE_WORKFLOW_RELEASE_TYPES[number] | undefined {
  return ISSUE_WORKFLOW_RELEASE_TYPES.find(type => type.toLowerCase() === value.trim().toLowerCase());
}

export interface IssueWorkflowDefinition {
  readonly id: IssueWorkflowKind;
  readonly label: string;
  readonly formFile: string;
  readonly nativeIssueType: 'Feature' | 'Bug' | 'Documentation' | 'Maintenance' | 'Question' | 'Help' | 'Hotfix' | 'Release';
  readonly labels: readonly string[];
  readonly branchManaged: boolean;
  readonly requiredHeadings: readonly string[];
  readonly requiredValueHeadings: readonly string[];
}

export const ISSUE_WORKFLOW_CATALOG: Readonly<Record<IssueWorkflowKind, IssueWorkflowDefinition>> = {
  feature: {
    id: 'feature', label: 'Feature', formFile: 'feature_request.yml', nativeIssueType: 'Feature', labels: ['feature', 'enhancement'], branchManaged: true,
    requiredHeadings: ['Description of the idea or improvement', 'Current limitations or challenges', 'Expected impact'],
    requiredValueHeadings: ['Description of the idea or improvement', 'Current limitations or challenges', 'Expected impact'],
  },
  bugfix: {
    id: 'bugfix', label: 'Bug fix', formFile: 'bug_report.yml', nativeIssueType: 'Bug', labels: ['bugfix', 'bug'], branchManaged: true,
    requiredHeadings: ['Description', 'Reproducing the issue', 'copilot Version'],
    requiredValueHeadings: ['Description', 'Reproducing the issue', 'copilot Version'],
  },
  documentation: {
    id: 'documentation', label: 'Documentation', formFile: 'doc_update.yml', nativeIssueType: 'Documentation', labels: ['documentation', 'docs'], branchManaged: true,
    requiredHeadings: ['Describe the documentation update', 'Why is this update needed?'],
    requiredValueHeadings: ['Describe the documentation update', 'Why is this update needed?'],
  },
  chore: {
    id: 'chore', label: 'Chore / maintenance', formFile: 'chore_task.yml', nativeIssueType: 'Maintenance', labels: ['chore', 'maintenance'], branchManaged: true,
    requiredHeadings: ['Task description', 'Current issues or inefficiencies', 'Expected impact'],
    requiredValueHeadings: ['Task description', 'Current issues or inefficiencies', 'Expected impact'],
  },
  help: {
    id: 'help', label: 'Help / question', formFile: 'help_request.yml', nativeIssueType: 'Help', labels: ['help', 'question'], branchManaged: false,
    requiredHeadings: ['Describe your problem or question'],
    requiredValueHeadings: ['Describe your problem or question'],
  },
  hotfix: {
    id: 'hotfix', label: 'Hotfix', formFile: 'hotfix.yml', nativeIssueType: 'Hotfix', labels: ['hotfix'], branchManaged: true,
    requiredHeadings: ['Base Version', 'Hotfix Version', 'Issue Description', 'Hotfix Solution', 'Additional Context'],
    requiredValueHeadings: ['Issue Description', 'Hotfix Solution'],
  },
  release: {
    id: 'release', label: 'Release', formFile: 'release.yml', nativeIssueType: 'Release', labels: ['release'], branchManaged: true,
    requiredHeadings: ['Release Type', 'Release Version', 'Changelog', 'Additional Context'],
    requiredValueHeadings: ['Release Type', 'Changelog'],
  },
};

export interface IssueWorkflowProfile {
  readonly schemaVersion: 1 | 2;
  readonly enabled: readonly IssueWorkflowKind[];
  readonly fieldMappings?: WorkflowFieldMappings<IssueWorkflowKind>;
}

const ISSUE_WORKFLOW_PROFILE_MAX_BYTES = 4096;
const ISSUE_WORKFLOW_PROFILE_KEYS = new Set(['schemaVersion', 'enabled', 'fieldMappings']);

export type IssueWorkflowProfileParseResult =
  | { readonly profile: IssueWorkflowProfile }
  | { readonly error: string };

export type IssueWorkflowAdmission =
  | { readonly status: 'eligible'; readonly kind: IssueWorkflowKind }
  | { readonly status: 'unmanaged'; readonly reason: 'no-recognized-kind' }
  | { readonly status: 'disabled'; readonly kind: IssueWorkflowKind }
  | { readonly status: 'conflict'; readonly kinds: readonly IssueWorkflowKind[] }
  | {
      readonly status: 'invalid';
      readonly kind: IssueWorkflowKind;
      readonly missingHeadings: readonly string[];
      readonly invalidFields?: readonly string[];
    };

export interface IssueWorkflowLabelConfiguration {
  readonly feature?: readonly string[];
  readonly bugfix?: readonly string[];
  readonly documentation?: readonly string[];
  readonly chore?: readonly string[];
  readonly help?: readonly string[];
  readonly hotfix?: readonly string[];
  readonly release?: readonly string[];
}

export const ALL_ISSUE_WORKFLOWS: IssueWorkflowProfile = Object.freeze({
  schemaVersion: 1,
  enabled: Object.freeze([...ISSUE_WORKFLOW_KINDS]),
});

export function createIssueWorkflowProfile(enabled: readonly IssueWorkflowKind[], fieldMappings?: WorkflowFieldMappings<IssueWorkflowKind>): IssueWorkflowProfile {
  const selected = new Set(enabled);
  const ordered = ISSUE_WORKFLOW_KINDS.filter(kind => selected.has(kind));
  const mappings = normalizeWorkflowFieldMappings(fieldMappings, ISSUE_WORKFLOW_CATALOG, ordered);
  return Object.freeze({
    schemaVersion: mappings ? 2 as const : 1 as const,
    enabled: Object.freeze(ordered),
    ...(mappings ? { fieldMappings: mappings } : {}),
  });
}

/** Empty input selects all workflows with the same admission checks as an explicit profile. */
export function parseIssueWorkflowProfile(raw: string | undefined): IssueWorkflowProfileParseResult {
  if (!raw?.trim()) return { profile: ALL_ISSUE_WORKFLOWS };
  if (Buffer.byteLength(raw, 'utf8') > ISSUE_WORKFLOW_PROFILE_MAX_BYTES) {
    return { error: `Issue workflow profile must not exceed ${ISSUE_WORKFLOW_PROFILE_MAX_BYTES} bytes.` };
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { error: 'Issue workflow profile must be valid JSON.' }; }
  if (hasDuplicateJsonObjectKeys(raw)) return { error: 'Issue workflow profile cannot contain duplicate JSON keys.' };
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: 'Issue workflow profile must be an object.' };
  const value = parsed as Record<string, unknown>;
  const unknownKeys = Object.keys(value).filter(key => !ISSUE_WORKFLOW_PROFILE_KEYS.has(key));
  if (unknownKeys.length > 0) return { error: `Unknown issue workflow profile field(s): ${unknownKeys.join(', ')}.` };
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) return { error: 'Issue workflow profile schemaVersion must be 1 or 2.' };
  if (value.schemaVersion === 1 && value.fieldMappings !== undefined) return { error: 'Issue field mappings require profile schemaVersion 2.' };
  if (value.schemaVersion === 2 && value.fieldMappings === undefined) return { error: 'Profile schemaVersion 2 requires explicit fieldMappings.' };
  if (!Array.isArray(value.enabled) || value.enabled.some(item => typeof item !== 'string')) {
    return { error: 'Issue workflow profile enabled must be an array of workflow IDs.' };
  }
  const enabled = value.enabled as string[];
  const unknown = enabled.filter(kind => !ISSUE_WORKFLOW_KINDS.includes(kind as IssueWorkflowKind));
  if (unknown.length > 0) return { error: `Unknown issue workflow(s): ${unknown.join(', ')}.` };
  if (new Set(enabled).size !== enabled.length) return { error: 'Issue workflow profile cannot contain duplicate workflow IDs.' };
  try {
    const profile = createIssueWorkflowProfile(enabled as IssueWorkflowKind[], value.fieldMappings as WorkflowFieldMappings<IssueWorkflowKind> | undefined);
    if (value.schemaVersion === 2 && profile.schemaVersion !== 2) return { error: 'Profile schemaVersion 2 requires nonempty fieldMappings.' };
    return { profile };
  } catch (cause) { return { error: (cause as Error).message }; }
}

export function serializeIssueWorkflowProfile(profile: IssueWorkflowProfile): string {
  return JSON.stringify(createIssueWorkflowProfile(profile.enabled, profile.fieldMappings));
}

export function classifyIssueWorkflow(
  labels: readonly string[],
  profile: IssueWorkflowProfile = ALL_ISSUE_WORKFLOWS,
  labelConfiguration: IssueWorkflowLabelConfiguration = {},
  body?: string,
  validateBody = true,
): IssueWorkflowAdmission {
  const normalized = new Set(labels.map(label => label.trim().toLowerCase()).filter(Boolean));
  const kinds = ISSUE_WORKFLOW_KINDS.filter(kind => {
    const configured = (labelConfiguration[kind] ?? []).filter(label => label.trim().length > 0);
    const candidates = configured.length > 0 ? configured : ISSUE_WORKFLOW_CATALOG[kind].labels;
    return candidates.some(label => normalized.has(label.trim().toLowerCase()));
  });
  if (kinds.length === 0) return { status: 'unmanaged', reason: 'no-recognized-kind' };
  if (kinds.length > 1) return { status: 'conflict', kinds };
  const kind = kinds[0];
  if (!profile.enabled.includes(kind)) return { status: 'disabled', kind };
  if (!validateBody) return { status: 'eligible', kind };
  const issueBody = body ?? '';
  const requiredHeadings = issueWorkflowRequiredHeadings(profile, kind);
  const sections = readIssueWorkflowFields(issueBody, requiredHeadings);
  const duplicateHeadings = sections.filter(field => field.count > 1).map(field => field.heading);
  if (duplicateHeadings.length > 0) {
    return { status: 'invalid', kind, missingHeadings: [], invalidFields: duplicateHeadings.map(heading => `${heading} (duplicate)`) };
  }
  const missingHeadings = sections.filter(field => field.count === 0).map(field => field.heading);
  if (missingHeadings.length > 0) return { status: 'invalid', kind, missingHeadings };
  const invalidFields = invalidIssueWorkflowFields(kind, new Map(sections.map(field => [field.heading, field.value])), profile);
  if (invalidFields.length > 0) return { status: 'invalid', kind, missingHeadings: [], invalidFields };
  return { status: 'eligible', kind };
}

export function hasMarkdownHeading(body: string, heading: string): boolean {
  return readIssueWorkflowFields(body, [heading])[0].count > 0;
}

export function issueWorkflowFormFiles(profile: IssueWorkflowProfile): readonly string[] {
  return ISSUE_WORKFLOW_KINDS.filter(kind => profile.enabled.includes(kind)).map(kind => ISSUE_WORKFLOW_CATALOG[kind].formFile);
}

function invalidIssueWorkflowFields(kind: IssueWorkflowKind, fields: ReadonlyMap<string, string>, profile: IssueWorkflowProfile): readonly string[] {
  const mapped = (heading: string) => issueWorkflowHeading(profile, kind, heading);
  // Classification already proved every required heading is present and unique.
  const value = (heading: string) => fields.get(mapped(heading))!;
  const invalid: string[] = [];
  if (kind === 'release') {
    if (!parseIssueWorkflowReleaseType(value('Release Type'))) invalid.push(mapped('Release Type'));
    if (!value('Changelog')) invalid.push(mapped('Changelog'));
    if (!isAutomaticOrVersion(value('Release Version'))) invalid.push(mapped('Release Version'));
  }
  if (kind === 'hotfix') {
    if (!isAutomaticOrVersion(value('Base Version'))) invalid.push(mapped('Base Version'));
    if (!isAutomaticOrVersion(value('Hotfix Version'))) invalid.push(mapped('Hotfix Version'));
    if (!value('Issue Description')) invalid.push(mapped('Issue Description'));
    if (!value('Hotfix Solution')) invalid.push(mapped('Hotfix Solution'));
  }
  for (const heading of ISSUE_WORKFLOW_CATALOG[kind].requiredValueHeadings) {
    if (!value(heading) && !invalid.includes(mapped(heading))) invalid.push(mapped(heading));
  }
  return invalid;
}

export function isAutomaticOrVersion(value: string): boolean {
  return /^automatic$/iu.test(value) || /^v?\d+\.\d+\.\d+$/u.test(value);
}


export function issueWorkflowHeading(profile: IssueWorkflowProfile, kind: IssueWorkflowKind, canonical: string): string {
  return profile.fieldMappings?.[kind]?.[canonical] ?? canonical;
}
export function issueWorkflowRequiredHeadings(profile: IssueWorkflowProfile, kind: IssueWorkflowKind): readonly string[] {
  return Object.freeze(ISSUE_WORKFLOW_CATALOG[kind].requiredHeadings.map(heading => issueWorkflowHeading(profile, kind, heading)));
}
export type IssueWorkflowFieldMappings = WorkflowFieldMappings<IssueWorkflowKind>;
