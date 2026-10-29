import { compile, parse } from 'svelte/compiler';
import path from 'node:path';
import { parseCenterLocation } from '../src/domain/center_routes.ts';
import { validateStyles } from './style_validation.mts';
import { FoundationGateError } from './gate_error.mts';

const AUTHORITY = new Set(['eval', 'Function', 'require', 'globalThis', 'window', 'self', 'document', 'navigator',
    'chrome', 'browser', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon',
    'localStorage', 'sessionStorage', 'credentials', 'authorization', 'token']);
const FORBIDDEN = new Set(['HtmlTag', 'SvelteWindow', 'SvelteDocument', 'SvelteBody', 'SvelteElement',
    'SpreadAttribute', 'UseDirective', 'AttachTag', 'TransitionDirective', 'AnimateDirective', 'StyleDirective', 'LetDirective']);
const RESOURCE_STYLE = new Set(['fill', 'stroke', 'filter', 'clip-path', 'mask', 'marker-start', 'marker-mid', 'marker-end', 'cursor']);
interface Node { readonly type?: string; readonly [field: string]: unknown }
const node = (value: unknown): Node | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Node : null;
const literal = (value: unknown): string | null => Array.isArray(value) && value.every(part => node(part)?.type === 'Text')
    ? value.map(part => node(part)!.data).join('') : null;

/** Validate authored script, markup and style before any compiler transformation. */
export function componentScript(name: string, source: string): string {
    const label = name.replace(/[\p{Cc}\p{Cf}]/gu, '?');
    function fail(rule: string): never { throw new FoundationGateError(`${label}: ${rule}`); }
    if (!name.startsWith('extension/src/presentation/')) fail('component-layer');
    if (source.split('\n').length > 90 || Buffer.byteLength(source) > 64 * 1024) fail('component-size');
    if (/(?:<!--|\/\/|\/\*)\s*(?:\*\s*)?svelte-ignore\b/iu.test(source)) fail('component-warning-suppression');
    let ast;
    try {
        ast = parse(source, { modern: true });
        const built = compile(source, { filename: name, generate: 'client', dev: false });
        if (built.warnings.length) fail(`component-warning ${built.warnings[0].code}`);
    } catch (error) {
        if (error instanceof FoundationGateError) throw error;
        fail('component-syntax');
    }
    const scripts = [ast!.module, ast!.instance].filter(script => script !== undefined && script !== null);
    const links = new Set<string>();
    for (const script of scripts) for (const statement of script!.content.body) {
        if (statement.type === 'ImportDeclaration' && typeof statement.source.value === 'string') {
            const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(name), statement.source.value));
            const checked = resolved === 'extension/src/domain/center_routes.ts' ? 'centerLocationHash'
                : resolved === 'extension/src/domain/feature_links.ts' ? 'featureReferenceLink' : null;
            for (const specifier of statement.specifiers) if (specifier.type === 'ImportSpecifier'
                && specifier.imported.type === 'Identifier' && specifier.imported.name === checked) links.add(specifier.local.name);
        }
    }
    function visit(value: unknown, binding = false): void {
        if (Array.isArray(value)) { value.forEach(child => visit(child, binding)); return; }
        const current = node(value); if (!current) return;
        if (typeof current.type === 'string' && FORBIDDEN.has(current.type)) fail('presentation-markup-authority');
        if (current.type === 'Identifier' && typeof current.name === 'string'
            && (AUTHORITY.has(current.name) || (binding && links.has(current.name)))) fail('presentation-markup-authority');
        if (current.type === 'ImportExpression') fail('presentation-dynamic-import');
        if (current.type === 'EachBlock' && typeof current.index === 'string' && links.has(current.index)) fail('presentation-markup-authority');
        if (current.type === 'BindDirective' && current.name === 'this') fail('presentation-dom-binding');
        if (current.type === 'RegularElement') {
            if (typeof current.name !== 'string' || ['script', 'iframe', 'object', 'embed', 'base', 'link', 'meta', 'style'].includes(current.name.toLowerCase())) fail('presentation-active-element');
            const attributes = current.attributes as readonly Node[];
            if (current.name.toLowerCase() !== 'a' && attributes.some(attribute => typeof attribute.name === 'string' && attribute.name.toLowerCase() === 'href')) fail('presentation-resource-attribute');
            if (current.name === 'input') {
                const type = attributes.find(attribute => attribute.name === 'type');
                if (type && literal(type.value) === null) fail('presentation-dynamic-input-type');
                if (type && literal(type.value)?.toLowerCase() === 'password'
                    && attributes.some(attribute => attribute.name === 'value' || attribute.type === 'BindDirective')) fail('presentation-secret-binding');
            }
        }
        if (current.type === 'Attribute' && typeof current.name === 'string') {
            const attribute = current.name.toLowerCase();
            if (attribute === 'style') fail('presentation-inline-style');
            if (['src', 'srcset', 'srcdoc', 'poster', 'action', 'formaction', 'xlink:href', 'ping', 'attributionsrc', 'background'].includes(attribute)) fail('presentation-resource-attribute');
            if (RESOURCE_STYLE.has(attribute)) {
                const text = literal(current.value);
                if (text === null) fail('presentation-dynamic-resource-attribute');
                validateStyles(name, `shape {${attribute}:${text}}`);
            }
            if (attribute === 'href') {
                const text = literal(current.value);
                const part = Array.isArray(current.value) && current.value.length === 1 ? current.value[0] : current.value;
                const expression = node(node(part)?.expression);
                const callee = node(expression?.callee);
                const checked = expression?.type === 'CallExpression' && callee?.type === 'Identifier' && typeof callee.name === 'string' && links.has(callee.name);
                const local = text !== null && parseCenterLocation(text) !== null;
                const documentation = text !== null && /^https:\/\/(?:docs\.page\/vypdev\/copilot\/[a-z0-9/-]*|github\.com\/vypdev\/copilot)$(?![\s\S])/u.test(text);
                if (!checked && !local && !documentation) fail('presentation-unchecked-navigation');
            }
        }
        for (const [key, child] of Object.entries(current)) {
            if (['loc', 'parent', 'name_loc'].includes(key)) continue;
            const scoped = current.type === 'EachBlock' || current.type === 'SnippetBlock' || current.type === 'AwaitBlock' || current.type === 'VariableDeclarator';
            visit(child, binding || scoped && ['context', 'index', 'parameters', 'value', 'error', 'id'].includes(key));
        }
    }
    visit(ast!.fragment);
    if (ast!.css) validateStyles(name, ast!.css.content.styles);
    return scripts.map(script => {
        // The pinned parser reports original UTF-16 offsets; ESTree's Program type omits them.
        const range = script!.content as typeof script.content & { readonly start: number; readonly end: number };
        return source.slice(range.start, range.end);
    }).join('\n;\n');
}
