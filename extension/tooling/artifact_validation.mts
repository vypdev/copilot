import ts from 'typescript';
import { isDeepStrictEqual } from 'node:util';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { targetManifest } from '../src/infrastructure/target_manifests.ts';
import { TARGETS, type BrowserTarget } from '../src/domain/target.ts';
import { FoundationGateError } from './gate_error.mts';

export const ASSETS = ['background.js', 'content.js', 'manifest.json'] as const;

export function validateTarget(target: BrowserTarget, files: ReadonlyMap<string, string>): void {
    if (!isDeepStrictEqual([...files.keys()].sort(), [...ASSETS])) throw new FoundationGateError(`${target}: undeclared-or-missing-asset`);
    const raw = files.get('manifest.json')!;
    let manifest: unknown;
    try { manifest = JSON.parse(raw); } catch { throw new FoundationGateError(`${target}: malformed-manifest`); }
    if (!isDeepStrictEqual(manifest, targetManifest(target)) || raw !== `${JSON.stringify(manifest, null, 2)}\n`) {
        throw new FoundationGateError(`${target}: manifest-drift (permissions, hosts, identity, background or canonical JSON)`);
    }
    for (const name of ['background.js', 'content.js']) {
        const text = files.get(name)!;
        if (Buffer.byteLength(text) > 1024 * 1024) throw new FoundationGateError(`${target}/${name}: bundle-size`);
        const syntax = ts.transpileModule(text, { fileName: name, reportDiagnostics: true,
            compilerOptions: { target: ts.ScriptTarget.ES2022, allowJs: true } }).diagnostics!;
        if (syntax.length) throw new FoundationGateError(`${target}/${name}: bundle-syntax`);
        const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        const forbidden = new Set(['eval', 'Function', 'require', 'process', 'Buffer', '__dirname', '__filename',
            'module', 'document', 'fetch', 'XMLHttpRequest', 'WebSocket', 'chrome', 'browser']);
        function visit(node: ts.Node): void {
            if ((ts.isIdentifier(node) && forbidden.has(node.text))
                || ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
                || (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)) {
                throw new FoundationGateError(`${target}/${name}: forbidden-executable-or-runtime`);
            }
            ts.forEachChild(node, visit);
        }
        visit(source);
    }
}

export async function readTarget(directory: string): Promise<Map<string, string>> {
    const entries = await readdir(directory, { withFileTypes: true });
    if (entries.some(entry => !entry.isFile() || entry.isSymbolicLink())) throw new FoundationGateError('artifact-boundary: regular files only');
    return new Map(await Promise.all(entries.map(async entry => [entry.name, await readFile(path.join(directory, entry.name), 'utf8')] as const)));
}

export async function validateArtifactSet(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    if (!isDeepStrictEqual(entries.map(entry => entry.name).sort(), ['chrome', 'firefox', 'receipt.json', 'safari'])
        || entries.some(entry => entry.isSymbolicLink() || (entry.name === 'receipt.json' ? !entry.isFile() : !entry.isDirectory()))) {
        throw new FoundationGateError('artifact-set: incomplete or unexpected target set');
    }
    for (const target of TARGETS) validateTarget(target, await readTarget(path.join(directory, target)));
}
