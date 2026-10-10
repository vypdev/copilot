import sodium from 'libsodium-wrappers';

/** GitHub accepts libsodium sealed boxes; never construct or truncate the nonce manually. */
export async function encryptSecret(value: string, base64PublicKey: string): Promise<string> {
    await sodium.ready;
    const publicKey = Buffer.from(base64PublicKey, 'base64');
    if (publicKey.length !== sodium.crypto_box_PUBLICKEYBYTES) {
        throw new Error('GitHub returned an invalid repository public key.');
    }
    return Buffer.from(sodium.crypto_box_seal(Buffer.from(value, 'utf8'), publicKey)).toString('base64');
}
