/** Closed compatibility facts; repository/model content never becomes recovery prose. */
export const SDD_CATALOG_COMPATIBILITY_REASONS = Object.freeze([
  'invalid-json', 'invalid-document', 'unsupported-profile', 'ambiguous-profile', 'invalid-metadata', 'owner-paths-invalid',
] as const);
export type SddCatalogCompatibilityReason = typeof SDD_CATALOG_COMPATIBILITY_REASONS[number];

export class SddCatalogCompatibilityFailure extends Error {
  constructor(readonly reason: SddCatalogCompatibilityReason, readonly sourceCommit?: string) {
    if (!SDD_CATALOG_COMPATIBILITY_REASONS.includes(reason)) throw new TypeError('Invalid closed SDD catalog compatibility reason.');
    if (sourceCommit !== undefined && !/^[a-f0-9]{40}$/u.test(sourceCommit)) throw new TypeError('Invalid SDD catalog source revision.');
    super(`The SDD catalog is incompatible with the installed publication profile (${reason}).`);
    this.name = 'SddCatalogCompatibilityFailure';
    Object.freeze(this);
  }
}


export interface SddCatalogCapability {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly scope: string;
  readonly owner: string;
  readonly lastVerified: string;
  readonly specs: readonly string[];
  readonly workflows: readonly string[];
  readonly entrypoints: readonly string[];
  readonly code: readonly string[];
  readonly tests: readonly string[];
  readonly documentation: readonly string[];
}

export interface SupportedSddCatalog {
  readonly profile: 'sdk-v1';
  /** Kept in the adapter for lossless writes; never used as model-selected catalog data. */
  readonly document: Readonly<Record<string, unknown>> & {
    readonly version: 1;
    readonly capabilities: readonly (SddCatalogCapability & Readonly<Record<string, unknown>>)[];
  };
  readonly capabilities: readonly SddCatalogCapability[];
}

const PATH_FIELDS = ['specs', 'workflows', 'entrypoints', 'code', 'tests', 'documentation'] as const;
const SDK_STATUSES = ['as-built-baseline', 'implemented', 'proposed', 'deprecated'];
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pathPolicy = require('./specification_catalog_path_policy.cjs') as {
  isSafeRelativePath(path: unknown): boolean;
  matchesFieldBoundary(field: string, path: string): boolean;
};

/** Existing owner paths keep the shared SDK catalog boundary, independent of proposed-path grammar. */
export function isSddCatalogOwnerPath(path: string): boolean {
  return pathPolicy.matchesFieldBoundary('specs', path);
}

/** Recognizes the installed publication dialect before any model or ownership operation. */
export function readSupportedSddCatalog(source: string): SupportedSddCatalog {
  if (source.length > 2_097_152) throw new SddCatalogCompatibilityFailure('invalid-document');
  let value: unknown;
  try { value = JSON.parse(source); }
  catch { throw new SddCatalogCompatibilityFailure('invalid-json'); }
  if (!record(value) || value.version !== 1 || !Array.isArray(value.capabilities)
    || value.capabilities.length === 0 || value.capabilities.length > 1000
    || value.capabilities.some(entry => !record(entry))) {
    throw new SddCatalogCompatibilityFailure('invalid-document');
  }
  const capabilities = value.capabilities as Record<string, unknown>[];
  const sdk = capabilities.some(entry => Object.prototype.hasOwnProperty.call(entry, 'specs'));
  const native = capabilities.some(entry => Object.prototype.hasOwnProperty.call(entry, 'specification'));
  if (sdk && native) throw new SddCatalogCompatibilityFailure('ambiguous-profile');
  // The installed writer cannot certify a repository-selected schema/validator.
  // Reject before rewriting its fields, statuses, evidence or readiness rules.
  if (native || Object.prototype.hasOwnProperty.call(value, '$schema')) throw new SddCatalogCompatibilityFailure('unsupported-profile');
  if (!sdk) throw new SddCatalogCompatibilityFailure('invalid-document');
  const ids = new Set<string>(); const titles = new Set<string>(); const owners = new Set<string>();
  const normalized = capabilities.map(entry => {
    if (!['id', 'title', 'status', 'scope', 'owner', 'lastVerified'].every(key => typeof entry[key] === 'string' && String(entry[key]).trim())
      || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(String(entry.id)) || ids.has(String(entry.id)) || titles.has(String(entry.title))
      || !SDK_STATUSES.includes(String(entry.status)) || !isoDate(String(entry.lastVerified))) {
      throw new SddCatalogCompatibilityFailure('invalid-metadata');
    }
    ids.add(String(entry.id)); titles.add(String(entry.title));
    for (const field of PATH_FIELDS) {
      const paths = entry[field];
      if (!Array.isArray(paths) || (field !== 'workflows' && paths.length === 0)
        || new Set(paths).size !== paths.length
        || paths.some(path => typeof path !== 'string' || !pathPolicy.isSafeRelativePath(path) || !pathPolicy.matchesFieldBoundary(field, path))) {
        throw new SddCatalogCompatibilityFailure('owner-paths-invalid');
      }
    }
    for (const path of entry.specs as string[]) {
      if (owners.has(path)) throw new SddCatalogCompatibilityFailure('owner-paths-invalid');
      owners.add(path);
    }
    return Object.freeze({
      id: entry.id as string, title: entry.title as string, status: entry.status as string,
      scope: entry.scope as string, owner: entry.owner as string, lastVerified: entry.lastVerified as string,
      ...Object.fromEntries(PATH_FIELDS.map(field => [field, Object.freeze([...(entry[field] as string[])])])),
    }) as unknown as SddCatalogCapability;
  });
  freezeDocument(value, 0);
  return Object.freeze({ profile: 'sdk-v1', document: value as SupportedSddCatalog['document'], capabilities: Object.freeze(normalized) });
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
function freezeDocument(value: unknown, depth: number): void {
  if (value !== null && typeof value === 'object') {
    if (depth > 20) throw new SddCatalogCompatibilityFailure('invalid-metadata');
    for (const item of Object.values(value)) freezeDocument(item, depth + 1);
    Object.freeze(value);
  }
}
