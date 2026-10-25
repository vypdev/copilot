import ts from 'typescript';
import path from 'node:path';
import { readdir, readFile, realpath } from 'node:fs/promises';

export type Sources = ReadonlyMap<string, string>;
export const SHARED = 'src/domain/browser_extension_contract/';
export const SHARED_ENTRY = `${SHARED}index.ts`;

export async function readSources(root: string, directories = ['extension/src', SHARED.slice(0, -1)]): Promise<Map<string, string>> {
    const sources = new Map<string, string>();
    const canonicalRoot = await realpath(root);
    async function visit(relative: string): Promise<void> {
        const entries = await readdir(path.join(root, relative), { withFileTypes: true });
        for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
            const name = `${relative}/${entry.name}`;
            const absolute = await realpath(path.join(root, name));
            if (entry.isSymbolicLink() || !absolute.startsWith(`${canonicalRoot}${path.sep}`)) throw new Error(`source-boundary: ${name}`);
            if (entry.isDirectory()) await visit(name);
            else if (/\.(?:ts|mts)$/u.test(name)) sources.set(name, await readFile(absolute, 'utf8'));
        }
    }
    for (const directory of directories) await visit(directory);
    return sources;
}

export function sourceProgram(root: string, sources: Sources, files: readonly string[] = [...sources.keys()]) {
    const options: ts.CompilerOptions = {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler, allowImportingTsExtensions: true,
        noEmit: true, strict: true, skipLibCheck: true, types: [], lib: ['lib.es2022.d.ts'],
    };
    const host = ts.createCompilerHost(options, true);
    const read = host.readFile.bind(host);
    const exists = host.fileExists.bind(host);
    const relative = (file: string) => path.relative(root, file).split(path.sep).join('/');
    host.readFile = file => sources.get(relative(file)) ?? read(file);
    host.fileExists = file => sources.has(relative(file)) || exists(file);
    // Virtual negative fixtures need directories as well as files for TS resolution.
    const directoryExists = host.directoryExists?.bind(host);
    host.directoryExists = directory => [...sources.keys()].some(file => file.startsWith(`${relative(directory)}/`))
        || Boolean(directoryExists?.(directory));
    const program = ts.createProgram(files.map(file => path.join(root, file)), options, host);
    const resolve = (specifier: string, file: string) => {
        const found = ts.resolveModuleName(specifier, path.join(root, file), options, host).resolvedModule;
        return found && relative(found.resolvedFileName);
    };
    return { program, resolve };
}

export function moduleSpecifiers(file: ts.SourceFile): { text?: string; node: ts.Node }[] {
    const specifiers: { text?: string; node: ts.Node }[] = [];
    function visit(node: ts.Node): void {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
            specifiers.push({ text: ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : undefined, node });
        }
        if (ts.isImportEqualsDeclaration(node)) specifiers.push({ node });
        if (ts.isImportTypeNode(node)) {
            const literal = ts.isLiteralTypeNode(node.argument) && node.argument.literal;
            specifiers.push({ text: literal && ts.isStringLiteral(literal) ? literal.text : undefined, node });
        }
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            const value = node.arguments[0];
            specifiers.push({ text: value && ts.isStringLiteral(value) ? value.text : undefined, node });
        }
        ts.forEachChild(node, visit);
    }
    visit(file);
    return specifiers;
}
