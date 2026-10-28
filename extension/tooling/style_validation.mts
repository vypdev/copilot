import { parse } from 'svelte/compiler';
import { FoundationGateError } from './gate_error.mts';

/** Packaged styles use no fetched resources, executable bindings or escaped rule names. */
export function validateStyles(name: string, source: string): void {
    const label = name.replace(/[\p{Cc}\p{Cf}]/gu, '?');
    const fail = (rule: string): never => { throw new FoundationGateError(`${label}: ${rule}`); };
    if (Buffer.byteLength(source) > 128 * 1024) fail('style-size');
    if (/\\|<\/style/iu.test(source)) fail('style-escape');
    let ast;
    try { ast = parse(`<style>${source}</style>`, { modern: true }); }
    catch { fail('style-syntax'); }
    const allowed = new Set(['media', 'supports', 'layer', 'container', 'keyframes', 'starting-style']);
    function visit(node: unknown): void {
        if (node === null || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(visit); return; }
        const value = node as Record<string, unknown>;
        if (value.type === 'Atrule' && (typeof value.name !== 'string' || !allowed.has(value.name.toLowerCase()))) fail('style-resource-rule');
        if (value.type === 'Declaration' && typeof value.value === 'string') {
            const clean = value.value.replace(/\/\*[\s\S]*?\*\//gu, '');
            if (/(?:url|src|image|image-set|cross-fade|paint|expression)\s*\(|https?:|data:|\/\//iu.test(clean)
                || /^(?:-moz-binding|behavior)$/iu.test(String(value.property))) fail('style-resource-value');
        }
        for (const child of Object.values(value)) visit(child);
    }
    visit(ast!.css);
}
