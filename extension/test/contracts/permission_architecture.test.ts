import { expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readSources, sourceProgram, moduleSpecifiers } from '../../tooling/source_graph.mts';
import { componentScript } from '../../tooling/component_validation.mts';
import { validateArchitecture } from '../../tooling/architecture_validation.mts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
it('bexp-CENTER06-C05 the production graph keeps native inspection outside all background authorization closures', async () => {
    const sources = await readSources(root); const scripts = new Map(sources);
    for (const [name, text] of sources) {
        if (name.endsWith('.svelte')) scripts.set(name, componentScript(name, text));
        if (name.endsWith('.css')) scripts.set(name, '');
    }
    const { program, resolve } = sourceProgram(root, scripts);
    const graph = new Map([...scripts.keys()].map(name => [name,
        moduleSpecifiers(program.getSourceFile(fileURLToPath(new URL(`../../../${name}`, import.meta.url)))!)
            .flatMap(specifier => specifier.text?.startsWith('.') ? [resolve(specifier.text, name)!] : [])]));
    const seen = new Set<string>();
    function walk(name: string): void { if (seen.has(name)) return; seen.add(name); for (const dependency of graph.get(name) ?? []) walk(dependency); }
    for (const name of ['infrastructure/background_entry', 'application/center_gateway', 'application/message_gateway',
        'application/protected_session', 'application/settings_operations', 'application/read_scheduler', 'application/named_sessions']) walk(`extension/src/${name}.ts`);
    for (const file of ['application/permission_inspector', 'adapters/browser/permission_reader', 'domain/permission_inspection', 'domain/privacy_context']) {
        expect(seen.has(`extension/src/${file}.ts`)).toBe(false);
    }
});
it('the complete production graph accepts inward layers, literal lazy modules and bounded privacy components', async () => {
    const sources = await readSources(root);
    expect(() => validateArchitecture(root, sources)).not.toThrow();
});
