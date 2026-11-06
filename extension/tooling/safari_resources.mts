import { constants } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const localization = /^[A-Za-z0-9_-]{1,64}\.lproj$(?![\s\S])/u;
const strings = /^[A-Za-z][A-Za-z0-9_-]{0,63}\.strings$(?![\s\S])/u;

/** Apple's native metadata is separate from the closed, complete web resource inventory. */
export async function readSafariResources(directory: string, expected: readonly string[]): Promise<Map<string, string>> {
    if (!(await lstat(directory)).isDirectory()) throw new Error('prerequisite:safari-container-resources-boundary');
    const declared = new Set(expected); const selected = new Map<string, string>();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory() && localization.test(entry.name)) {
            const metadata = await readdir(file, { withFileTypes: true });
            if (metadata.some(item => !item.isFile())) throw new Error('prerequisite:safari-container-resources-boundary');
            if (metadata.some(item => !strings.test(item.name))) throw new Error('prerequisite:safari-container-resources-extra');
            continue;
        }
        if (!entry.isFile()) throw new Error('prerequisite:safari-container-resources-boundary');
        if (!declared.has(entry.name)) {
            if (entry.name !== 'Assets.car') throw new Error('prerequisite:safari-container-resources-extra');
            continue;
        }
        const bytes = await readFile(file, { flag: constants.O_RDONLY | constants.O_NOFOLLOW });
        const text = bytes.toString('utf8');
        if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error('prerequisite:safari-container-resources-boundary');
        selected.set(entry.name, text);
    }
    if (selected.size !== declared.size) throw new Error('prerequisite:safari-container-resources-stale');
    return selected;
}
