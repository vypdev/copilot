import { createHash } from 'node:crypto';
import type { CenterFrameFingerprint } from '../../src/adapters/browser/center_frame_fingerprint.ts';
import { centerFrameText } from '../../src/domain/center_delivery.ts';

/** Actual SHA-256 with deterministic microtask completion for adapter scheduling tests. */
export const fixtureFrameFingerprint: CenterFrameFingerprint = async value => createHash('sha256').update(centerFrameText(value)!).digest('hex');
