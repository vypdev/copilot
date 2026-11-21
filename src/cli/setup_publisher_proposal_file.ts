import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, type BigIntStats } from 'node:fs';
import { TextDecoder } from 'node:util';
import { SETUP_PUBLISHER_PROPOSAL_MAX_BYTES, type SetupPublisherProposal } from '../domain/setup_publisher_installation';
import { parseSetupPublisherProposal } from '../application/policies/setup_publisher_installation_policy';

export type SetupPublisherProposalFileFailure = 'unavailable' | 'not-regular' | 'too-large' | 'changed' | 'invalid-utf8' | 'invalid-json' | 'unsupported';
export class SetupPublisherProposalFileError extends Error {
  constructor(readonly reason: SetupPublisherProposalFileFailure) {
    super('The publisher proposal could not be read safely. No installation was started.');
  }
}

/** Read untrusted data before transport. This function grants no installation authority. */
export function readSetupPublisherProposalFile(path: string): SetupPublisherProposal {
  try {
    const initial = lstatSync(path, { bigint: true });
    if (!initial.isFile()) throw new SetupPublisherProposalFileError('not-regular');
    if (initial.size > BigInt(SETUP_PUBLISHER_PROPOSAL_MAX_BYTES)) throw new SetupPublisherProposalFileError('too-large');
    const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    try { return readOpenedProposal(path, initial, fd); }
    finally { closeSync(fd); }
  } catch (error) {
    if (error instanceof SetupPublisherProposalFileError) throw error;
    throw new SetupPublisherProposalFileError((error as NodeJS.ErrnoException).code === 'ELOOP' ? 'not-regular' : 'unavailable');
  }
}

function readOpenedProposal(path: string, initial: BigIntStats, fd: number): SetupPublisherProposal {
  const opened = fstatSync(fd, { bigint: true });
  // Some platforms lack O_NOFOLLOW. Never read proposal bytes until the
  // opened descriptor and a second lstat both identify the original file.
  if (!sameFile(initial, opened) || !sameFile(initial, lstatSync(path, { bigint: true }))) {
    throw new SetupPublisherProposalFileError('changed');
  }
  const bytes = Buffer.alloc(SETUP_PUBLISHER_PROPOSAL_MAX_BYTES + 1);
  let size = 0;
  while (size < bytes.length) {
    const count = readSync(fd, bytes, size, bytes.length - size, size);
    if (count === 0) break;
    size += count;
  }
  if (size > SETUP_PUBLISHER_PROPOSAL_MAX_BYTES) throw new SetupPublisherProposalFileError('too-large');
  if (!sameFile(opened, fstatSync(fd, { bigint: true })) || !sameFile(opened, lstatSync(path, { bigint: true }))) {
    throw new SetupPublisherProposalFileError('changed');
  }
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, size)); }
  catch { throw new SetupPublisherProposalFileError('invalid-utf8'); }
  let proposal: unknown;
  try { proposal = JSON.parse(text); }
  catch { throw new SetupPublisherProposalFileError('invalid-json'); }
  try { return parseSetupPublisherProposal(proposal); }
  catch { throw new SetupPublisherProposalFileError('unsupported'); }
}

function sameFile(expected: BigIntStats, observed: BigIntStats): boolean {
  return observed.isFile() && expected.dev === observed.dev && expected.ino === observed.ino && expected.size === observed.size
    && expected.mtimeNs === observed.mtimeNs && expected.ctimeNs === observed.ctimeNs;
}
