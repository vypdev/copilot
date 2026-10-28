import { isDeepStrictEqual } from 'node:util';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { targetManifest } from '../src/infrastructure/target_manifests.ts';
import { TARGETS, type BrowserTarget } from '../src/domain/target.ts';
import { RUNTIME_HTML } from './static_assets.mts';
import { FoundationGateError } from './gate_error.mts';
import { CENTER_CHUNK, validateJavaScript } from './javascript_validation.mts';
import { validateStyles } from './style_validation.mts';

export const ASSETS = ['background.js', 'content.js', 'manifest.json', 'runtime.css', 'runtime.html', 'runtime.js'] as const;

export function assetHashes(files: ReadonlyMap<string, string>): Record<string, string> {
    return Object.fromEntries([...files.keys()].sort().map(file => [file, createHash('sha256').update(files.get(file)!).digest('hex')]));
}

function readReceipt(raw: string): Record<string, unknown> {
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new FoundationGateError('receipt: malformed JSON'); }
    const object = (item: unknown): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item);
    if (!object(value) || Buffer.byteLength(raw) > 128 * 1024
        || !isDeepStrictEqual(Object.keys(value).sort(), ['evidence', 'schemaVersion', 'sourceRevision', 'sourceTreeSha256', 'targets'])
        || value.schemaVersion !== 1 || value.evidence !== 'development-build-only'
        || typeof value.sourceRevision !== 'string' || !/^[a-f0-9]{40}$(?![\s\S])/u.test(value.sourceRevision)
        || typeof value.sourceTreeSha256 !== 'string' || !/^[a-f0-9]{64}$(?![\s\S])/u.test(value.sourceTreeSha256)
        || !object(value.targets) || !isDeepStrictEqual(Object.keys(value.targets).sort(), [...TARGETS])
        || raw !== `${JSON.stringify(value, null, 2)}\n`) throw new FoundationGateError('receipt: invalid closed metadata');
    return value;
}

export function validateTarget(target: BrowserTarget, files: ReadonlyMap<string, string>): void {
    const chunks = [...files.keys()].filter(name => CENTER_CHUNK.test(name));
    if (files.size > 96 || ASSETS.some(name => !files.has(name)) || files.size !== ASSETS.length + chunks.length
        || [...files.values()].reduce((total, text) => total + Buffer.byteLength(text), 0) > 8 * 1024 * 1024) throw new FoundationGateError(`${target}: undeclared-or-missing-asset`);
    if (new Set(chunks.map(name => name.slice(-19, -3))).size > 1) throw new FoundationGateError(`${target}: mixed-source-chunks`);
    const raw = files.get('manifest.json')!;
    let manifest: unknown;
    try { manifest = JSON.parse(raw); } catch { throw new FoundationGateError(`${target}: malformed-manifest`); }
    if (!isDeepStrictEqual(manifest, targetManifest(target)) || raw !== `${JSON.stringify(manifest, null, 2)}\n`) {
        throw new FoundationGateError(`${target}: manifest-drift (permissions, hosts, identity, background or canonical JSON)`);
    }
    if (files.get('runtime.html') !== RUNTIME_HTML) throw new FoundationGateError(`${target}: runtime-page-drift`);
    validateStyles(`${target}/runtime.css`, files.get('runtime.css')!);
    const graph = new Map<string, readonly string[]>();
    for (const name of ['background.js', 'content.js', 'runtime.js', ...chunks]) graph.set(name, validateJavaScript(target, name, files.get(name)!, files));
    const reached = new Set<string>();
    const visit = (name: string): void => { if (reached.has(name)) return; reached.add(name); for (const child of graph.get(name)!) visit(child); };
    visit('runtime.js');
    if (chunks.some(name => !reached.has(name))) throw new FoundationGateError(`${target}: unreachable-center-chunk`);
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
        const hashes = recorded.targets as Record<string, unknown>;
        if (!isDeepStrictEqual(hashes[target], assetHashes(files))) throw new FoundationGateError(`${target}: receipt-hash-mismatch`);
        if ([...files.keys()].filter(name => CENTER_CHUNK.test(name)).some(name => !name.endsWith(`${(recorded.sourceTreeSha256 as string).slice(0, 16)}.js`))) throw new FoundationGateError(`${target}: chunk-source-mismatch`);
    }
}
