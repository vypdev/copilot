import { isSddMarkdownLinkExample } from './sdd_visible_references';

/** Immutable Git facts, never filesystem queries or model-provided existence. */
export interface SddRepositoryInventory {
  readonly files: ReadonlySet<string>;
  readonly directories: ReadonlySet<string>;
  readonly blocked: ReadonlySet<string>;
}

export interface SddReferenceIndex {
  readonly inventory: SddRepositoryInventory;
  readonly proposed: ReadonlySet<string>;
  readonly futureDirectories: ReadonlySet<string>;
  readonly roots: ReadonlySet<string>;
}

/** Keep the existing repository spelling contract; protocol recognition never rewrites it. */
export function isSafeSddRepositoryPath(value: string): boolean {
  return value.length > 0 && !/[\\:*?"<>|\p{Cc}]/u.test(value)
    && value.split('/').every(segment => segment && segment !== '.' && segment !== '..' && segment.toLowerCase() !== '.git');
}

/** Call only after strict Path/Change validation; directories are constructive ancestry, not declarations. */
export function buildSddReferenceIndex(inventory: SddRepositoryInventory, proposed: ReadonlySet<string>): SddReferenceIndex {
  const roots = new Set<string>();
  for (const paths of [inventory.files, inventory.directories, inventory.blocked]) {
    for (const path of paths) roots.add(path.split('/')[0]);
  }
  const futureDirectories = new Set<string>();
  for (const file of proposed) {
    for (let end = file.lastIndexOf('/'); end > 0; end = file.lastIndexOf('/', end - 1)) {
      futureDirectories.add(file.slice(0, end));
    }
  }
  return { inventory, proposed, roots, futureDirectories };
}

export function hasBlockedSddAncestor(value: string, index: SddReferenceIndex): boolean {
  // Check immutable blocked entries rather than repeatedly joining an untrusted
  // value's prefixes: a long slash-bearing span must not cause quadratic work.
  for (const blocked of index.inventory.blocked) {
    if (value === blocked || value.startsWith(`${blocked}/`)) return true;
  }
  return false;
}

// IANA Top-Level Media Types, reviewed 2026-11-03; no runtime registry/network access.
// https://www.iana.org/assignments/top-level-media-types
const MEDIA_TYPES: ReadonlySet<string> = new Set([
  'application', 'audio', 'example', 'font', 'haptics', 'image', 'message', 'model', 'multipart', 'text', 'video',
]);
const MEDIA_NAME = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/iu;

function mediaNotation(value: string): boolean {
  const essence = value.split(';', 1)[0];
  const [type, subtype, extra] = essence.split('/');
  return extra === undefined && ((type === '*' && subtype === '*')
    || (MEDIA_TYPES.has(type.toLowerCase()) && (subtype === '*' || MEDIA_NAME.test(subtype ?? ''))));
}

/** URL/URI labels describe a non-file role, including file-shaped emitted assets. */
function urlRole(prefix: string): boolean {
  return /\b(?:(?:URL|URI)(?:[ \t]+path)?|HTTP(?:[ \t]+(?:endpoint|route))?)\s*[:=]?\s*$/iu.test(prefix.replace(/[*_]/gu, ''));
}

export function isSddFileRole(prefix: string): boolean {
  return /\b(?:file|path|archivo|ruta)\s*[:=]?\s*$/iu.test(prefix.replace(/[*_]/gu, ''));
}

export function isKnownSddRepositoryReference(value: string, index: SddReferenceIndex): boolean {
  const path = value.replace(/\/$/u, '');
  return index.inventory.files.has(path) || index.inventory.directories.has(path) || index.proposed.has(path)
    || index.futureDirectories.has(path) || hasBlockedSddAncestor(path, index);
}

/**
 * Not a protocol validator or an existence grant. Explicit Markdown destinations
 * and Path/Change rows bypass this heuristic and always receive strict checks.
 */
export function isSddNonFileNotation(value: string, prefix: string, index: SddReferenceIndex): boolean {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/)/iu.test(value)) return true;
  if (isKnownSddRepositoryReference(value, index)) return false;
  if (!/\s|[\p{Cc}]/u.test(value) && urlRole(prefix)) return true;
  if (isSddFileRole(prefix)) return false;
  if (isSddMarkdownLinkExample(value)) return true;
  if (mediaNotation(value)) return true;
  if (/^(?:GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS|TRACE|CONNECT)\s+\S+$/u.test(value)) return true;
  if (/^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9_][a-z0-9._-]*)*$/iu.test(value)
    && isSafeSddRepositoryPath(value)) return true;
  // Extensionless unknown namespaces are not evidence of a repository citation.
  // Known roots, file-shaped names and explicit directory spellings remain checked.
  const parts = value.split('/');
  return parts.length > 1 && !index.roots.has(parts[0])
    && parts.every(part => /^[a-z0-9_][a-z0-9_-]*$/iu.test(part));
}

export function sddReferencePrefix(source: string, offset: number): string {
  let end = offset;
  while (end > 0 && /[ \t*_: =]/u.test(source[end - 1])) end--;
  const tail = source.slice(Math.max(0, end - 16), end);
  return tail.slice(tail.lastIndexOf('\n') + 1);
}

/** Keep streaming label context bounded, including a separator across formatted text leaves. */
export function appendSddReferenceContext(previous: string, value: string): string {
  const combined = previous + value;
  return sddReferencePrefix(combined, combined.length) + (/[ \t*_: =]$/u.test(combined) ? ' ' : '');
}
