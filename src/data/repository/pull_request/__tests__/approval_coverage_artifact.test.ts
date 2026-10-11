import { approvalCoverageZip as zip } from './fixtures/approval_coverage_zip_fixture';
import { parseApprovalCoverageZip } from '../approval_coverage_artifact';

const attestation = {
  version: 1, repositoryId: 1, pullNumber: 42, headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40),
  workflowRunId: 100, workflowRunAttempt: 2, coveredChangedLines: 8, totalChangedLines: 10,
};


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
