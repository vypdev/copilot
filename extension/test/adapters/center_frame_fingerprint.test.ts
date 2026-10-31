import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { centerFrameFingerprint } from '../../src/adapters/browser/center_frame_fingerprint.ts';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('native fingerprint hashes the specified canonical UTF-8 bytes with SHA-256', async () => {
    const text = '{"message":{"method":"center.open","version":1},"sequence":1}';
    expect(await centerFrameFingerprint({ sequence: 1, message: { version: 1, method: 'center.open' } }))
        .toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
});
it('native fingerprints normalize JSON key order while preserving Unicode and altered values', async () => {
    const first = await centerFrameFingerprint({ z: '日本語', a: [true, null] });
    expect(await centerFrameFingerprint({ a: [true, null], z: '日本語' })).toBe(first);
    expect(await centerFrameFingerprint({ a: [true, null], z: '日本語!' })).not.toBe(first);
});
it('unserializable input has no valid fingerprint and cannot collide with an empty document', async () => {
    const value: { self?: unknown } = {}; value.self = value;
    expect(await centerFrameFingerprint(value)).toBeNull(); expect(await centerFrameFingerprint({ toJSON: () => undefined })).toBeNull();
});
it('native crypto failure becomes unavailable without exposing its error or inventing a digest', async () => {
    vi.stubGlobal('crypto', { subtle: { digest: vi.fn(async () => { throw new Error('private native failure'); }) } });
    expect(await centerFrameFingerprint({ sequence: 1 })).toBeNull();
});
it('a missing native crypto provider fails closed without an alternate implementation', async () => {
    vi.stubGlobal('crypto', {}); expect(await centerFrameFingerprint({ sequence: 1 })).toBeNull();
});
it('temporary UTF-8 working bytes are cleared after hashing while the caller record stays intact', async () => {
    const encode = TextEncoder.prototype.encode; let bytes: ReturnType<TextEncoder['encode']> | undefined;
    vi.spyOn(TextEncoder.prototype, 'encode').mockImplementation(function (this: TextEncoder, text?: string) { bytes = encode.call(this, text); return bytes; });
    const input = { sequence: 1, message: { version: 1, method: 'center.open' } };
    expect(await centerFrameFingerprint(input)).toMatch(/^[a-f0-9]{64}$/u); expect(bytes!.every(value => value === 0)).toBe(true);
    expect(input.message.method).toBe('center.open');
});
it('temporary bytes are also cleared after rejected native hashing', async () => {
    let bytes: Uint8Array | undefined;
    vi.stubGlobal('crypto', { subtle: { digest: vi.fn(async (_algorithm, value: Uint8Array) => { bytes = value; throw new Error('native failed'); }) } });
    expect(await centerFrameFingerprint({ sequence: 1 })).toBeNull(); expect(bytes!.every(value => value === 0)).toBe(true);
});
