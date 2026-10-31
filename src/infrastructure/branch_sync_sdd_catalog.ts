import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { logInfo } from '../application/ports/logging_ports';
import { allowsEmptySddCatalogPathField } from '../domain/sdd_catalog_compatibility';
import { BRANCH_SYNC_CATALOG_MAX_BYTES, SDK_CATALOG_PATH_FIELDS, catalogDiagnostic, classifyBranchSyncCatalog,
    type BranchSyncCatalogDiagnostic } from '../domain/branch_sync_catalog_diagnostic';

export const SDD_CATALOG_PATH = 'specs/catalog.json';
export const SDD_CATALOG_INDEX_PATH = 'specs/CATALOG.md';
// Only this Action's bundled validator/publisher can certify and write SDK output.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const validator = require('./specification_catalog_validator.cjs') as {
    validateCatalog(root: string, catalog: unknown): string[];
    renderCatalog(catalog: unknown): string;
    normalizeCheckoutLineEndings(source: string): string;
    isSafeRelativePath(value: unknown): boolean;
    matchesFieldBoundary(field: string, path: string): boolean;
    isRegularRepositoryFile(root: string, path: string): boolean;
    isIsoDate(value: unknown): boolean;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const publisher = require('./specification_catalog_publication.cjs') as {
    publishCatalogMarkdown(root: string, content: string): void;
};
export type BranchSyncCatalogRefresh = { readonly valid: true }
    | { readonly valid: false; readonly diagnostic: BranchSyncCatalogDiagnostic };

/** Stable, bounded descriptor read; never follow a metadata/index replacement link. */
function readCatalogFile(path: string): string {
    const before = lstatSync(path, { bigint: true });
    if (!before.isFile() || before.size > BigInt(BRANCH_SYNC_CATALOG_MAX_BYTES)) throw new Error('Catalog file boundary.');
    const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
        const opened = fstatSync(descriptor, { bigint: true });
        if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino
            || opened.size !== before.size || opened.mtimeNs !== before.mtimeNs) throw new Error('Catalog identity changed.');
        const bytes = Buffer.alloc(Number(opened.size) + 1);
        const size = readSync(descriptor, bytes, 0, bytes.length, 0);
        const after = fstatSync(descriptor, { bigint: true });
        if (size !== Number(opened.size) || after.size !== opened.size || after.mtimeNs !== opened.mtimeNs
            || after.nlink !== opened.nlink) throw new Error('Catalog changed during read.');
        return bytes.subarray(0, size).toString('utf8');
    } finally { closeSync(descriptor); }
}

function catalogRoot(repositoryRoot: string): string {
    const root = realpathSync(repositoryRoot);
    const specs = lstatSync(join(root, 'specs'));
    if (!specs.isDirectory() || specs.isSymbolicLink()) throw new Error('Catalog workspace boundary.');
    return root;
}

/** Classifies only; it cannot validate, render, write, stage or execute a repository. */
export function inspectBranchSyncCatalogSource(source: string): BranchSyncCatalogDiagnostic {
    if (Buffer.byteLength(source, 'utf8') > BRANCH_SYNC_CATALOG_MAX_BYTES) return catalogDiagnostic('catalog-file-boundary');
    if (/^(?:<{7}|={7}|>{7})(?: |$)/mu.test(source)) return catalogDiagnostic('metadata-conflict-markers');
    try { return classifyBranchSyncCatalog(JSON.parse(source)); }
    catch { return catalogDiagnostic('metadata-json'); }
}

export function inspectBranchSyncSddCatalogProfile(repositoryRoot: string): BranchSyncCatalogDiagnostic {
    let diagnostic = catalogDiagnostic('workspace-boundary');
    try {
        const root = catalogRoot(repositoryRoot);
        diagnostic = catalogDiagnostic('catalog-file-boundary');
        return inspectBranchSyncCatalogSource(readCatalogFile(join(root, SDD_CATALOG_PATH)));
    } catch { return diagnostic; }
}

/** Boolean compatibility wrapper retained for existing internal callers. */
export function refreshBranchSyncSddCatalog(repositoryRoot: string): boolean {
    return refreshBranchSyncSddCatalogDetailed(repositoryRoot).valid;
}

/** Refreshes only the already-authorized generated index; metadata is never rewritten. */
export function refreshBranchSyncSddCatalogDetailed(repositoryRoot: string): BranchSyncCatalogRefresh {
    return checkBranchSyncSddCatalog(repositoryRoot, true);
}

/** Certifies JSON-only resolutions without acquiring another path's write authority. */
export function validateBranchSyncSddCatalogDetailed(repositoryRoot: string): BranchSyncCatalogRefresh {
    return checkBranchSyncSddCatalog(repositoryRoot, false);
}

function checkBranchSyncSddCatalog(repositoryRoot: string, mayRefreshIndex: boolean): BranchSyncCatalogRefresh {
    let diagnostic = catalogDiagnostic('workspace-boundary');
    try {
        const root = catalogRoot(repositoryRoot);
        diagnostic = catalogDiagnostic('catalog-file-boundary');
        const metadata = readCatalogFile(join(root, SDD_CATALOG_PATH));
        diagnostic = inspectBranchSyncCatalogSource(metadata);
        if (diagnostic.profile !== 'sdk-v1' || diagnostic.phase !== 'profile-compatibility') return rejectCatalog(diagnostic);
        diagnostic = catalogDiagnostic('catalog-file-boundary', 'sdk-v1');
        const index = readCatalogFile(join(root, SDD_CATALOG_INDEX_PATH));
        const catalog = JSON.parse(metadata) as { capabilities: Record<string, unknown>[] };
        const ids = new Set<string>(), titles = new Set<string>(), owners = new Set<string>();
        for (const [position, capability] of catalog.capabilities.entries()) {
            for (const field of ['id', 'title', 'status', 'scope', 'owner', 'lastVerified'] as const) {
                diagnostic = catalogDiagnostic('catalog-contract', 'sdk-v1', field, position + 1);
                if (typeof capability[field] !== 'string' || !capability[field].trim()) return rejectCatalog(diagnostic);
            }
            diagnostic = catalogDiagnostic('catalog-contract', 'sdk-v1', 'status', position + 1);
            if (!['as-built-baseline', 'implemented', 'proposed', 'deprecated'].includes(String(capability.status))) return rejectCatalog(diagnostic);
            diagnostic = catalogDiagnostic('catalog-contract', 'sdk-v1', 'lastVerified', position + 1);
            if (!validator.isIsoDate(capability.lastVerified)) return rejectCatalog(diagnostic);
            diagnostic = catalogDiagnostic('catalog-contract', 'sdk-v1', 'id', position + 1);
            if (ids.has(String(capability.id))) return rejectCatalog(diagnostic);
            diagnostic = catalogDiagnostic('catalog-contract', 'sdk-v1', 'title', position + 1);
            if (titles.has(String(capability.title))) return rejectCatalog(diagnostic);
            ids.add(String(capability.id)); titles.add(String(capability.title));
            for (const field of SDK_CATALOG_PATH_FIELDS) {
                const entries = capability[field] as unknown[];
                diagnostic = catalogDiagnostic('catalog-contract', 'sdk-v1', field, position + 1);
                if ((!allowsEmptySddCatalogPathField(String(capability.status), field) && entries.length === 0)
                    || new Set(entries).size !== entries.length) return rejectCatalog(diagnostic);
                for (const entry of entries) {
                    diagnostic = catalogDiagnostic('evidence-shape', 'sdk-v1', field, position + 1);
                    if (typeof entry !== 'string') return rejectCatalog(diagnostic);
                    diagnostic = catalogDiagnostic('evidence-path-boundary', 'sdk-v1', field, position + 1);
                    if (!validator.isSafeRelativePath(entry) || !validator.matchesFieldBoundary(field, entry)
                        || !validator.isRegularRepositoryFile(root, entry)) return rejectCatalog(diagnostic);
                    diagnostic = catalogDiagnostic('catalog-contract', 'sdk-v1', field, position + 1);
                    if (field === 'specs') {
                        if (owners.has(entry)) return rejectCatalog(diagnostic);
                        owners.add(entry);
                    }
                }
            }
        }
        diagnostic = catalogDiagnostic('catalog-contract', 'sdk-v1');
        if (validator.validateCatalog(root, catalog).length) return rejectCatalog(diagnostic);
        diagnostic = catalogDiagnostic('index-output', 'sdk-v1');
        const expected = validator.renderCatalog(catalog);
        if (Buffer.byteLength(expected, 'utf8') > BRANCH_SYNC_CATALOG_MAX_BYTES) return rejectCatalog(diagnostic);
        if (validator.normalizeCheckoutLineEndings(index) !== expected) {
            if (!mayRefreshIndex) return rejectCatalog(diagnostic);
            publisher.publishCatalogMarkdown(root, expected);
        }
        return { valid: true };
    } catch { return rejectCatalog(diagnostic); }
}

function rejectCatalog(diagnostic: BranchSyncCatalogDiagnostic): Extract<BranchSyncCatalogRefresh, { valid: false }> {
    logInfo('Branch synchronization SDD catalog rejected (' + diagnostic.phase
        + '; profile=' + diagnostic.profile + '; capability=' + diagnostic.capabilityNumber + '; field=' + diagnostic.field + ').');
    return { valid: false, diagnostic };
}
