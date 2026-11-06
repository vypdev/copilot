import { afterEach, expect, it, vi } from 'vitest';
import { validateTarget } from '../../tooling/artifact_validation.mts';
import * as javascript from '../../tooling/javascript_validation.mts';
import * as styles from '../../tooling/style_validation.mts';
import { targetManifest } from '../../src/infrastructure/target_manifests.ts';
import { TARGETS, type BrowserTarget } from '../../src/domain/target.ts';
import { RUNTIME_HTML } from '../../tooling/static_assets.mts';

// Small fixtures exercise the artifact guard, never product or native-browser acceptance.
function files(target: BrowserTarget, variant: number): Map<string, string> {
    return new Map([
        ['background.js', `void ${variant};`], ['content.js', 'void 0;'], ['runtime.js', 'void 0;'],
        ['runtime.css', 'body { color: black; }'], ['runtime.html', RUNTIME_HTML],
        ['manifest.json', `${JSON.stringify(targetManifest(target), null, 2)}\n`],
    ]);
}
afterEach(() => vi.restoreAllMocks());

it('reuses successful policy proof for identical bytes in any map order and rechecks changed bytes', () => {
    const check = vi.spyOn(javascript, 'validateJavaScript');
    const css = vi.spyOn(styles, 'validateStyles');
    const first = files('chrome', 100);
    validateTarget('chrome', first);
    expect(check).toHaveBeenCalledTimes(3); expect(css).toHaveBeenCalledTimes(1);
    validateTarget('chrome', new Map([...first].reverse()));
    expect(check).toHaveBeenCalledTimes(3); expect(css).toHaveBeenCalledTimes(1);
    validateTarget('chrome', files('chrome', 101));
    expect(check).toHaveBeenCalledTimes(6); expect(css).toHaveBeenCalledTimes(2);
});

it('keeps target identity in the proof and never treats a prior valid target as manifest permission', () => {
    const check = vi.spyOn(javascript, 'validateJavaScript');
    validateTarget('chrome', files('chrome', 110));
    expect(() => validateTarget('firefox', files('chrome', 110))).toThrow('manifest-drift');
    validateTarget('firefox', files('firefox', 110));
    expect(check).toHaveBeenCalledTimes(6);
});

it('does not retain failed JavaScript or stylesheet checks and rejects newly executable bytes after a success', () => {
    const check = vi.spyOn(javascript, 'validateJavaScript');
    const css = vi.spyOn(styles, 'validateStyles');
    const changed = files('chrome', 120); validateTarget('chrome', changed);
    check.mockClear(); css.mockClear();
    changed.set('content.js', "eval('rehashed authority is still forbidden');");
    for (let attempt = 0; attempt < 2; attempt++) expect(() => validateTarget('chrome', changed)).toThrow('forbidden-executable');
    expect(check).toHaveBeenCalledTimes(4); expect(css).toHaveBeenCalledTimes(2);
    changed.set('content.js', 'void 0;'); changed.set('runtime.css', "@import 'https://invalid.example/style.css';");
    css.mockClear();
    for (let attempt = 0; attempt < 2; attempt++) expect(() => validateTarget('chrome', changed)).toThrow('style-resource-rule');
    expect(css).toHaveBeenCalledTimes(2);
});

it('checks the entire current filename set and import graph rather than accepting a partial file hash match', () => {
    const changed = files('chrome', 130); validateTarget('chrome', changed);
    changed.set('extra.js', 'void 0;');
    expect(() => validateTarget('chrome', changed)).toThrow('undeclared-or-missing-asset');
    changed.delete('extra.js'); changed.set(`center-orphan-${'0'.repeat(16)}.js`, 'void 0;');
    expect(() => validateTarget('chrome', changed)).toThrow('unreachable-center-chunk');
    changed.delete(`center-orphan-${'0'.repeat(16)}.js`); changed.delete('content.js');
    expect(() => validateTarget('chrome', changed)).toThrow('undeclared-or-missing-asset');
});

it('rechecks under changed JavaScript and style policy identities', () => {
    const first = files('chrome', 140);
    const check = vi.spyOn(javascript, 'validateJavaScript');
    validateTarget('chrome', first); expect(check).toHaveBeenCalledTimes(3);
    check.mockRestore();
    const next = vi.spyOn(javascript, 'validateJavaScript');
    validateTarget('chrome', first); expect(next).toHaveBeenCalledTimes(3);
    const css = vi.spyOn(styles, 'validateStyles');
    validateTarget('chrome', first); expect(css).toHaveBeenCalledTimes(1); expect(next).toHaveBeenCalledTimes(6);
});

it('evicts successful proofs at a fixed process-local bound and revalidates the oldest bytes', () => {
    const check = vi.spyOn(javascript, 'validateJavaScript');
    for (let variant = 150; variant < 155; variant++) for (const target of TARGETS) validateTarget(target, files(target, variant));
    expect(check).toHaveBeenCalledTimes(45);
    validateTarget('chrome', files('chrome', 154)); expect(check).toHaveBeenCalledTimes(45);
    validateTarget('chrome', files('chrome', 150)); expect(check).toHaveBeenCalledTimes(48);
});
