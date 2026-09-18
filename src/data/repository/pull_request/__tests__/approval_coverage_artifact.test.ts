import { deflateRawSync } from 'node:zlib';
import { parseApprovalCoverageZip } from '../approval_coverage_artifact';

const attestation = {
  version: 1, repositoryId: 1, pullNumber: 42, headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40),
  workflowRunId: 100, workflowRunAttempt: 2, coveredChangedLines: 8, totalChangedLines: 10,
};

function zip(value: unknown, name = 'copilot-diff-coverage.json', method: 0 | 8 = 8): Buffer {
  const fileName = Buffer.from(name);
  const raw = Buffer.from(JSON.stringify(value));
  const data = method === 8 ? deflateRawSync(raw) : raw;
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(fileName.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(fileName.length, 28);
  const offset = local.length + fileName.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + fileName.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([local, fileName, data, central, fileName, eocd]);
}

describe('bounded numeric coverage artifact', () => {
  it.each([0, 8] as const)('parses a single safe JSON file with ZIP method %s', method => {
    expect(parseApprovalCoverageZip(zip(attestation, undefined, method))).toEqual(attestation);
  });
  it('rejects an unexpected path and unknown schema fields', () => {
    expect(parseApprovalCoverageZip(zip(attestation, '../coverage.json'))).toBeUndefined();
    expect(parseApprovalCoverageZip(zip({ ...attestation, token: 'must-not-be-consumed' }))).toBeUndefined();
  });
  it('rejects impossible line counts', () => {
    expect(parseApprovalCoverageZip(zip({ ...attestation, coveredChangedLines: 11 }))).toBeUndefined();
  });
  it('rejects oversized archives and broken central directories', () => {
    expect(parseApprovalCoverageZip(Buffer.alloc(65_537))).toBeUndefined();
    expect(parseApprovalCoverageZip(Buffer.from('not a ZIP'))).toBeUndefined();
  });
});
