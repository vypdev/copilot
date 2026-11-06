import ts from 'typescript';
import { FoundationGateError } from './gate_error.mts';

export const CENTER_CHUNK = /^center-[A-Za-z0-9_-]{1,80}-[a-f0-9]{16}\.js$(?![\s\S])/u;
export function validateJavaScript(target: string, name: string, text: string, files: ReadonlyMap<string, string>): readonly string[] {
    const fail = (rule: string): never => { throw new FoundationGateError(`${target}/${name}: ${rule}`); };
    if (Buffer.byteLength(text) > 1024 * 1024) fail('bundle-size');
    if (ts.transpileModule(text, { fileName: name, reportDiagnostics: true,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, allowJs: true } }).diagnostics!.length) fail('bundle-syntax');
    const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const center = name === 'runtime.js' || CENTER_CHUNK.test(name);
    const dependencies: string[] = [];
    const forbidden = new Set(['eval', 'Function', 'require', 'process', 'Buffer', '__dirname', '__filename', 'module', 'XMLHttpRequest', 'WebSocket']);
    if (name !== 'background.js') forbidden.add('fetch');
    if (name === 'background.js') forbidden.add('document');
    function dependency(value: ts.Expression | undefined): void {
        if (!center || !value || !ts.isStringLiteral(value) || !value.text.startsWith('./')) fail('forbidden-executable-or-runtime');
        const target = (value as ts.StringLiteral).text.slice(2);
        if ((target !== 'runtime.js' && !CENTER_CHUNK.test(target)) || !files.has(target) || target === name) fail('unpackaged-module');
        dependencies.push(target);
    }
    function visit(node: ts.Node): void {
        if (ts.isIdentifier(node) && forbidden.has(node.text)) fail('forbidden-executable-or-runtime');
        if (ts.isImportDeclaration(node)) dependency(node.moduleSpecifier);
        if (ts.isExportDeclaration(node)) {
            if (!center) fail('forbidden-executable-or-runtime');
            if (node.moduleSpecifier) dependency(node.moduleSpecifier);
        }
        if (ts.isExportAssignment(node) && !center) fail('forbidden-executable-or-runtime');
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            if (node.arguments.length !== 1) fail('forbidden-executable-or-runtime');
            dependency(node.arguments[0]);
        }
        ts.forEachChild(node, visit);
    }
    visit(source); return dependencies;
}
