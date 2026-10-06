import sodium from 'libsodium-wrappers';
import { encryptSecret } from '../github_secret_encryption';

describe('GitHub Secret encryption interoperability', () => {
    test.each(['fixture-secret', 'credencial áé 日本語', ''])('decrypts a sealed box with the recipient key: %s', async value => {
        await sodium.ready;
        const keys = sodium.crypto_box_keypair();
        const encrypted = await encryptSecret(value, Buffer.from(keys.publicKey).toString('base64'));
        const bytes = Buffer.from(encrypted, 'base64');
        expect(bytes.length).toBe(Buffer.byteLength(value) + sodium.crypto_box_SEALBYTES);
        expect(Buffer.from(sodium.crypto_box_seal_open(bytes, keys.publicKey, keys.privateKey)).toString('utf8')).toBe(value);
    });

    test('uses a fresh ephemeral key and rejects another recipient', async () => {
        await sodium.ready;
        const keys = sodium.crypto_box_keypair();
        const other = sodium.crypto_box_keypair();
        const key = Buffer.from(keys.publicKey).toString('base64');
        const first = await encryptSecret('same value', key);
        expect(await encryptSecret('same value', key)).not.toBe(first);
        expect(() => sodium.crypto_box_seal_open(Buffer.from(first, 'base64'), other.publicKey, other.privateKey)).toThrow();
    });

    test.each(['', Buffer.alloc(31).toString('base64'), Buffer.alloc(33).toString('base64')])('rejects an invalid public key', async key => {
        await expect(encryptSecret('sensitive-value', key)).rejects.toThrow('invalid repository public key');
    });
});
