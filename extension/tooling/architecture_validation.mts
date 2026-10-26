import ts from 'typescript';
import path from 'node:path';
import { SHARED, SHARED_ENTRY, sourceProgram, moduleSpecifiers, type Sources } from './source_graph.mts';
import { FoundationGateError } from './gate_error.mts';

const DIRECTIONS: Record<string, readonly string[]> = {
    domain: ['domain'], application: ['application', 'domain'],
    presentation: ['presentation', 'domain'], adapters: ['adapters', 'application', 'domain'],
    infrastructure: ['infrastructure', 'adapters', 'application', 'presentation', 'domain'],
};
const AUTHORITY = new Set(['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'chrome', 'browser',
    'localStorage', 'sessionStorage', 'sendBeacon', 'credentials', 'authorization', 'token']);

export function validateArchitecture(root: string, sources: Sources): void {
    const errors: string[] = [];
    const graph = new Map<string, string[]>();
    const { program, resolve } = sourceProgram(root, sources);
    const report = (file: string, rule: string) => errors.push(`${file}: ${rule}`);
    for (const diagnostic of program.getSyntacticDiagnostics()) {
        report(path.relative(root, diagnostic.file!.fileName), `syntax TS${diagnostic.code}`);
    }
    for (const [name, text] of sources) {
        const file = program.getSourceFile(path.join(root, name))!;
        const shared = name.startsWith(SHARED);
        const layer = shared ? 'domain' : name.split('/')[2];
        if (!DIRECTIONS[layer]) report(name, 'unknown-layer');
        if (text.split('\n').length > 220) report(name, 'module-size exceeds 220 lines');
        const dependencies: string[] = [];
        for (const specifier of moduleSpecifiers(file)) {
            if (!specifier.text?.startsWith('.')) { report(name, 'external-or-dynamic-import'); continue; }
            const resolved = resolve(specifier.text, name);
            if (!resolved || !sources.has(resolved)) { report(name, 'unresolved-or-escaping-import'); continue; }
            dependencies.push(resolved);
            if (shared) {
                if (!resolved.startsWith(SHARED)) report(name, 'shared-contract-escape');
            } else if (resolved.startsWith(SHARED)) {
                if (resolved !== SHARED_ENTRY) report(name, 'shared-barrel-only');
            } else if (!DIRECTIONS[layer]?.includes(resolved.split('/')[2])) report(name, 'dependency-direction');
        }
        graph.set(name, dependencies);
        function visit(node: ts.Node): void {
            if (ts.isIdentifier(node)) {
                const parent = node.parent;
                const propertyName = (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent)
                    || ts.isPropertyAccessExpression(parent)) && parent.name === node;
                if (['eval', 'Function', 'require', 'globalThis', 'window', 'document', 'chrome', 'browser',
                    'process', 'Buffer', 'fetch', 'self', 'navigator', 'localStorage', 'sessionStorage'].includes(node.text)
                    && layer === 'domain' && !propertyName) report(name, 'pure-global');
                if (['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon'].includes(node.text)
                    && name !== 'extension/src/adapters/github/get_reader.ts') report(name, 'network-authority');
                if (['eval', 'Function', 'require'].includes(node.text)) report(name, 'executable-primitive');
                if (layer === 'presentation' && (AUTHORITY.has(node.text) || node.text === 'globalThis')) report(name, 'presentation-authority');
            }
            ts.forEachChild(node, visit);
        }
        visit(file);
    }
    const pureFiles = [...sources.keys()].filter(file => file.startsWith(SHARED) || file.startsWith('extension/src/domain/'));
    const pure = sourceProgram(root, sources, pureFiles).program;
    for (const diagnostic of pure.getSemanticDiagnostics()) {
        const name = diagnostic.file && path.relative(root, diagnostic.file.fileName).split(path.sep).join('/');
        if (name && pureFiles.includes(name)) report(name, `pure-environment TS${diagnostic.code}`);
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    function walk(name: string): void {
        if (visiting.has(name)) { report(name, 'dependency-cycle'); return; }
        if (visited.has(name)) return;
        visiting.add(name);
        for (const dependency of graph.get(name)!) walk(dependency);
        visiting.delete(name); visited.add(name);
    }
    for (const name of graph.keys()) walk(name);
    if (errors.length) throw new FoundationGateError([...new Set(errors)].sort().slice(0, 40).join('\n')
        .replace(/\p{Cc}/gu, character => character === '\n' ? character : '?'));
}
