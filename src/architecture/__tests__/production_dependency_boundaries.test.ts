import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

function productionSourceFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            return entry.name === '__tests__' ? [] : productionSourceFiles(path);
        }
        return (entry.name.endsWith('.ts') || entry.name.endsWith('.cjs'))
            && !/\.test\.(?:ts|cjs)$/.test(entry.name)
            && !entry.name.endsWith('.d.ts')
            ? [resolve(path)]
            : [];
    });
}

function relativeModuleSpecifiers(source: string): string[] {
    const imports = /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
    const runtimeImports = /(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    return [
        ...Array.from(source.matchAll(imports), match => match[1]),
        ...Array.from(source.matchAll(runtimeImports), match => match[1]),
    ].filter(specifier => specifier.startsWith('.'));
}

function resolveSourceImport(file: string, specifier: string): string | undefined {
    const target = resolve(dirname(file), specifier);
    const candidates = specifier.endsWith('.json') || specifier.endsWith('.cjs')
        ? [target]
        : [`${target}.ts`, `${target}.json`, join(target, 'index.ts')];
    return candidates.find(existsSync);
}

function layerPath(sourceRoot: string, file: string): string {
    return relative(sourceRoot, file).split('/')[1] ?? '';
}

function isPurePath(sourceRoot: string, file: string): boolean {
    const path = relative(sourceRoot, file);
    return path === 'domain' || path.startsWith('domain/')
        || path === 'data/model' || path.startsWith('data/model/');
}

describe('production dependency boundaries', () => {
    const sourceRoot = resolve(__dirname, '../..');
    const files = productionSourceFiles(sourceRoot);
    const fileSet = new Set(files);

    it('resolves every relative production import', () => {
        const unresolved = files.flatMap(file => relativeModuleSpecifiers(readFileSync(file, 'utf8'))
            .filter(specifier => resolveSourceImport(file, specifier) === undefined)
            .map(specifier => `${relative(sourceRoot, file)} -> ${specifier}`));

        expect(unresolved).toEqual([]);
    });

    it('keeps pure model and domain code inside the pure core', () => {
        const violations = files
            .filter(file => isPurePath(sourceRoot, file))
            .flatMap(file => relativeModuleSpecifiers(readFileSync(file, 'utf8'))
                .map(specifier => resolveSourceImport(file, specifier))
                .filter((dependency): dependency is string => dependency !== undefined && fileSet.has(dependency))
                .filter(dependency => !isPurePath(sourceRoot, dependency))
                .map(dependency => `${relative(sourceRoot, file)} -> ${relative(sourceRoot, dependency)}`));

        expect(violations).toEqual([]);
    });

    it('keeps application code independent of outer runtime layers', () => {
        const forbiddenOuterLayers = new Set(['actions', 'cli', 'infrastructure', 'manager']);
        const violations = files
            .filter(file => layerPath(sourceRoot, file) === 'application')
            .flatMap(file => relativeModuleSpecifiers(readFileSync(file, 'utf8'))
                .map(specifier => resolveSourceImport(file, specifier))
                .filter((dependency): dependency is string => dependency !== undefined && fileSet.has(dependency))
                .filter(dependency => forbiddenOuterLayers.has(layerPath(sourceRoot, dependency)))
                .map(dependency => `${relative(sourceRoot, file)} -> ${relative(sourceRoot, dependency)}`));

        expect(violations).toEqual([]);
    });
});
