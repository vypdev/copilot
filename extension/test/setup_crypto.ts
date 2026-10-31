import { webcrypto } from 'node:crypto';

// jsdom omits SubtleCrypto; deterministic suites use Node's actual native API.
// Loaded-browser campaigns use each browser's own implementation without this file.
if (!globalThis.crypto.subtle) Object.defineProperty(globalThis.crypto, 'subtle', { configurable: true, value: webcrypto.subtle });
