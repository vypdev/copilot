import { expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { validateStyles } from '../../tooling/style_validation.mts';
import { validateArchitecture } from '../../tooling/architecture_validation.mts';
import { componentScript } from '../../tooling/component_validation.mts';
import { inwardGraph } from '../fixtures/architecture.ts';

const name = 'extension/src/presentation/center.css';
const root = fileURLToPath(new URL('../../../', import.meta.url));
it('accepts packaged responsive, reduced-motion, theme, layout and focus styles without resource access', () => {
    expect(() => validateStyles(name, `:root { --foreground:#123; color-scheme:light dark }
        .card {color:var(--foreground);padding:clamp(1rem,2vw,2rem);background:linear-gradient(#fff,#eee)}
        @media (prefers-reduced-motion: reduce) { * {animation:none} }
        @supports(display:grid) { .layout {display:grid} }
        @layer base { :focus-visible {outline:3px solid #0969da} }
        @container (width>20rem) { .card {padding:2rem} }
        @keyframes enter { from {opacity:0} to {opacity:1} }
        @starting-style { .card {opacity:0} }`)).not.toThrow();
});
it('inspects standalone styles and inline authored styles in the same gate with layer/import boundaries', () => {
    const value = inwardGraph(); value.set(name, 'body {color:#123}');
    value.set('extension/src/infrastructure/styles.ts', 'import "../presentation/center.css";');
    expect(() => validateArchitecture(root, value)).not.toThrow();
    value.set('extension/src/domain/styles.ts', 'import "../presentation/center.css";');
    expect(() => validateArchitecture(root, value)).toThrow('dependency-direction');
    value.delete('extension/src/domain/styles.ts'); value.set('extension/src/infrastructure/bad.css', 'body {color:red}');
    expect(() => validateArchitecture(root, value)).toThrow('style-layer');
    expect(() => componentScript('extension/src/presentation/View.svelte', '<h1>Settings</h1><style>h1 {background:url(remote)}</style>')).toThrow('style-resource-value');
});
it('rejects resource at-rules, nested imports and escaped names instead of silently fetching fonts or styles', () => {
    for (const source of ['@import "remote.css";', '@font-face {font-family:Remote;src:url(remote)}',
        '@layer base {@import "remote.css";}', '@namespace prefix "https://example.invalid";']) expect(() => validateStyles(name, source)).toThrow('style-resource-rule');
    expect(() => validateStyles(name, 'body {background:u\\72l(remote)}')).toThrow('style-escape');
    expect(() => validateStyles(name, '</style><script>remote()</script>')).toThrow('style-escape');
});
it('rejects comment-split resource functions, image sets, executable properties and direct schemes', () => {
    for (const source of ['body {background:URL(remote)}', 'body {background:uRl/**/(remote)}',
        'body {background:image-set("remote.png" 1x)}', 'body {background:paint(remote)}',
        'body {width:expression(remote())}', 'body {-moz-binding:remote}', 'body {behavior:remote}',
        'body {--remote:https://example.invalid}', 'body {--remote:data:payload}', 'body {--remote://example.invalid}']) {
        expect(() => validateStyles(name, source)).toThrow('style-resource-value');
    }
    expect(() => validateStyles(name, 'body {color:red/* url(remote) https://example.invalid */}')).not.toThrow();
});
it('bounds styles and sanitizes malformed stylesheet failures without echoing raw provider-like text', () => {
    expect(() => validateStyles(name, 'x'.repeat(128 * 1024 + 1))).toThrow('style-size');
    expect(() => validateStyles(name, 'body { color: private_marker')).toThrow('style-syntax');
    try { validateStyles(name, 'body { color: private_marker'); } catch (error) { expect((error as Error).message).not.toContain('private_marker'); }
    expect(() => validateStyles('invalid\u202e.css', 'body {')).toThrow('invalid?.css: style-syntax');
});
