import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { logInfo } from '../application/ports/logging_ports';

export const SDD_CATALOG_PATH = 'specs/catalog.json';
export const SDD_CATALOG_INDEX_PATH = 'specs/CATALOG.md';
const MAX_BYTES = 10 * 1024 * 1024;
// Use the Action's bundled validator, never code loaded from the merged branch.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const validator = require('./specification_catalog_validator.cjs') as {
    validateCatalog(root: string, catalog: unknown): string[];
    renderCatalog(catalog: unknown): string;
    normalizeCheckoutLineEndings(source: string): string;
};

/** Refreshes one already-authorized generated file; it neither stages nor executes repository code. */
export function refreshBranchSyncSddCatalog(repositoryRoot: string): boolean {
    let phase: CatalogRejectionPhase = 'workspace-boundary';
    try {
        const root = realpathSync(repositoryRoot);
        const specs = join(root, 'specs');
        if (!lstatSync(specs).isDirectory() || lstatSync(specs).isSymbolicLink()) return rejectCatalog(phase);
        phase = 'catalog-file-boundary';
        const metadataPath = join(root, SDD_CATALOG_PATH);
        const indexPath = join(root, SDD_CATALOG_INDEX_PATH);
        for (const path of [metadataPath, indexPath]) {
            const stat = lstatSync(path);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) return rejectCatalog(phase);
        }
        phase = 'metadata-json';
        const metadata = readFileSync(metadataPath, 'utf8');
        if (/^(?:<{7}|={7}|>{7})(?: |$)/m.test(metadata)) phase = 'metadata-conflict-markers';
        const catalog: unknown = JSON.parse(metadata);
        // Reject links before the shared validator follows any evidence paths.
        const capabilities = (catalog as { capabilities?: { [key: string]: unknown }[] })?.capabilities;
        phase = 'metadata-shape';
        if (!Array.isArray(capabilities)) return rejectCatalog(phase);
        for (const capability of capabilities) {
            for (const field of ['specs', 'workflows', 'entrypoints', 'code', 'tests', 'documentation']) {
                phase = 'evidence-shape';
                if (!Array.isArray(capability?.[field])) return rejectCatalog(phase);
                for (const entry of capability[field]) {
                    phase = 'evidence-shape';
                    if (typeof entry !== 'string') return rejectCatalog(phase);
                    phase = 'evidence-path-boundary';
                    const file = join(root, entry);
                    const target = relative(root, realpathSync(file));
                    if (isAbsolute(entry) || !lstatSync(file).isFile() || target === '..' || target.startsWith(`..${sep}`) || isAbsolute(target)) return rejectCatalog(phase);
                }
            }
        }
        phase = 'catalog-contract';
        if (validator.validateCatalog(root, catalog).length) return rejectCatalog(phase);
        phase = 'index-output';
        const expected = validator.renderCatalog(catalog);
        if (Buffer.byteLength(expected, 'utf8') > MAX_BYTES) return rejectCatalog(phase);
        if (validator.normalizeCheckoutLineEndings(readFileSync(indexPath, 'utf8')) !== expected) writeFileSync(indexPath, expected, 'utf8');
        return true;
    } catch {
        return rejectCatalog(phase);
    }
}

type CatalogRejectionPhase = 'workspace-boundary' | 'catalog-file-boundary'
    | 'metadata-json' | 'metadata-conflict-markers' | 'metadata-shape'
    | 'evidence-shape' | 'evidence-path-boundary' | 'catalog-contract' | 'index-output';

function rejectCatalog(phase: CatalogRejectionPhase): false {
    logInfo(`Branch synchronization SDD catalog rejected (${phase}).`);
    return false;
}
