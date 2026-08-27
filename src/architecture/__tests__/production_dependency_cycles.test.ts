import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

function productionTypeScriptFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            return entry.name === '__tests__' ? [] : productionTypeScriptFiles(path);
        }
        return entry.name.endsWith('.ts')
            && !entry.name.endsWith('.test.ts')
            && !entry.name.endsWith('.d.ts')
            ? [resolve(path)]
            : [];
    });
}

function relativeModuleSpecifiers(source: string): string[] {
    const imports = /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g;
    const runtimeImports = /(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    return [
        ...Array.from(source.matchAll(imports), (match) => match[1]),
        ...Array.from(source.matchAll(runtimeImports), (match) => match[1]),
    ]
        .filter((specifier) => specifier.startsWith('.'));
}

function relativeImports(file: string): string[] {
    return relativeModuleSpecifiers(readFileSync(file, 'utf8'));
}

function resolveTypeScriptImport(file: string, specifier: string): string | undefined {
    const target = resolve(dirname(file), specifier);
    return [`${target}.ts`, join(target, 'index.ts')].find(existsSync);
}

function stronglyConnectedComponents(graph: ReadonlyMap<string, readonly string[]>): string[][] {
    let nextIndex = 0;
    const indices = new Map<string, number>();
    const lowLinks = new Map<string, number>();
    const stack: string[] = [];
    const onStack = new Set<string>();
    const components: string[][] = [];

    const visit = (node: string): void => {
        indices.set(node, nextIndex);
        lowLinks.set(node, nextIndex);
        nextIndex += 1;
        stack.push(node);
        onStack.add(node);

        for (const dependency of graph.get(node) ?? []) {
            if (!indices.has(dependency)) {
                visit(dependency);
                lowLinks.set(node, Math.min(lowLinks.get(node)!, lowLinks.get(dependency)!));
            } else if (onStack.has(dependency)) {
                lowLinks.set(node, Math.min(lowLinks.get(node)!, indices.get(dependency)!));
            }
        }

        if (lowLinks.get(node) !== indices.get(node)) return;

        const component: string[] = [];
        let member: string;
        do {
            member = stack.pop()!;
            onStack.delete(member);
            component.push(member);
        } while (member !== node);
        components.push(component);
    };

    for (const node of graph.keys()) {
        if (!indices.has(node)) visit(node);
    }
    return components;
}

describe('production dependency graph', () => {
    it('recognizes static, re-exported, required, and dynamically imported modules', () => {
        const source = `
            import './side-effect';
            import { staticValue } from './static';
            export { reexported } from './reexported';
            const required = require('./required');
            const dynamic = import('./dynamic');
        `;

        expect(relativeModuleSpecifiers(source)).toEqual([
            './side-effect',
            './static',
            './reexported',
            './required',
            './dynamic',
        ]);
    });

    it('returns singleton components for a directed acyclic graph', () => {
        const graph = new Map<string, string[]>([
            ['entry', ['application']],
            ['application', ['model']],
            ['model', []],
        ]);

        expect(stronglyConnectedComponents(graph).map((component) => component.sort())).toEqual([
            ['model'],
            ['application'],
            ['entry'],
        ]);
    });

    it('exposes a self-loop as a cyclic component', () => {
        const graph = new Map<string, string[]>([['model', ['model']]]);
        const [component] = stronglyConnectedComponents(graph);

        expect(component).toEqual(['model']);
        expect(graph.get(component[0])).toContain(component[0]);
    });

    it('groups both members of a two-node cycle', () => {
        const graph = new Map<string, string[]>([
            ['application', ['model']],
            ['model', ['application']],
        ]);

        expect(stronglyConnectedComponents(graph)[0].sort()).toEqual(['application', 'model']);
    });

    it('contains no directed dependency cycles', () => {
        const sourceRoot = resolve(__dirname, '../..');
        const files = productionTypeScriptFiles(sourceRoot);
        const fileSet = new Set(files);
        const graph = new Map(files.map((file) => [
            file,
            relativeImports(file)
                .map((specifier) => resolveTypeScriptImport(file, specifier))
                .filter((dependency): dependency is string => dependency !== undefined && fileSet.has(dependency)),
        ]));

        const cycles = stronglyConnectedComponents(graph)
            .filter((component) => component.length > 1
                || graph.get(component[0])?.includes(component[0]))
            .map((component) => component
                .map((file) => relative(sourceRoot, file))
                .sort())
            .sort((left, right) => left[0].localeCompare(right[0]));

        expect(cycles).toEqual([]);
    });
});
