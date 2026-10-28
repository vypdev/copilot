import ts from 'typescript';
import { isDeepStrictEqual } from 'node:util';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { targetManifest } from '../src/infrastructure/target_manifests.ts';
import { TARGETS, type BrowserTarget } from '../src/domain/target.ts';
import { RUNTIME_HTML } from './static_assets.mts';
import { FoundationGateError } from './gate_error.mts';

export const ASSETS = ['background.js', 'content.js', 'manifest.json', 'runtime.html', 'runtime.js'] as const;

export function assetHashes(files: ReadonlyMap<string, string>): Record<string, string> {
    return Object.fromEntries(ASSETS.map(file => [file, createHash('sha256').update(files.get(file)!).digest('hex')]));
}

function readReceipt(raw: string): Record<string, unknown> {
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new FoundationGateError('receipt: malformed JSON'); }
    const object = (item: unknown): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item);
    if (!object(value) || Buffer.byteLength(raw) > 16 * 1024
        || !isDeepStrictEqual(Object.keys(value).sort(), ['evidence', 'schemaVersion', 'sourceRevision', 'sourceTreeSha256', 'targets'])
        || value.schemaVersion !== 1 || value.evidence !== 'development-build-only'
        || typeof value.sourceRevision !== 'string' || !/^[a-f0-9]{40}$(?![\s\S])/u.test(value.sourceRevision)
        || typeof value.sourceTreeSha256 !== 'string' || !/^[a-f0-9]{64}$(?![\s\S])/u.test(value.sourceTreeSha256)
        || !object(value.targets) || !isDeepStrictEqual(Object.keys(value.targets).sort(), [...TARGETS])
        || raw !== `${JSON.stringify(value, null, 2)}\n`) throw new FoundationGateError('receipt: invalid closed metadata');
    return value.targets;
}

export function validateTarget(target: BrowserTarget, files: ReadonlyMap<string, string>): void {
    if (!isDeepStrictEqual([...files.keys()].sort(), [...ASSETS])) throw new FoundationGateError(`${target}: undeclared-or-missing-asset`);
    const raw = files.get('manifest.json')!;
    let manifest: unknown;
    try { manifest = JSON.parse(raw); } catch { throw new FoundationGateError(`${target}: malformed-manifest`); }
    if (!isDeepStrictEqual(manifest, targetManifest(target)) || raw !== `${JSON.stringify(manifest, null, 2)}\n`) {
        throw new FoundationGateError(`${target}: manifest-drift (permissions, hosts, identity, background or canonical JSON)`);
    }
    if (files.get('runtime.html') !== RUNTIME_HTML) throw new FoundationGateError(`${target}: runtime-page-drift`);
    for (const name of ['background.js', 'content.js', 'runtime.js']) {
        const text = files.get(name)!;
        if (Buffer.byteLength(text) > 1024 * 1024) throw new FoundationGateError(`${target}/${name}: bundle-size`);
        const syntax = ts.transpileModule(text, { fileName: name, reportDiagnostics: true,
            compilerOptions: { target: ts.ScriptTarget.ES2022, allowJs: true } }).diagnostics!;
        if (syntax.length) throw new FoundationGateError(`${target}/${name}: bundle-syntax`);
        const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
        const forbidden = new Set(['eval', 'Function', 'require', 'process', 'Buffer', '__dirname', '__filename',
            'module', 'XMLHttpRequest', 'WebSocket']);
        if (name !== 'background.js') forbidden.add('fetch');
        if (name === 'background.js') forbidden.add('document');
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
    return new Map(await Promise.all(entries.map(async entry => {
        const bytes = await readFile(path.join(directory, entry.name));
        const text = bytes.toString('utf8');
        if (!Buffer.from(text, 'utf8').equals(bytes)) throw new FoundationGateError('artifact-boundary: valid UTF-8 text required');
        return [entry.name, text] as const;
    })));
}

export async function validateArtifactSet(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    if (!isDeepStrictEqual(entries.map(entry => entry.name).sort(), ['chrome', 'firefox', 'receipt.json', 'safari'])
        || entries.some(entry => entry.isSymbolicLink() || (entry.name === 'receipt.json' ? !entry.isFile() : !entry.isDirectory()))) {
        throw new FoundationGateError('artifact-set: incomplete or unexpected target set');
    }
    const recorded = readReceipt(await readFile(path.join(directory, 'receipt.json'), 'utf8'));
    for (const target of TARGETS) {
        const files = await readTarget(path.join(directory, target));
        validateTarget(target, files);
        if (!isDeepStrictEqual(recorded[target], assetHashes(files))) throw new FoundationGateError(`${target}: receipt-hash-mismatch`);
    }
}
