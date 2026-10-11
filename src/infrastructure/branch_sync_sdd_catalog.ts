import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

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
    try {
        const root = realpathSync(repositoryRoot);
        const specs = join(root, 'specs');
        if (!lstatSync(specs).isDirectory() || lstatSync(specs).isSymbolicLink()) return false;
        const metadataPath = join(root, SDD_CATALOG_PATH);
        const indexPath = join(root, SDD_CATALOG_INDEX_PATH);
        for (const path of [metadataPath, indexPath]) {
            const stat = lstatSync(path);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES) return false;
        }
        const catalog: unknown = JSON.parse(readFileSync(metadataPath, 'utf8'));
        // Reject links before the shared validator follows any evidence paths.
        const capabilities = (catalog as { capabilities?: { [key: string]: unknown }[] })?.capabilities;
        if (!Array.isArray(capabilities)) return false;
        for (const capability of capabilities) {
            for (const field of ['specs', 'workflows', 'entrypoints', 'code', 'tests', 'documentation']) {
                if (!Array.isArray(capability?.[field])) return false;
                for (const entry of capability[field]) {
                    if (typeof entry !== 'string') return false;
                    const file = join(root, entry);
                    const target = relative(root, realpathSync(file));
                    if (isAbsolute(entry) || !lstatSync(file).isFile() || target === '..' || target.startsWith(`..${sep}`) || isAbsolute(target)) return false;
                }
            }
        }
        if (validator.validateCatalog(root, catalog).length) return false;
        const expected = validator.renderCatalog(catalog);
        if (Buffer.byteLength(expected, 'utf8') > MAX_BYTES) return false;
        if (validator.normalizeCheckoutLineEndings(readFileSync(indexPath, 'utf8')) !== expected) writeFileSync(indexPath, expected, 'utf8');
        return true;
    } catch {
        return false;
    }
}
