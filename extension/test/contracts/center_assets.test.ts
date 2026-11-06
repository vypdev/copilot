import { expect, it } from 'vitest';
import { validateTarget, assetHashes } from '../../tooling/artifact_validation.mts';
import { validateJavaScript } from '../../tooling/javascript_validation.mts';
import { targetManifest } from '../../src/infrastructure/target_manifests.ts';
import { RUNTIME_HTML } from '../../tooling/static_assets.mts';

const chunk = 'center-AppearancePage-1234567890abcdef.js';
function assets(): Map<string, string> {
    return new Map([['manifest.json', `${JSON.stringify(targetManifest('chrome'), null, 2)}\n`], ['runtime.html', RUNTIME_HTML],
        ['runtime.css', ':root { color-scheme:light dark }'], ['background.js', ''], ['content.js', ''],
        ['runtime.js', `export const route = () => import('./${chunk}');`], [chunk, 'export const title = "Appearance";']]);
}
it('accepts only reachable packaged center modules and includes every resource in the receipt hashes', () => {
    const files = assets(); expect(() => validateTarget('chrome', files)).not.toThrow();
    expect(Object.keys(assetHashes(files))).toEqual([...files.keys()].sort());
    files.set(chunk, 'import { route } from "./runtime.js"; export { route };');
    expect(() => validateTarget('chrome', files)).not.toThrow();
});
it.each(['https://evil.invalid/code.js', '../runtime.js', './runtime.js?secret=value', './other.js', './missing-1234567890abcdef.js', `./${chunk}#private`])(
    'rejects nonpackaged module operand %s', operand => {
        const files = assets(); files.set('runtime.js', `import(${JSON.stringify(operand)})`);
        expect(() => validateTarget('chrome', files)).toThrow();
    });
it('rejects arbitrary import expressions, import attributes, self imports, remote CSS and unreferenced executable files', () => {
    for (const source of ['import(name)', `import('./${chunk}', {with:{type:'javascript'}})`, 'export * from "./runtime.js"']) {
        const files = assets(); files.set('runtime.js', source);
        expect(() => validateTarget('chrome', files)).toThrow();
    }
    const orphan = assets(); orphan.set('runtime.js', 'export const route = 1;'); expect(() => validateTarget('chrome', orphan)).toThrow('unreachable');
    const remote = assets(); remote.set('runtime.css', '@import "https://evil.invalid/style.css";'); expect(() => validateTarget('chrome', remote)).toThrow();
    const mixed = assets(); mixed.set('center-other-0000000000000000.js', ''); expect(() => validateTarget('chrome', mixed)).toThrow('mixed-source-chunks');
    const oversized = assets(); oversized.set('runtime.css', ' '.repeat(8 * 1024 * 1024)); expect(() => validateTarget('chrome', oversized)).toThrow('undeclared-or-missing-asset');
});
it('keeps content/background self-contained and their existing runtime authority restrictions intact', () => {
    for (const name of ['content.js', 'background.js']) for (const source of [`import('./${chunk}')`, 'export default 1;', 'export { value };']) {
        expect(() => validateJavaScript('chrome', name, source, assets())).toThrow('forbidden-executable-or-runtime');
    }
    expect(() => validateJavaScript('chrome', 'background.js', 'document.body', assets())).toThrow();
    expect(() => validateJavaScript('chrome', 'runtime.js', 'fetch("/")', assets())).toThrow();
});
