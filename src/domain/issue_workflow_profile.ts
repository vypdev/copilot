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
    requiredValueHeadings: ['Changelog'],
  },
};

export interface IssueWorkflowProfile {
  readonly schemaVersion: 1;
  readonly enabled: readonly IssueWorkflowKind[];
}

const ISSUE_WORKFLOW_PROFILE_MAX_BYTES = 4096;
const ISSUE_WORKFLOW_PROFILE_KEYS = new Set(['schemaVersion', 'enabled']);

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

export function createIssueWorkflowProfile(enabled: readonly IssueWorkflowKind[]): IssueWorkflowProfile {
  const selected = new Set(enabled);
  return Object.freeze({
    schemaVersion: 1 as const,
    enabled: Object.freeze(ISSUE_WORKFLOW_KINDS.filter(kind => selected.has(kind))),
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
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: 'Issue workflow profile must be an object.' };
  const value = parsed as Record<string, unknown>;
  const unknownKeys = Object.keys(value).filter(key => !ISSUE_WORKFLOW_PROFILE_KEYS.has(key));
  if (unknownKeys.length > 0) return { error: `Unknown issue workflow profile field(s): ${unknownKeys.join(', ')}.` };
  if (value.schemaVersion !== 1) return { error: 'Issue workflow profile schemaVersion must be 1.' };
  if (!Array.isArray(value.enabled) || value.enabled.some(item => typeof item !== 'string')) {
    return { error: 'Issue workflow profile enabled must be an array of workflow IDs.' };
  }
  const enabled = value.enabled as string[];
  const unknown = enabled.filter(kind => !ISSUE_WORKFLOW_KINDS.includes(kind as IssueWorkflowKind));
  if (unknown.length > 0) return { error: `Unknown issue workflow(s): ${unknown.join(', ')}.` };
  if (new Set(enabled).size !== enabled.length) return { error: 'Issue workflow profile cannot contain duplicate workflow IDs.' };
  return { profile: createIssueWorkflowProfile(enabled as IssueWorkflowKind[]) };
}

export function serializeIssueWorkflowProfile(profile: IssueWorkflowProfile): string {
  return JSON.stringify({ schemaVersion: 1, enabled: ISSUE_WORKFLOW_KINDS.filter(kind => profile.enabled.includes(kind)) });
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
  const requiredHeadings = ISSUE_WORKFLOW_CATALOG[kind].requiredHeadings;
  const duplicateHeadings = requiredHeadings.filter(heading => markdownHeadingCount(issueBody, heading) > 1);
  if (duplicateHeadings.length > 0) {
    return { status: 'invalid', kind, missingHeadings: [], invalidFields: duplicateHeadings.map(heading => `${heading} (duplicate)`) };
  }
  const missingHeadings = requiredHeadings.filter(heading => !hasMarkdownHeading(issueBody, heading));
  if (missingHeadings.length > 0) return { status: 'invalid', kind, missingHeadings };
  const invalidFields = invalidIssueWorkflowFields(kind, issueBody);
  if (invalidFields.length > 0) return { status: 'invalid', kind, missingHeadings: [], invalidFields };
  return { status: 'eligible', kind };
}

export function hasMarkdownHeading(body: string, heading: string): boolean {
  return markdownHeadingCount(body, heading) > 0;
}

export function issueWorkflowFormFiles(profile: IssueWorkflowProfile): readonly string[] {
  return ISSUE_WORKFLOW_KINDS.filter(kind => profile.enabled.includes(kind)).map(kind => ISSUE_WORKFLOW_CATALOG[kind].formFile);
}

function invalidIssueWorkflowFields(kind: IssueWorkflowKind, body: string): readonly string[] {
  const value = (heading: string) => markdownSectionValue(body, heading);
  const invalid: string[] = [];
  if (kind === 'release') {
    if (!/^(patch|minor|major)$/iu.test(value('Release Type'))) invalid.push('Release Type');
    if (!value('Changelog')) invalid.push('Changelog');
    if (!isAutomaticOrVersion(value('Release Version'))) invalid.push('Release Version');
  }
  if (kind === 'hotfix') {
    if (!isAutomaticOrVersion(value('Base Version'))) invalid.push('Base Version');
    if (!isAutomaticOrVersion(value('Hotfix Version'))) invalid.push('Hotfix Version');
    if (!value('Issue Description')) invalid.push('Issue Description');
    if (!value('Hotfix Solution')) invalid.push('Hotfix Solution');
  }
  for (const heading of ISSUE_WORKFLOW_CATALOG[kind].requiredValueHeadings) {
    if (!value(heading) && !invalid.includes(heading)) invalid.push(heading);
  }
  return invalid;
}

function markdownHeadingCount(body: string, heading: string): number {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...body.matchAll(new RegExp(`^#{1,6}\\s+${escaped}\\s*$`, 'gmi'))].length;
}

function markdownSectionValue(body: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingMatch = new RegExp(`^#{1,6}\\s+${escaped}\\s*$`, 'im').exec(body)!;
  const sectionStart = headingMatch.index + headingMatch[0].length;
  const remainder = body.slice(sectionStart);
  const nextHeading = /^#{1,6}\s+/im.exec(remainder);
  const section = nextHeading?.index === undefined ? remainder : remainder.slice(0, nextHeading.index);
  return section.replace(/<!--[\s\S]*?-->/g, '').trim();
}

function isAutomaticOrVersion(value: string): boolean {
  return /^automatic$/iu.test(value) || /^v?\d+\.\d+\.\d+$/u.test(value);
}
