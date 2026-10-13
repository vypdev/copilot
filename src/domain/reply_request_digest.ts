import { createHash } from 'node:crypto';

/** Private complete request witness; public reply-marker identities stay unchanged. */
export function replyRequestBodyDigest(body: string): string {
    return createHash('sha256').update(body, 'utf8').digest('hex');
}
