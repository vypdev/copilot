import { expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { validateArchitecture } from '../../tooling/architecture_validation.mts';
import { componentScript } from '../../tooling/component_validation.mts';
import { inwardGraph } from '../fixtures/architecture.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const component = 'extension/src/presentation/View.svelte';
function graph(source: string) { const value = inwardGraph(); value.set(component, source); return value; }
const validate = (source: string) => validateArchitecture(root, graph(source));

it('checks original typed component imports and both script scopes while retaining safe local rendering', () => {
    const source = `<script module lang="ts">export interface Public { name:string }</script>
        <script lang="ts">import {a} from '../domain/a.ts'; let {name}: Public=$props();</script>
        <h1>{name} {a}</h1><style>h1 {color:var(--foreground)}</style>`;
    expect(componentScript(component, source)).toContain('interface Public');
    expect(componentScript(component, source)).toContain('let {name}: Public');
    expect(() => validate(source)).not.toThrow();
    expect(() => validate('<h1>Local settings</h1>')).not.toThrow();
});
it('does not erase forbidden type-only imports or native authority while compiling Svelte', () => {
    expect(() => validate(`<script lang="ts">import type {a} from '../adapters/browser/a.ts';</script><p>Settings</p>`)).toThrow('dependency-direction');
    expect(() => validate(`<script module>import {a} from '../adapters/browser/a.ts';</script><p>Settings</p>`)).toThrow('dependency-direction');
    expect(() => validate('<script>const privateState=localStorage;</script><p>Settings</p>')).toThrow('presentation-authority');
    expect(() => validate('<script>const hidden=globalThis["fetch"];</script><p>Settings</p>')).toThrow('network-authority');
});
it('admits only the pinned Svelte runtime in rendering/composition and never compiler/provider packages or application imports', () => {
    expect(() => validate('<script>import {onDestroy} from "svelte";onDestroy(()=>{});</script><p>Settings</p>')).not.toThrow();
    for (const dependency of ['svelte/compiler', 'svelte/internal/client', '@octokit/rest', 'node:fs']) {
        expect(() => validate(`<script>import * as dependency from '${dependency}';</script><p>Settings</p>`)).toThrow('external-or-dynamic-import');
    }
    const value = inwardGraph(); value.set('extension/src/infrastructure/mount.ts', 'import {mount} from "svelte";export {mount};');
    expect(() => validateArchitecture(root, value)).not.toThrow();
    value.set('extension/src/application/a.ts', 'import {mount} from "svelte";export {mount};');
    expect(() => validateArchitecture(root, value)).toThrow('external-or-dynamic-import');
});
it('bounds component source and rejects syntax/warning suppression with safe diagnostics', () => {
    expect(() => componentScript('extension/src/application/Bad.svelte', '<p>Bad</p>')).toThrow('component-layer');
    expect(() => validate('<p>Settings</p>\n'.repeat(91))).toThrow('component-size');
    expect(() => validate(`<p>${'x'.repeat(65536)}</p>`)).toThrow('component-size');
    expect(() => validate('<h1>unterminated private marker')).toThrow('component-syntax');
    expect(() => validate('<img src="missing">')).toThrow('component-warning');
    expect(() => validate('<!-- svelte-ignore a11y_missing_attribute --><img src="missing">')).toThrow('component-warning-suppression');
    expect(() => validate('<script>// svelte-ignore state_referenced_locally\nconst a=1;</script><p>Safe</p>')).toThrow('component-warning-suppression');
});
it('keeps authored components in the presentation layer and enforces dependency cycles across TS and Svelte', () => {
    const value = graph('<script>import Other from "./Other.svelte";</script><Other />');
    value.set('extension/src/presentation/Other.svelte', '<script>import View from "./View.svelte";</script><View />');
    expect(() => validateArchitecture(root, value)).toThrow('dependency-cycle');
    const missing = graph('<script>import Missing from "./Missing.svelte";</script><Missing />');
    expect(() => validateArchitecture(root, missing)).toThrow('unresolved-or-escaping-import');
});
it('admits literal packaged lazy route imports only at the composition boundary', () => {
    const value = graph('<p>Settings</p>');
    value.set('extension/src/infrastructure/lazy.ts', 'export const route=()=>import("../presentation/View.svelte");');
    expect(() => validateArchitecture(root, value)).not.toThrow();
    value.set('extension/src/infrastructure/lazy.ts', 'export const route=(name:string)=>import(name);');
    expect(() => validateArchitecture(root, value)).toThrow('external-or-dynamic-import');
    value.set('extension/src/infrastructure/lazy.ts', 'export const route=()=>import("../presentation/View.svelte",{with:{type:"json"}});');
    expect(() => validateArchitecture(root, value)).toThrow('dynamic-import-boundary');
    const presentation = graph('<p>Settings</p>'); presentation.set('extension/src/presentation/lazy.ts', 'export const route=()=>import("./View.svelte");');
    expect(() => validateArchitecture(root, presentation)).toThrow('dynamic-import-boundary');
});
it('keeps control and bidi characters out of component diagnostics without erasing the relevant rule', () => {
    expect(() => componentScript('extension/src/presentation/invalid\t.svelte', '<h1>')).toThrow('invalid?.svelte: component-syntax');
    expect(() => componentScript('extension/src/presentation/invalid\u202e.svelte', '<h1>')).toThrow('invalid?.svelte: component-syntax');
});

const scopes = ['instance', 'module'] as const;
const scriptView = (scope: typeof scopes[number], body: string) => `<script ${scope === 'module' ? 'module ' : ''}lang="ts">${body}</script><p>{value}</p>`;
const globals = [
    { capability: 'window', expression: 'window.location.href' }, { capability: 'document', expression: 'document.title' },
    { capability: 'self', expression: 'self.location.href' }, { capability: 'navigator', expression: 'navigator.userAgent' },
];
it.each(scopes.flatMap(scope => globals.map(global => ({ scope, ...global }))))('rejects $capability authority in the original $scope script through the full build architecture gate', ({ scope, expression }) => {
    expect(() => validate(scriptView(scope, `const value=${expression};`))).toThrow('presentation-authority');
});
it.each(scopes)('rejects DOM authority nested inside a callback in the %s script', scope => {
    expect(() => validate(scriptView(scope, 'const value=(()=>document.title)();'))).toThrow('presentation-authority');
});
it.each(scopes)('retains inert authored DOM vocabulary in the %s script', scope => {
    const data = 'const labels:{window:string,document:string,self:string,navigator:string}={window:"window",document:"document",self:"self",navigator:"navigator"};';
    const fields = 'const {document:label}=labels;class Label {document=label;}';
    expect(() => validate(scriptView(scope, `${data}${fields}const value=labels.window+new Label().document+labels.self+labels.navigator;`))).not.toThrow();
});
