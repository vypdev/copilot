'use strict';

const { Buffer } = require('node:buffer');

const maxEntries = 128;
const maxRetainedBytes = 16 * 1024 * 1024;

/** Eviction limits retained memory only. A miss always runs the authorized read. */
function createSourceCache() {
    const entries = new Map();
    let retainedBytes = 0;
    return (key, read, onHit) => {
        const entry = entries.get(key);
        if (entry) {
            entries.delete(key);
            entries.set(key, entry);
            onHit();
            return entry.value;
        }
        const value = read();
        const size = Buffer.byteLength(key) + Buffer.byteLength(JSON.stringify(value));
        if (size > maxRetainedBytes) return value;
        while (entries.size >= maxEntries || retainedBytes + size > maxRetainedBytes) {
            const oldest = entries.keys().next().value;
            retainedBytes -= entries.get(oldest).size;
            entries.delete(oldest);
        }
        entries.set(key, { value, size });
        retainedBytes += size;
        return value;
    };
}

module.exports = { createSourceCache };
