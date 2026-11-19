import { inflateRawSync } from 'node:zlib';

/** Read one bounded artifact member as data without extracting any path. */
export function readSingleJsonArtifact(value: Uint8Array, expectedName: string): unknown {
    const zip = Buffer.from(value);
    if (zip.length > 64 * 1024 || zip.length < 30) return undefined;
    let eocd = -1;
    for (let index = zip.length - 22; index >= Math.max(0, zip.length - 65_557); index--) {
        if (zip.readUInt32LE(index) === 0x06054b50) { eocd = index; break; }
    }
    if (eocd < 0 || zip.readUInt16LE(eocd + 10) !== 1) return undefined;
    const central = zip.readUInt32LE(eocd + 16);
    if (central + 46 > zip.length || zip.readUInt32LE(central) !== 0x02014b50) return undefined;
    const method = zip.readUInt16LE(central + 10);
    const compressedSize = zip.readUInt32LE(central + 20);
    const plainSize = zip.readUInt32LE(central + 24);
    const nameLength = zip.readUInt16LE(central + 28);
    const name = zip.subarray(central + 46, central + 46 + nameLength).toString('utf8');
    const local = zip.readUInt32LE(central + 42);
    if (name !== expectedName || plainSize > 16_384 || compressedSize > 64 * 1024
        || ![0, 8].includes(method) || local + 30 > zip.length || zip.readUInt32LE(local) !== 0x04034b50) return undefined;
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    if (start + compressedSize > zip.length) return undefined;
    let raw: Buffer;
    try {
        const contents = zip.subarray(start, start + compressedSize);
        raw = method === 0 ? contents : inflateRawSync(contents, { maxOutputLength: 16_384 });
    } catch { return undefined; }
    if (raw.length !== plainSize) return undefined;
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch { return undefined; }
}
