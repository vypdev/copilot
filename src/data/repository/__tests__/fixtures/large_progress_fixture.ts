import { ProgressDiffRepository } from '../../progress_diff_repository';
import { objectFixture, BASE, HEAD, MERGE_BASE, blobSha, type FileMap } from './progress_object_fixture';
import type { GithubBranchComparisonClient } from '../../../../infrastructure/github/ports/github_branch_provider_ports';

/** Authored source only: real workload geometry, without private consumer text. */
export function largeProgressFixture(corruptLast = false) {
  const paths = Array.from({ length: 140 }, (_, index) => index === 0 ? 'specs/verification-registry.md'
    : index < 100 ? `specs/capability-${index}.md` : `docs/verification-${index}.md`);
  const contents: FileMap = {};
  const row = '| R1 | Preserve the complete specification package | source-only; execution not attested |\n';
  const text = (path: string, bytes: number) => {
    const prefix = '# ' + path + '\n\n## Requirements and architecture\n\n';
    const suffix = '\nEND-' + path;
    const remaining = bytes - prefix.length - suffix.length;
    return prefix + row.repeat(Math.ceil(remaining / row.length)).slice(0, remaining) + suffix;
  };
  const patchPrefix = '@@ -0,0 +1 @@\n+';
  const urls = { blob_url: 'UNFOLLOWED_FIXTURE_URL', raw_url: 'UNFOLLOWED_FIXTURE_URL', contents_url: 'UNFOLLOWED_FIXTURE_URL' };
  const files = paths.map((filename, index) => {
    if (index < 85) {
      const size = index === 0 ? 1_106_150 : index === 84 ? 39_764 : 39_765;
      contents[filename] = text(filename, size);
      return { ...urls, filename, status: 'added', additions: 0, deletions: 0, changes: 0, patch: undefined };
    }
    const size = 18_833 + (index < 91 ? 1 : 0);
    const phrase = 'Specification and verification source for ' + filename + '. No execution attestation. ';
    const line = phrase.repeat(Math.ceil((size - patchPrefix.length) / phrase.length)).slice(0, size - patchPrefix.length);
    contents[filename] = line;
    return { ...urls, filename, status: 'added', additions: 1, deletions: 0, changes: 1, patch: patchPrefix + line };
  });
  const objects = objectFixture({}, contents);
  if (corruptLast) objects.blobs.get(blobSha(Buffer.from(contents[paths[84]] as string)))!.content = Buffer.from('CORRUPT_OWNED_FIXTURE').toString('base64');
  const compareCommits = jest.fn(async () => ({ data: {
    base_commit: { sha: BASE }, merge_base_commit: { sha: MERGE_BASE },
    ahead_by: 1, behind_by: 0, total_commits: 1, files, commits: [],
  } }));
  const repository = new ProgressDiffRepository({ getClient: () => ({ rest: { repos: { compareCommits } } }) } as { getClient(token: string): GithubBranchComparisonClient }, { getClient: () => objects.client });
  return { ...objects, paths, contents, files, compareCommits, read: () => repository.getDiff('fixture', 'specifications', BASE, HEAD, 'OWNED_FIXTURE_TOKEN') };
}
