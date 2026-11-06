import { expect, it, vi } from 'vitest';
import { readPackageIdentity } from '../../src/adapters/browser/package_reader.ts';
import { browserFixture } from '../fixtures/browser.ts';

const source = 'b'.repeat(64);
it('uses the native runtime receiver with no parameters and performs no provider, storage, grant or settings operation', () => {
    const h = browserFixture(); const native = h.api.runtime;
    native.getManifest = vi.fn(function (this: typeof native) { expect(this).toBe(native); expect(arguments.length).toBe(0);
        return { name: 'Copilot', version: '0.1.0', manifest_version: 3 }; });
    expect(readPackageIdentity(h.api, source)).toEqual({ observation: { state: 'known', name: 'Copilot', version: '0.1.0', manifestVersion: 3 }, sourceTree: source });
    expect(native.getManifest).toHaveBeenCalledOnce(); expect(native.sendMessage).not.toHaveBeenCalled();
    expect(h.localArea.get).not.toHaveBeenCalled(); expect(h.sessionArea.get).not.toHaveBeenCalled();
    expect(h.api.permissions.contains).not.toHaveBeenCalled(); expect(h.api.permissions.request).not.toHaveBeenCalled(); expect(h.api.tabs.create).not.toHaveBeenCalled();
});
it('feature-detects missing native metadata while preserving a verified page source', () => {
    const h = browserFixture(); expect(readPackageIdentity(h.api, source)).toEqual({ observation: { state: 'unsupported' }, sourceTree: source });
    Object.defineProperty(h.api, 'runtime', { value: undefined });
    expect(readPackageIdentity(h.api, 'unbundled')).toEqual({ observation: { state: 'unsupported' }, sourceTree: null });
});
it('does not infer a version from an API with the wrong type', () => {
    const h = browserFixture(); Object.defineProperty(h.api.runtime, 'getManifest', { value: '0.1.0' });
    expect(readPackageIdentity(h.api, source).observation).toEqual({ state: 'unsupported' });
});
it('contains a throwing runtime property access without leaking an exception', () => {
    const h = browserFixture(); Object.defineProperty(h.api, 'runtime', { get() { throw new Error('private-runtime-path'); } });
    expect(JSON.stringify(readPackageIdentity(h.api, source))).not.toContain('private'); expect(readPackageIdentity(h.api, source).observation.state).toBe('unavailable');
});
it('contains a throwing native metadata accessor before invocation', () => {
    const h = browserFixture(); Object.defineProperty(h.api.runtime, 'getManifest', { get() { throw new Error('private-api-path'); } });
    expect(readPackageIdentity(h.api, source).observation).toEqual({ state: 'unavailable' });
});
it('contains a native query error and never falls back to settings, network, updater or guessed package.json values', () => {
    const h = browserFixture(); h.api.runtime.getManifest = vi.fn(() => { throw new Error('private-browser-detail'); });
    const value = readPackageIdentity(h.api, source); expect(value).toEqual({ observation: { state: 'unavailable' }, sourceTree: source });
    expect(JSON.stringify(value)).not.toContain('private'); expect(h.api.runtime.sendMessage).not.toHaveBeenCalled();
});
it('rejects asynchronous metadata rather than assimilating a foreign thenable or presenting a guessed version', () => {
    const h = browserFixture(); const then = vi.fn(); h.api.runtime.getManifest = vi.fn(() => ({ then }));
    expect(readPackageIdentity(h.api, source).observation).toEqual({ state: 'unavailable' }); expect(then).not.toHaveBeenCalled();
});
it('contains a malformed or throwing native field and does not retain any raw provider object', () => {
    const h = browserFixture(); h.api.runtime.getManifest = vi.fn(() => ({ name: 'Copilot', get version() { throw new Error('private-version'); }, manifest_version: 3 }));
    expect(readPackageIdentity(h.api, source).observation).toEqual({ state: 'unavailable' });
    h.api.runtime.getManifest = vi.fn(() => ({ name: '<img src=x>', version: 'private-url', manifest_version: 3, secret: 'not-retained' }));
    expect(readPackageIdentity(h.api, source)).toEqual({ observation: { state: 'unavailable' }, sourceTree: source });
});
