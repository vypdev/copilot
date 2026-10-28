import { afterEach, expect, it, vi } from 'vitest';
import { browserFixture } from '../fixtures/browser.ts';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.restoreAllMocks(); });
it('entrypoints tolerate absent vendor API and protected content exits before looking up the API', async () => {
    vi.stubGlobal('browser', undefined); vi.stubGlobal('chrome', undefined);
    await import('../../src/infrastructure/background_entry.ts'); await import('../../src/infrastructure/runtime_entry.ts');
    vi.stubGlobal('location', { href: 'https://github.com/settings/tokens' }); await import('../../src/infrastructure/content_entry.ts');
    vi.resetModules(); vi.stubGlobal('location', { href: 'https://github.com/octo/example' }); await import('../../src/infrastructure/content_entry.ts');
});
it('real composition entries pass native APIs to their tested runtime coordinators', async () => {
    const h = browserFixture(); vi.stubGlobal('chrome', h.api); vi.stubGlobal('browser', undefined);
    const background = await import('../../src/infrastructure/background_runtime.ts'); const startBackground = vi.spyOn(background, 'startBackground').mockReturnValue(() => undefined);
    await import('../../src/infrastructure/background_entry.ts'); expect(startBackground).toHaveBeenCalledWith(h.api);
    const content = await import('../../src/infrastructure/content_runtime.ts'); const startContent = vi.spyOn(content, 'startContent').mockReturnValue(() => undefined);
    const document = { documentElement: { dataset: {} } }; const window = {}; vi.stubGlobal('document', document); vi.stubGlobal('window', window);
    vi.stubGlobal('location', { href: 'https://github.com/octo/example' }); await import('../../src/infrastructure/content_entry.ts');
    expect(startContent).toHaveBeenCalledWith(h.api, window, document);
    const options = await import('../../src/infrastructure/options_runtime.ts'); const startOptions = vi.spyOn(options, 'startOptions').mockReturnValue(() => undefined);
    vi.stubGlobal('navigator', { language: 'es-ES' }); await import('../../src/infrastructure/runtime_entry.ts');
    expect(startOptions).toHaveBeenCalledWith(h.api, document, 'es-ES');
});

it('build identity distinguishes unbundled tests from the immutable packaged input digest', async () => {
    const { buildSourceIdentity } = await import('../../src/infrastructure/build_identity.ts');
    expect(buildSourceIdentity()).toBe('unbundled'); vi.stubGlobal('__COPILOT_SOURCE_TREE__', 'a'.repeat(64));
    expect(buildSourceIdentity()).toBe('a'.repeat(64));
});
