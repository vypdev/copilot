import { lstat, open, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { record } from '../src/domain/value.ts';
import { safariContainerProfile, type SafariContainerKind } from './safari_profile.mts';

export const MAX_SAFARI_PROJECT_BYTES = 1024 * 1024;
export type SafariProjectFormat = 'pbx' | 'jsonc';
/** Normalize only Apple's generated local scratch project; never execute project text. */
export function normalizeSafariProject(format: SafariProjectFormat, source: unknown, kind: SafariContainerKind = 'h2'): string {
    const profile = safariContainerProfile(kind);
    if (typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > MAX_SAFARI_PROJECT_BYTES) throw new Error('prerequisite:safari-project-size');
    const originalId = `invalid.extensions.copilot.${profile.appName}`;
    if (format === 'pbx') {
        if ((!source.includes(originalId) && !source.includes(profile.identifier)) || !/\bMARKETING_VERSION\s*=\s*(?:1\.0|0\.1\.0)\s*;/u.test(source)) {
            throw new Error('prerequisite:safari-project-identity-or-version');
        }
        return source.replaceAll(originalId, profile.identifier).replace(/\bMARKETING_VERSION\s*=\s*1\.0\s*;/gu, 'MARKETING_VERSION = 0.1.0;');
    }
    if (format !== 'jsonc') throw new Error('prerequisite:safari-project-format');
    const parsed = ts.parseConfigFileTextToJson('project.xcproj', source);
    if (parsed.error || !record(parsed.config) || !Array.isArray(parsed.config.targets) || parsed.config.targets.length !== 2) {
        throw new Error('prerequisite:safari-project-json');
    }
    const names = new Set<string>();
    for (const target of parsed.config.targets) {
        if (!record(target) || typeof target.name !== 'string' || names.has(target.name)) throw new Error('prerequisite:safari-project-target');
        const extension = target.name === `${profile.appName} Extension`;
        const settings = target['build-settings'];
        if ((!extension && target.name !== profile.appName) || target['product-type'] !== (extension ? 'app-extension' : 'application') || !record(settings)) {
            throw new Error('prerequisite:safari-project-target');
        }
        const id = extension ? `${profile.identifier}.Extension` : profile.identifier;
        if (![id, extension ? `${profile.identifier}.Extension` : originalId].includes(settings.PRODUCT_BUNDLE_IDENTIFIER as string)
            || !['1.0', '0.1.0'].includes(settings.MARKETING_VERSION as string)) throw new Error('prerequisite:safari-project-identity-or-version');
        names.add(target.name); settings.PRODUCT_BUNDLE_IDENTIFIER = id; settings.MARKETING_VERSION = '0.1.0';
    }
    return JSON.stringify(parsed.config, null, 2) + '\n';
}
async function projectStat(file: string) {
    try { return await lstat(file, { bigint: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return null; throw error; }
}
export async function prepareSafariProject(project: string, kind: SafariContainerKind = 'h2'): Promise<SafariProjectFormat> {
    const layouts = [['pbx', 'project.pbxproj'], ['jsonc', 'project.xcproj']] as const;
    const files = await Promise.all(layouts.map(async ([format, name]) => ({ format, file: path.join(project, name), stat: await projectStat(path.join(project, name)) })));
    const present = files.filter(value => value.stat !== null);
    if (present.length !== 1) throw new Error('prerequisite:safari-project-missing-or-ambiguous');
    const selected = present[0];
    const inspected = selected.stat!;
    if (!inspected.isFile()) throw new Error('prerequisite:safari-project-not-regular');
    if (inspected.size > BigInt(MAX_SAFARI_PROJECT_BYTES)) throw new Error('prerequisite:safari-project-size');
    const source = await readFile(selected.file, { encoding: 'utf8', flag: constants.O_RDONLY | constants.O_NOFOLLOW });
    const normalized = normalizeSafariProject(selected.format, source, kind);
    // Open without truncation so the descriptor can be checked before mutating the scratch file.
    const handle = await open(selected.file, constants.O_WRONLY | constants.O_NOFOLLOW);
    try {
        const opened = await handle.stat({ bigint: true });
        if (!opened.isFile() || opened.dev !== inspected.dev || opened.ino !== inspected.ino) throw new Error('prerequisite:safari-project-not-regular');
        await handle.writeFile(normalized, 'utf8');
        await handle.truncate(Buffer.byteLength(normalized));
    } finally { await handle.close(); }
    return selected.format;
}
